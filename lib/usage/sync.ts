/* =========================================================================
   Batch usage sync — refreshes every tracked client's Metabase usage
   snapshot and persists it to Postgres (client_usage_snapshots). Driven by
   the 4-hourly cron at /api/cron/usage-sync, mirroring the HubSpot sync's
   cadence (/api/cron/sync, see vercel.json). Runs with limited concurrency
   since each client costs 3 Metabase queries.
   ========================================================================= */

import "server-only";
import { syncOneClientUsage } from "@/lib/usage";

export interface UsageSyncSummary {
  total: number; // candidate clients (have a HubSpot company link)
  synced: number;
  skipped: number; // no Mixpanel id yet, or Metabase not configured — not an error
  failed: number;
  warnings: string[]; // "<client name> (<id>): <reason>", capped
  durationMs: number;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const MAX_WARNINGS = 25;
const CONCURRENCY = 5;

/** Refresh every client that has a HubSpot company link (the only ones that
 *  could possibly resolve to a Metabase environment). Never throws — a
 *  per-client failure is recorded on that client's row and counted, but
 *  doesn't stop the rest of the batch. */
export async function syncAllClientUsage(): Promise<UsageSyncSummary> {
  const start = Date.now();
  const { getClientsFromDb } = await import("@/lib/repo/drizzle");
  const clients = (await getClientsFromDb()).filter((c) => !!c.hubspotId);

  const summary: UsageSyncSummary = { total: clients.length, synced: 0, skipped: 0, failed: 0, warnings: [], durationMs: 0 };

  await mapLimit(clients, CONCURRENCY, async (c) => {
    const result = await syncOneClientUsage(c.id);
    if (result.outcome === "synced") summary.synced++;
    else if (result.outcome === "skipped") summary.skipped++;
    else {
      summary.failed++;
      if (summary.warnings.length < MAX_WARNINGS) summary.warnings.push(`${c.name} (${c.id}): ${result.reason}`);
    }
  });

  summary.durationMs = Date.now() - start;
  return summary;
}
