/* =========================================================================
   Sync orchestrator — assembles the unified client list from HubSpot
   acquisition data (Closed Won deals in Direct/Indirect pipelines), enriched
   with Intercom support signals and Metabase usage, then computes a health
   score. Each won deal seeds a `new_business` ARR event; the client's ARR is
   the running balance of its ledger. In-app ARR events (renewal/expansion/…)
   are preserved across syncs. Persists to the database when configured.
   ========================================================================= */

import type {
  ArrEvent,
  Client,
  Deal,
  PropertyDefinition,
  SupportSummary,
  UsageMetrics,
} from "@/lib/types";
import { HubSpotClient, deriveReferralSource, normalizeChannelValue, type HubspotCompany, type HubspotOwner } from "@/lib/integrations/hubspot";
import { MetabaseClient } from "@/lib/integrations/metabase";
import { deriveComponents } from "@/lib/metrics/derive";
import { buildHealth } from "@/lib/metrics/health";
import { arrAsOf, deriveClientArr, periodBounds, currentQuarter, withRunningBalance } from "@/lib/metrics/arr";
import { env, integrations, hasDatabase } from "@/lib/config";

export interface SyncResult {
  ok: boolean;
  clientCount: number;
  dealCount: number;
  dealEventCount: number;
  persisted: boolean;
  incremental: boolean;
  lastSyncedAt: string | null;
  sources: { hubspot: boolean; intercom: boolean; metabase: boolean };
  warnings: string[];
  /** True when this call didn't run at all because another sync (cron or a
   *  manual "Sync now") was already in progress. Not an error. */
  skipped?: boolean;
}

export interface SyncBundle {
  clients: Client[];
  deals: Deal[];
  arrEvents: ArrEvent[]; // hubspot-sourced new_business events only
}

export async function buildUnifiedData(opts?: { sinceDate?: string }): Promise<{ bundle: SyncBundle; warnings: string[] }> {
  const warnings: string[] = [];

  const hs = new HubSpotClient();
  if (!hs.configured) throw new Error("HUBSPOT_ACCESS_TOKEN is required to sync the client list.");

  const [acquisition, owners] = await Promise.all([
    hs.fetchAcquisition(opts?.sinceDate),
    hs.fetchOwners().catch((e) => {
      warnings.push(`HubSpot owners lookup failed: ${e}`);
      return new Map<string, HubspotOwner>();
    }),
  ]);
  warnings.push(...acquisition.warnings);
  const companies = acquisition.companies;

  // --- Intercom support/SLA data is no longer fetched here. It's a
  // dedicated daily job (lib/support/sync.ts, /api/cron/intercom-sync) —
  // Intercom's full-export endpoints are too heavy to re-pull every 4 hours,
  // and SLA breach evaluation needs the ticket data fresh at most once a day.
  // assembleClient() below always seeds a brand-new client with emptySupport();
  // upsertClient()/upsertClientFull() explicitly exclude `support` from their
  // UPDATE set so this 4-hourly sync never overwrites the daily job's data on
  // an already-existing client.

  // --- Metabase: usage keyed by domain / hubspot id -----------------------
  // This is the OLD single-card usage fetch (METABASE_USAGE_CARD_ID), superseded
  // by the per-client, per-environment pipeline in lib/usage/index.ts (native
  // SQL against the real Metabase DBs — see the Usage tab), which needs no
  // saved card at all. Kept only for backward compatibility if a card id is
  // ever configured; skipped silently otherwise so it stops reporting a
  // "failure" for a legacy field the app no longer depends on.
  const usageByKey = new Map<string, Partial<UsageMetrics> & { seats: number; activeUsers: number }>();
  if (integrations.metabase() && env.metabaseUsageCardId) {
    try {
      const mb = new MetabaseClient();
      for (const r of await mb.fetchUsageRows()) usageByKey.set(r.key.toLowerCase(), r.metrics);
    } catch (e) {
      warnings.push(`Metabase usage fetch failed: ${e}`);
    }
  }

  // --- Assemble clients + all associated objects ---------------------------
  const now = new Date().toISOString();
  const quarterStart = periodBounds(currentQuarter()).start;

  const deals: Deal[] = [];
  const arrEvents: ArrEvent[] = [];

  const clients = companies.map((co) => {
    const events = buildHubspotEvents(co, now);
    arrEvents.push(...events);

    // Deal objects (one per won deal)
    for (const d of co.wonDeals) {
      // Account Executive = the deal's OWN account_executive property, never
      // the company's generic hubspot_owner_id (co.ownerId) — that's a
      // different field entirely (often a CSM or salesperson assigned on the
      // company record, not necessarily this deal's AE). Using co.ownerId
      // here was a real bug: because upsertClientDeals inserts a deal row
      // once and never overwrites it (onConflictDoNothing), a deal that got
      // its AE from this WRONG source on its first sync kept it wrong
      // forever — the correct value from fetchClientEngagement's own
      // account_executive lookup could never win the race to be written first.
      const owner = d.accountExecutiveOwnerId ? owners.get(d.accountExecutiveOwnerId) : undefined;
      deals.push({
        id: `hs-deal-${d.id}`,
        clientId: co.id,
        hubspotDealId: d.id,
        name: d.name,
        amount: d.amount,
        closeDate: d.closeDate ? `${d.closeDate}T00:00:00.000Z` : null,
        pipeline: d.pipeline,
        referralSource: deriveReferralSource(d),
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        hubspotUrl: `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID ?? ""}/record/0-3/${d.id}`,
        createdAt: now,
      });
    }

    return assembleClient(co, events, quarterStart, owners, usageByKey);
  });

  return {
    bundle: { clients, deals, arrEvents },
    warnings,
  };
}

