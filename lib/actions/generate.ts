/* =========================================================================
   Action generation — the orchestrator that turns a client's readings into
   persisted, AI-worded actions. For each client: assemble the signal inputs,
   detect signals, enrich the wording (Gemini w/ template fallback), then
   reconcile against the DB (insert new, refresh open, auto-resolve cleared,
   respect dismissed). Runs daily via /api/cron/client-actions and on demand
   from the "Regenerate" buttons.
   ========================================================================= */

import "server-only";
import type { Client, Deal } from "@/lib/types";
import { dealOverridesMap, applyDealOverrides, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { getClientUsage } from "@/lib/usage";
import { detectSignals, type SignalInputs } from "@/lib/actions/signals";
import { normalizeStakeholderMappings } from "@/lib/stakeholders";
import { enrichSignals } from "@/lib/actions/enrich";
import { withDbTimeout } from "@/lib/db/client";
import { computeProjectDeadlines } from "@/lib/projects/deadlines";
import type { ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";

export interface ActionGenSummary {
  clients: number;
  actionsUpserted: number;
  durationMs: number;
  ai: boolean;
}

/** Bounded concurrency — same pattern used elsewhere; a daily sweep over ~74
 *  clients each doing a usage read + a Gemini call shouldn't fan out unbounded. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<number>): Promise<number> {
  let cursor = 0;
  // Each worker accumulates its OWN subtotal — a shared `total += await fn()`
  // would race, since the await suspends between reading and writing `total`.
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    let local = 0;
    while (cursor < items.length) {
      const idx = cursor++;
      local += await fn(items[idx]!);
    }
    return local;
  });
  const subtotals = await Promise.all(workers);
  return subtotals.reduce((a, b) => a + b, 0);
}

function stakeholderMappingsOf(client: Client) {
  return normalizeStakeholderMappings(client.properties?.stakeholder_mappings);
}

/** Assemble the pure-function inputs for one client (fetches usage + contacts). */
async function buildInputs(client: Client, trackedDeals: Deal[], dealDates: DealDatesMap, board: ProjectDetail[], config: ProjectConfig): Promise<SignalInputs> {
  const { getContactsByClient } = await import("@/lib/repo/drizzle");
  const [usage, contacts] = await Promise.all([
    getClientUsage(client.id).catch(() => ({ status: "error" as const, message: "usage fetch failed" })),
    getContactsByClient(client.id).catch(() => []),
  ]);
  return { client, trackedDeals, dealDates, usage, contacts, stakeholderMappings: stakeholderMappingsOf(client), projectDeadlines: computeProjectDeadlines(board, config) };
}

/** Detect → enrich → reconcile for one already-loaded client. Returns the
 *  number of open actions written (for the summary). */
async function generateForClient(client: Client, deals: Deal[], board: ProjectDetail[], config: ProjectConfig): Promise<number> {
  const { reconcileClientActionsDb } = await import("@/lib/repo/drizzle");
  const overrides = dealOverridesMap(client.properties);
  const dealDates = (client.properties?.[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {};
  const tracked = deals.filter((d) => d.tracked !== false).map((d) => applyDealOverrides(d, overrides[d.id]));

  const inputs = await buildInputs(client, tracked, dealDates, board, config);
  const signals = detectSignals(inputs);
  const enriched = await enrichSignals(client, inputs.usage, signals);

  await reconcileClientActionsDb(
    client.id,
    enriched.map((s) => ({
      id: `${client.id}:${s.category}:${s.signalKey}`,
      clientId: client.id,
      category: s.category,
      signalKey: s.signalKey,
      priority: s.priority,
      title: s.title,
      insight: s.insight,
      source: s.source,
    })),
  );
  return enriched.length;
}

/** Regenerate one client's actions (used by the per-client "Regenerate"). */
export async function generateActionsForClient(clientId: string): Promise<void> {
  const { getClientByIdFromDb, getDealsByClient } = await import("@/lib/repo/drizzle");
  const { getProjectBoardForClient } = await import("@/lib/repo/projects");
  const { getProjectConfig } = await import("@/lib/projects/data");
  const client = await getClientByIdFromDb(clientId);
  if (!client) return;
  const [deals, board, config] = await Promise.all([
    getDealsByClient(clientId),
    getProjectBoardForClient(clientId).catch(() => [] as ProjectDetail[]),
    getProjectConfig(),
  ]);
  await generateForClient(client, deals, board, config);
}

/** Regenerate actions for a specific set of clients (the visible ones, from
 *  the global "Regenerate" button). */
export async function generateActionsForClients(clientIds: string[]): Promise<ActionGenSummary> {
  const start = Date.now();
  const { integrations } = await import("@/lib/config");
  const { getClientsFromDb, getAllDealsFromDb } = await import("@/lib/repo/drizzle");
  const { getAllProjectBoards } = await import("@/lib/repo/projects");
  const { getProjectConfig } = await import("@/lib/projects/data");
  const idSet = new Set(clientIds);
  const [allClients, allDeals, boardsByClient, config] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    withDbTimeout(getAllDealsFromDb()),
    getAllProjectBoards().catch(() => new Map<string, ProjectDetail[]>()),
    getProjectConfig(),
  ]);
  const clients = allClients.filter((c) => idSet.has(c.id));
  const dealsByClient = groupDeals(allDeals);

  const upserted = await mapLimit(clients, 5, (c) => generateForClient(c, dealsByClient.get(c.id) ?? [], boardsByClient.get(c.id) ?? [], config));
  return { clients: clients.length, actionsUpserted: upserted, durationMs: Date.now() - start, ai: integrations.gemini() };
}

/** The daily cron: regenerate actions for every client. */
export async function generateAllClientActions(): Promise<ActionGenSummary> {
  const start = Date.now();
  const { integrations } = await import("@/lib/config");
  const { getClientsFromDb, getAllDealsFromDb } = await import("@/lib/repo/drizzle");
  const { getAllProjectBoards } = await import("@/lib/repo/projects");
  const { getProjectConfig } = await import("@/lib/projects/data");
  const [clients, allDeals, boardsByClient, config] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    withDbTimeout(getAllDealsFromDb()),
    getAllProjectBoards().catch(() => new Map<string, ProjectDetail[]>()),
    getProjectConfig(),
  ]);
  const dealsByClient = groupDeals(allDeals);

  const upserted = await mapLimit(clients, 5, (c) => generateForClient(c, dealsByClient.get(c.id) ?? [], boardsByClient.get(c.id) ?? [], config));
  return { clients: clients.length, actionsUpserted: upserted, durationMs: Date.now() - start, ai: integrations.gemini() };
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
