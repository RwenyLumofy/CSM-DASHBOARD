/* =========================================================================
   Daily Intercom support+SLA sync — refreshes every tracked client's
   Intercom support snapshot AND checks its open tickets against the SLA
   table for its resolved support level, persisting both to client.support.
   Driven by the daily cron at /api/cron/intercom-sync (see vercel.json),
   deliberately separate from the 4-hourly HubSpot sync — Intercom's export
   endpoints (companies/contacts/conversations) are too heavy to re-pull
   every 4 hours, and this is the only place `support` is ever written now
   (upsertClient/upsertClientFull explicitly exclude that column).

   Conversations are ALWAYS fetched in full (no incremental "since" window)
   — every run recomputes SupportSummary (including CSAT) from the complete
   conversation history, not just what changed. This was NOT always true:
   an earlier incremental design fetched only open + recently-updated
   conversations after the first backfill, which silently and permanently
   dropped historical ratings from CSAT the moment a closed, rated
   conversation aged out of the window (found + fixed 2026-07-07 — CSAT is
   a lifetime metric here, not a rolling one, so it can't be computed from
   a shrinking slice). At this workspace's current scale (~500 conversations)
   a full fetch is a handful of paginated requests and comfortably inside
   this route's maxDuration; the checkpoint below is kept only so
   /api/sync can report when this last ran, not to bound what gets fetched.
   ========================================================================= */

import "server-only";
import { HubSpotClient } from "@/lib/integrations/hubspot";
import { IntercomClient, summarizeSupport, type IntercomConversation } from "@/lib/integrations/intercom";
import { checkTicketSla, resolveAccountSupportLevel, buildConversationUrl } from "@/lib/sla";
import { dealOverridesMap, applyDealOverrides } from "@/lib/deal-overrides";
import type { Client, Deal, SlaBreach, SupportSummary, SupportTicket } from "@/lib/types";
import { integrations } from "@/lib/config";
import { withDbTimeout } from "@/lib/db/client";

export interface SupportSyncSummary {
  total: number; // candidate clients (have a HubSpot company link)
  synced: number;
  skipped: number; // no Intercom match found — not an error
  failed: number;
  breachesFound: number; // total SLA breach records written across all clients
  warnings: string[]; // capped
  durationMs: number;
  fullBackfill: boolean;
}

const CHECKPOINT_KEY = "last_intercom_synced_at";
const MAX_WARNINGS = 25;
const CONCURRENCY = 5;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function groupDeals(allDeals: Deal[]): Map<string, Deal[]> {
  const m = new Map<string, Deal[]>();
  for (const d of allDeals) {
    const arr = m.get(d.clientId);
    if (arr) arr.push(d);
    else m.set(d.clientId, [d]);
  }
  return m;
}