/**
 * Pull the FULL engagement footprint (contacts, emails, meetings) for EVERY
 * tracked company — from the company itself AND its contacts, not just deals —
 * plus each company's Closed Won deals, and persist them. Runs over the whole
 * client set each time. Contacts/emails/meetings are refreshed from HubSpot on
 * every run; deals are recorded only the first time they're seen (see
 * upsertClientDeals) — a CSM's __deal_overrides are the only way a deal's
 * properties change after that.
 *
 * Companies are de-duplicated by HubSpot id to a single canonical client row,
 * preferring the `import`-sourced row (the CS team's curated list) when both an
 * import and a hubspot row exist — so all data lands on the row users browse.
 */
export async function syncClientEngagement(): Promise<{ contacts: number; emails: number; meetings: number; deals: number }> {
  const empty = { contacts: 0, emails: 0, meetings: 0, deals: 0 };
  const hs = new HubSpotClient();
  if (!hs.configured || !hasDatabase()) return empty;

  const { getClientsFromDb, persistEngagement } = await import("@/lib/repo/drizzle");
  const clients = await getClientsFromDb();

  // HubSpot companyId → canonical clientId. When a company has both an import
  // row and a hubspot row, the import row wins (it's what the CS team curates
  // and navigates); otherwise the only row is used.
  const companyToClient = new Map<string, string>();
  for (const c of clients) {
    if (!c.hubspotId) continue;
    const existing = companyToClient.get(c.hubspotId);
    if (!existing || c.source === "import") companyToClient.set(c.hubspotId, c.id);
  }
  if (companyToClient.size === 0) return empty;

  const engagement = await hs.fetchClientEngagement(companyToClient);
  await persistEngagement(engagement);
  // Keep our select-property option lists in lockstep with HubSpot. Non-fatal:
  // a schema-scope gap or missing property must never break the engagement sync.
  try {
    await reconcileDealSelectOptions(hs, engagement.deals);
  } catch (e) {
    console.warn(`[sync] deal-select option reconciliation failed: ${e}`);
  }
  return {
    contacts: engagement.contacts.length,
    emails: engagement.emails.length,
    meetings: engagement.meetings.length,
    deals: engagement.deals.length,
  };
}

/**
 * Deal-level HubSpot picklist fields → the property definition that backs their
 * inline editor on the deal card. `defKey` matches DEAL_FIELD_OPTION_KEYS so the
 * editor reads its options from here; `dealField` is the synced Deal value used
 * to top up options with anything HubSpot's schema didn't return.
 */
const DEAL_SELECT_DEFS: {
  hubspotProp: string;
  defKey: string;
  dealField: keyof Deal;
  label: string;
  type: PropertyDefinition["type"];
  group: PropertyDefinition["group"];
  sortOrder: number;
}[] = [
  { hubspotProp: "account_executive", defKey: "deal_account_executive", dealField: "ownerName", label: "Account Executive", type: "single_select", group: "engagement", sortOrder: 90 },
  { hubspotProp: "modules", defKey: "deal_modules", dealField: "products", label: "Module", type: "multi_select", group: "product", sortOrder: 100 },
  { hubspotProp: "use_cases", defKey: "deal_use_cases", dealField: "useCases", label: "Use Case (Deal)", type: "multi_select", group: "product", sortOrder: 110 },
  { hubspotProp: "global_libraries", defKey: "deal_global_libraries", dealField: "globalLibraryPackage", label: "Global Library (Deal)", type: "multi_select", group: "product", sortOrder: 120 },
  { hubspotProp: "support_level", defKey: "deal_support_level", dealField: "supportLevel", label: "Support Level", type: "single_select", group: "contract", sortOrder: 100 },
  { hubspotProp: "implementation_level", defKey: "deal_implementation_level", dealField: "implementationLevel", label: "Implementation Level", type: "single_select", group: "contract", sortOrder: 110 },
];

