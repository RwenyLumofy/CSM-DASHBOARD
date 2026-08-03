/* =========================================================================
   The client-health formula, loaded from and saved to workspace_config.
   Server-only (touches the DB).

   These accessors used to live in lib/assignment/config.ts, next to the CSM
   assignment rules, on the reasoning that both were DB-backed workspace
   settings. That coupling meant the health engine imported the assignment
   module: deleting assignment would have taken the health score with it. The
   pure types and constants stay in health-config.ts so client components can
   import them without pulling this server-only module into their bundle.
   ========================================================================= */

import { hasDatabase } from "@/lib/config";
import { dbHealthy } from "@/lib/db/health";
import { withDbTimeout } from "@/lib/db/client";
import {
  CLIENT_HEALTH_CONFIG_KEY,
  DEFAULT_CLIENT_HEALTH_CONFIG,
  DEFAULT_HEALTH_TIERS,
  HEALTH_METRIC_ORDER,
  type ClientHealthConfig,
  type HealthTierDef,
} from "@/lib/metrics/health-config";

/**
 * The live formula. Always returns every known metric key, in
 * HEALTH_METRIC_ORDER — a config saved before a new metric existed still gets
 * every current key (new ones default to disabled) rather than leaving callers
 * to guard against a missing entry.
 */
export async function getClientHealthConfig(): Promise<ClientHealthConfig> {
  // Read the RAW stored value (not a merge over the default): the tier
  // migration below has to see whether the stored config actually carried
  // `tiers` or the legacy `thresholds`, which a shallow merge would hide by
  // leaking default tiers in.
  const raw = (await readRawConfig(CLIENT_HEALTH_CONFIG_KEY)) as Partial<StoredHealthConfig> | null;
  const metricsSrc = raw?.metrics ?? DEFAULT_CLIENT_HEALTH_CONFIG.metrics;
  const byKey = new Map(metricsSrc.map((m) => [m.key, m]));
  const metrics = HEALTH_METRIC_ORDER.map((key) => byKey.get(key) ?? { key, enabled: false, weight: 0 });
  return { metrics, tiers: resolveTiers(raw) };
}

type StoredHealthConfig = ClientHealthConfig & { thresholds?: { healthy: number; watch: number } };

/** Back-compat: the first shipped config stored `thresholds: {healthy, watch}`
 *  instead of `tiers`. Synthesize the three classic tiers from those cutoffs so
 *  an environment seeded before the dynamic-tier change still reads correctly;
 *  otherwise use stored tiers, or the default. */
function resolveTiers(stored: Partial<StoredHealthConfig> | null): HealthTierDef[] {
  if (stored && Array.isArray(stored.tiers) && stored.tiers.length > 0) return stored.tiers;
  const t = stored?.thresholds;
  if (t) {
    return [
      { id: "healthy", name: "Healthy", minScore: t.healthy, color: "#2DB47A" },
      { id: "watch", name: "Watch", minScore: t.watch, color: "#C99A14" },
      { id: "at_risk", name: "At risk", minScore: 0, color: "#D14B6B" },
    ];
  }
  return DEFAULT_HEALTH_TIERS;
}

/** Raw workspace_config read (no default merge) — for callers that must
 *  distinguish "key absent" / "field absent" from a defaulted value. */
async function readRawConfig(key: string): Promise<unknown> {
  if (!(hasDatabase() && dbHealthy())) return null;
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    return await withDbTimeout(getWorkspaceConfigFromDb(key));
  } catch {
    return null;
  }
}

export async function setClientHealthConfig(c: ClientHealthConfig): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(CLIENT_HEALTH_CONFIG_KEY, c);
}