export async function syncAllClientSupport(): Promise<SupportSyncSummary> {
  const start = Date.now();
  const empty = (warnings: string[], fullBackfill = false): SupportSyncSummary => ({
    total: 0, synced: 0, skipped: 0, failed: 0, breachesFound: 0, warnings, durationMs: Date.now() - start, fullBackfill,
  });

  if (!integrations.intercom()) return empty(["Intercom not configured — skipped."]);

  const {
    getSyncCheckpoint,
    setSyncCheckpoint,
    getClientsFromDb,
    getAllDealsFromDb,
    setClientSupportDb,
  } = await import("@/lib/repo/drizzle");

  const lastSyncedAt = await withDbTimeout(getSyncCheckpoint(CHECKPOINT_KEY));
  const fullBackfill = !lastSyncedAt;
  const syncStartedAt = new Date().toISOString();

  const ic = new IntercomClient();
  const hs = new HubSpotClient();

  let icCompanies, contactIndex, conversations, appId;
  try {
    // Always the full, unconditional history (no updatedSinceDays) — see the
    // module comment above for why: CSAT/ratings are lifetime metrics and
    // recomputing them from an incremental slice silently loses history.
    [icCompanies, contactIndex, conversations, appId] = await Promise.all([
      ic.listCompanies(),
      ic.fetchContactCompanyIndex(),
      ic.searchConversations({}),
      ic.fetchAppId().catch(() => null),
    ]);
  } catch (e) {
    return empty([`Intercom fetch failed: ${e}`], fullBackfill);
  }

  // Same attribute-then-merge-by-key approach as the (now removed) 4-hourly
  // enrichment block — duplicate Intercom company records only ever add
  // conversations to a key, never overwrite/erase another company's data.
  const convByCompany = new Map<string, IntercomConversation[]>();
  for (const conv of conversations) {
    const companyIds = new Set<string>();
    for (const cid of conv.contactIds) for (const co of contactIndex.get(cid) ?? []) companyIds.add(co);
    for (const co of companyIds) {
      const list = convByCompany.get(co) ?? [];
      list.push(conv);
      convByCompany.set(co, list);
    }
  }
  const convsByEnvironmentId = new Map<string, IntercomConversation[]>();
  const convsByDomain = new Map<string, IntercomConversation[]>();
  const convsByName = new Map<string, IntercomConversation[]>();
  for (const co of icCompanies) {
    const convs = convByCompany.get(co.id) ?? [];
    if (co.companyId) {
      const key = co.companyId.trim().toLowerCase();
      convsByEnvironmentId.set(key, [...(convsByEnvironmentId.get(key) ?? []), ...convs]);
    }
    if (co.domain) {
      const key = co.domain.toLowerCase();
      convsByDomain.set(key, [...(convsByDomain.get(key) ?? []), ...convs]);
    }
    const nameKey = co.name.toLowerCase();
    convsByName.set(nameKey, [...(convsByName.get(nameKey) ?? []), ...convs]);
  }

  const [clients, allDeals] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    withDbTimeout(getAllDealsFromDb()),
  ]);
  const dealsByClient = groupDeals(allDeals);
  const candidates = clients.filter((c) => !!c.hubspotId);

  const summary: SupportSyncSummary = {
    total: candidates.length, synced: 0, skipped: 0, failed: 0, breachesFound: 0, warnings: [], durationMs: 0, fullBackfill,
  };

  await mapLimit(candidates, CONCURRENCY, async (client: Client) => {
    try {
      let envId: string | null = null;
      try {
        envId = await hs.fetchCompanyMixpanelId(client.hubspotId!);
      } catch {
        // best-effort — fall back to domain/name matching below
      }
      const convs =
        (envId ? convsByEnvironmentId.get(envId.trim().toLowerCase()) : undefined) ??
        (client.domain ? convsByDomain.get(client.domain.toLowerCase()) : undefined) ??
        convsByName.get(client.name.toLowerCase());

      if (!convs) {
        summary.skipped++;
        return;
      }

      const base = summarizeSupport(convs);
      const overrides = dealOverridesMap(client.properties);
      const tracked = (dealsByClient.get(client.id) ?? [])
        .filter((d) => d.tracked !== false)
        .map((d) => applyDealOverrides(d, overrides[d.id]));
      const level = resolveAccountSupportLevel(tracked);

      // Every ticket (open, snoozed, or closed — no age cap), each carrying
      // its own SLA breach status. Open/snoozed tickets are checked as-of
      // now (an ongoing fact); closed tickets are checked as-of when they
      // closed (a fixed, retrospective fact) — see lib/sla.ts's doc comment
      // on checkTicketSla for why this reuses the exact same rule either way.
      const now = new Date();
      const breaches: SlaBreach[] = [];
      const tickets: SupportTicket[] = convs.map((conv) => {
        const asOf = conv.state === "open" || conv.state === "snoozed" ? now : new Date(conv.updatedAt);
        const ticketBreaches = level
          ? checkTicketSla(conv, level, asOf).map((b) => ({ ...b, url: buildConversationUrl(appId, b.conversationId) }))
          : [];
        if (conv.state === "open") breaches.push(...ticketBreaches);
        return {
          id: conv.id,
          state: conv.state,
          priority: conv.priority,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          url: buildConversationUrl(appId, conv.id),
          slaBreaches: ticketBreaches,
        };
      });

      const finalSupport: SupportSummary = { ...base, supportLevelUsed: level, slaBreaches: breaches, tickets };
      await withDbTimeout(setClientSupportDb(client.id, finalSupport));
      summary.synced++;
      summary.breachesFound += breaches.length;
    } catch (e) {
      summary.failed++;
      if (summary.warnings.length < MAX_WARNINGS) summary.warnings.push(`${client.name} (${client.id}): ${e}`);
    }
  });

  await withDbTimeout(setSyncCheckpoint(CHECKPOINT_KEY, syncStartedAt));
  summary.durationMs = Date.now() - start;
  return summary;
}