/**
 * Reconcile select-property option lists after an engagement pull:
 *   1. Deal picklists (modules/use cases/global libraries/support & impl level):
 *      options = live HubSpot picklist ∪ values stored on the synced deals, all
 *      normalized so near-duplicates ("Future X" vs "FutureX") collapse. The
 *      definition is created with its true multi_select / single_select type.
 *   2. Acquisition Channel (referral_source): newly-seen derived values are
 *      unioned into the existing option list (never replacing it).
 */
async function reconcileDealSelectOptions(hs: HubSpotClient, deals: Deal[]): Promise<void> {
  const { upsertPropertyDefinitionOptions, addPropertyOption } = await import("@/lib/repo/drizzle");

  for (const def of DEAL_SELECT_DEFS) {
    let hubspotOpts: string[] = [];
    try {
      hubspotOpts = await hs.fetchDealPropertyOptions(def.hubspotProp);
    } catch {
      // Property absent or no crm.schemas.deals.read scope — fall back to the
      // values already stored on deals so the editor still offers real choices.
    }
    const seen = new Set<string>();
    const options: string[] = [];
    const add = (raw: unknown) => {
      const v = normalizeChannelValue(String(raw ?? ""));
      if (!v || seen.has(v)) return;
      seen.add(v);
      options.push(v);
    };
    hubspotOpts.forEach(add);
    for (const d of deals) {
      const val = (d as unknown as Record<string, unknown>)[def.dealField as string];
      if (Array.isArray(val)) val.forEach(add);
      else add(val);
    }
    if (options.length === 0) continue;
    await upsertPropertyDefinitionOptions({
      key: def.defKey,
      label: def.label,
      type: def.type,
      options,
      hiddenOptions: [],
      group: def.group,
      sortOrder: def.sortOrder,
      isSystem: true,
      isReadOnly: true,
    });
  }

  // Acquisition Channel — add any freshly-derived value not already an option.
  const referral = new Set<string>();
  for (const d of deals) {
    if (d.referralSource) referral.add(normalizeChannelValue(d.referralSource));
  }
  for (const v of referral) {
    if (!v) continue;
    try {
      await addPropertyOption("referral_source", v);
    } catch {
      // referral_source definition may not be seeded yet — safe to skip.
    }
  }
}

/**
 * Runs a sync, guarded so a manual "Sync now" click can never overlap the
 * scheduled cron tick (or a second manual click) — both would re-fetch the
 * same HubSpot window and race recomputeClient for the same clients. See
 * acquireSyncLock()'s own comment for why this is a DB row lock, not
 * pg_advisory_lock (doesn't reliably hold over a transaction-mode pooler).
 */
export async function runSync(): Promise<SyncResult> {
  const emptySources = { hubspot: integrations.hubspot(), intercom: integrations.intercom(), metabase: integrations.metabase() };
  if (hasDatabase()) {
    const { acquireSyncLock } = await import("@/lib/repo/drizzle");
    const acquired = await acquireSyncLock();
    if (!acquired) {
      return {
        ok: false,
        clientCount: 0,
        dealCount: 0,
        dealEventCount: 0,
        persisted: false,
        incremental: true,
        lastSyncedAt: null,
        sources: emptySources,
        warnings: ["Sync already running — skipped this trigger."],
        skipped: true,
      };
    }
    try {
      return await runSyncInner();
    } finally {
      const { releaseSyncLock } = await import("@/lib/repo/drizzle");
      await releaseSyncLock();
    }
  }
  return runSyncInner();
}

async function runSyncInner(): Promise<SyncResult> {
  const sources = { hubspot: integrations.hubspot(), intercom: integrations.intercom(), metabase: integrations.metabase() };
  const syncStartedAt = new Date().toISOString();

  // Checkpoint-based incremental sync: only fetch deals modified since the last
  // successful run. On first run (no checkpoint), skip the historical
  // acquisition import (just set the checkpoint) — but still run the engagement
  // pull over any clients already present.
  let lastSyncedAt: string | null = null;
  let firstRun = false;
  if (hasDatabase()) {
    const { getSyncCheckpoint } = await import("@/lib/repo/drizzle");
    lastSyncedAt = await getSyncCheckpoint("last_synced_at");
    firstRun = !lastSyncedAt;
  }

  // 1h safety buffer on the "since" lower bound — HubSpot's CRM Search API
  // (what fetchWonDeals filters against) is eventually consistent, so a deal
  // write landing just before this run's fetch executes can be missed if the
  // search index hasn't caught up yet. Without a buffer, the checkpoint still
  // advances to this run's start time regardless, and since it's a hard GTE
  // lower bound that only moves forward, that deal's true hs_lastmodifieddate
  // would then be permanently excluded from every future run. Re-fetching an
  // extra hour of "since" window is harmless — persistSync/upsertClient are
  // idempotent upserts, so reprocessing an already-seen deal is a no-op.
  const SYNC_CHECKPOINT_BUFFER_MS = 60 * 60 * 1000;
  const bufferedSinceDate = lastSyncedAt
    ? new Date(new Date(lastSyncedAt).getTime() - SYNC_CHECKPOINT_BUFFER_MS).toISOString()
    : undefined;

  const emptyBundle: SyncBundle = { clients: [], deals: [], arrEvents: [] };
  const { bundle, warnings } = firstRun
    ? { bundle: emptyBundle, warnings: ["Sync checkpoint initialized. The app will pick up new Closed Won deals from now forward."] }
    : await buildUnifiedData({ sinceDate: bufferedSinceDate });

  let persisted = false;
  let engagement = { contacts: 0, emails: 0, meetings: 0, deals: 0 };

  if (hasDatabase()) {
    const { persistSync, setSyncCheckpoint } = await import("@/lib/repo/drizzle");
    let newClientIds: string[] = [];
    if (!firstRun) {
      const res = await persistSync(bundle);
      newClientIds = res.newClientIds;
    }
    try {
      engagement = await syncClientEngagement();
    } catch (e) {
      warnings.push(`Engagement sync failed: ${e}`);
    }
    // Auto-assign CSM + Implementation owners for BRAND-NEW clients only
    // (new business). Renewals/expansions land on existing clients and keep
    // their owners. Failures here must not fail the sync.
    if (newClientIds.length > 0) {
      try {
        const { runAssignment } = await import("@/lib/assignment/run");
        const s = await runAssignment(newClientIds);
        warnings.push(
          `Assignment: ${s.csmAssigned} CSM + ${s.implAssigned} implementation owners assigned across ${s.processed} new clients` +
            (s.needsAdmin || s.noCandidates ? ` (${s.needsAdmin + s.noCandidates} need a manual choice)` : "") + ".",
        );
      } catch (e) {
        warnings.push(`Auto-assignment failed: ${e}`);
      }
    }
    await setSyncCheckpoint("last_synced_at", syncStartedAt);
    persisted = true;
  } else {
    warnings.push("DATABASE_URL not set — sync ran as a dry run (nothing persisted).");
  }

  warnings.push(
    `Engagement synced: ${engagement.contacts} contacts, ${engagement.emails} emails, ${engagement.meetings} meetings, ${engagement.deals} won deals.`,
  );

  return {
    ok: true,
    clientCount: bundle.clients.length,
    dealCount: bundle.deals.length,
    dealEventCount: bundle.arrEvents.length,
    persisted,
    incremental: true,
    lastSyncedAt: syncStartedAt,
    sources,
    warnings,
  };
}

/* --------------------------------------------------------------- assembly */

/** One `new_business` ledger event per Closed Won deal (deduped by deal id). */
function buildHubspotEvents(co: HubspotCompany, now: string): ArrEvent[] {
  const events: ArrEvent[] = co.wonDeals.map((d) => {
    const eff = d.closeDate ?? (co.startedAt ? co.startedAt.slice(0, 10) : now.slice(0, 10));
    return {
      id: `hs-deal-${d.id}`,
      clientId: co.id,
      type: "new_business" as const,
      amount: d.amount,
      arr: 0, // set by withRunningBalance
      effectiveDate: eff,
      renewalDate: d.closeDate ? addYear(d.closeDate) : co.renewalDate,
      source: "hubspot" as const,
      externalId: d.id,
      note: d.name ? `${d.pipeline === "direct" ? "Direct" : "Indirect"} Sales — ${d.name}` : `${d.pipeline} sales closed won`,
      createdBy: "HubSpot sync",
      createdAt: now,
    };
  });
  return withRunningBalance(events);
}

function addYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function assembleClient(
  co: HubspotCompany,
  events: ArrEvent[],
  quarterStart: string,
  owners: Map<string, HubspotOwner>,
  usageByKey: Map<string, Partial<UsageMetrics> & { seats: number; activeUsers: number }>,
): Client {
  // Support/SLA data is filled in by the daily Intercom sync (lib/support/sync.ts),
  // never here — see the comment above buildUnifiedData's Metabase block. A
  // brand-new client starts empty until that job's next run picks it up.
  const support = emptySupport();

  const usagePartial =
    (co.domain ? usageByKey.get(co.domain.toLowerCase()) : undefined) ?? usageByKey.get(co.id.toLowerCase());
  const usage = mergeUsage(usagePartial);

  // Materialize ARR from the ledger — no hardcoded year logic.
  const derived = deriveClientArr(events);
  const arr = derived.arr;
  const previousArr = arrAsOf(events, quarterStart);
  const renewalDate = derived.renewalDate ?? co.renewalDate;
  const daysToRenewal = renewalDate ? Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86_400_000) : null;

  const components = deriveComponents({ support, usage, hasCsm: false, daysToRenewal, tags: [] });
  const health = buildHealth(components, { trend: 0, updatedAt: new Date().toISOString() });

  return {
    id: co.id,
    hubspotId: co.id,
    source: "hubspot",
    name: co.name,
    domain: co.domain,
    country: co.country,
    industry: co.industry,
    employees: co.employees,
    customerType: "arr",
    // Transient seed only — persistSync() calls recomputeClient() right after
    // upsertClient(), which immediately overwrites this with the real,
    // deal-derived lifecycle status (see lib/status.ts). "onboarding" is the
    // correct look for a brand-new company before its deals are persisted.
    status: "onboarding",
    // CSM and Implementation owners are NO LONGER derived from HubSpot — they
    // are assigned in-app by the assignment workflow (for brand-new clients) or
    // by a super-admin. A new client inserts unassigned; the workflow fills it.
    csm: null,
    csmSource: null,
    implementationOwner: null,
    implementationOwnerSource: null,
    currency: "USD",
    arr,
    previousArr,
    startedAt: derived.startedAt ?? co.startedAt,
    renewalDate,
    churnedAt: derived.churnedAt,
    segment: co.employees != null && co.employees >= 250 ? "enterprise" : co.employees != null && co.employees >= 50 ? "mid_market" : "smb",
    logoUrl: null,
    hubspotUrl: co.id ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID ?? ""}/record/0-2/${co.id}` : undefined,
    health,
    support,
    usage,
    tags: [],
    // referral_source / closed_won_date_prop are derived from the full deal
    // history in persistSync (recomputeClientReferral); the merge-upsert leaves
    // any import/admin-set properties untouched.
    properties: {},
  };
}

function mergeUsage(p?: Partial<UsageMetrics> & { seats: number; activeUsers: number }): UsageMetrics {
  const base = emptyUsage();
  if (!p) return base;
  const seats = p.seats ?? base.seats;
  const activeUsers = p.activeUsers ?? base.activeUsers;
  const wau = p.wau ?? base.wau;
  const mau = p.mau ?? activeUsers;
  return {
    seats,
    activeUsers,
    wau,
    mau,
    adoptionRate: p.adoptionRate ?? (seats > 0 ? activeUsers / seats : 0),
    stickiness: p.stickiness ?? (mau > 0 ? wau / mau : 0),
    lastActiveAt: p.lastActiveAt ?? null,
    featureAdoption: p.featureAdoption ?? [],
    activityTrend: p.activityTrend ?? [],
  };
}

function emptySupport(): SupportSummary {
  return { openTickets: 0, snoozedTickets: 0, closedLast30d: 0, oldestOpenDays: null, medianFirstResponseHours: null, csat: null, csatScale: "percent", csatResponses: 0, nps: null, npsResponses: 0, lastConversationAt: null, supportLevelUsed: null, slaBreaches: [] };
}
function emptyUsage(): UsageMetrics {
  return { seats: 0, activeUsers: 0, adoptionRate: 0, wau: 0, mau: 0, stickiness: 0, lastActiveAt: null, featureAdoption: [], activityTrend: [] };
}
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
