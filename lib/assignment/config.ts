/* =========================================================================
   Assignment workflow configuration — load/save from workspace_config.
   Server-only (touches the DB). Always returns a complete config by merging
   stored overrides over the defaults, so the engine never sees a partial.
   ========================================================================= */

import { hasDatabase } from "@/lib/config";
import { dbHealthy } from "@/lib/db/health";
import { withDbTimeout } from "@/lib/db/client";
import type {
  CapacityConfig,
  CsmAssignmentConfig,
  ImplementationAssignmentConfig,
} from "@/lib/assignment/types";
import {
  CLIENT_HEALTH_CONFIG_KEY,
  DEFAULT_CLIENT_HEALTH_CONFIG,
  DEFAULT_HEALTH_TIERS,
  HEALTH_METRIC_ORDER,
  type ClientHealthConfig,
  type HealthTierDef,
} from "@/lib/metrics/health-config";

export const CSM_CONFIG_KEY = "csm_assignment";
export const IMPL_CONFIG_KEY = "implementation_assignment";
export const CAPACITY_CONFIG_KEY = "team_capacity";

/** ARR < 10k → Officer, 10k–70k → Senior, ≥70k → Strategic (super-admin editable). */
export const DEFAULT_CSM_CONFIG: CsmAssignmentConfig = {
  enabled: true,
  bands: [
    { minArr: 0, role: "csm_officer" },
    { minArr: 10_000, role: "senior_csm" },
    { minArr: 70_000, role: "strategic_csm" },
  ],
  helperProperty: null,
};

export const DEFAULT_IMPL_CONFIG: ImplementationAssignmentConfig = {
  enabled: true,
  rules: [
    { level: "White Glove", role: "implementation_manager" },
    { level: "Guided", role: "implementation_officer" },
    { level: "Self-Serve", role: "implementation_officer" },
  ],
  defaultRole: "implementation_officer",
};

export const DEFAULT_CAPACITY: CapacityConfig = {
  maxClientsByRole: {
    csm_officer: 25,
    senior_csm: 20,
    strategic_csm: 15,
    implementation_officer: 15,
    implementation_manager: 10,
  },
  maxWhiteGlove: 5,
};

/** Generic workspace_config read: merges a stored partial over `fallback` so
 *  callers never see a partial config. Shared by every super-admin-editable
 *  workspace setting (assignment rules, capacity, client health formula). */
export async function readConfig<T>(key: string, fallback: T): Promise<T> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      const stored = await withDbTimeout(getWorkspaceConfigFromDb(key));
      if (stored && typeof stored === "object") {
        return { ...fallback, ...(stored as Partial<T>) };
      }
    } catch {
      /* fall through to defaults */
    }
  }
  return fallback;
}

export async function writeConfig(key: string, value: unknown): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(key, value);
}

export const getCsmAssignmentConfig = () => readConfig(CSM_CONFIG_KEY, DEFAULT_CSM_CONFIG);
export const getImplementationAssignmentConfig = () => readConfig(IMPL_CONFIG_KEY, DEFAULT_IMPL_CONFIG);
export const getCapacityConfig = () => readConfig(CAPACITY_CONFIG_KEY, DEFAULT_CAPACITY);

export const setCsmAssignmentConfig = (c: CsmAssignmentConfig) => writeConfig(CSM_CONFIG_KEY, c);
export const setImplementationAssignmentConfig = (c: ImplementationAssignmentConfig) =>
  writeConfig(IMPL_CONFIG_KEY, c);
export const setCapacityConfig = (c: CapacityConfig) => writeConfig(CAPACITY_CONFIG_KEY, c);

/** Client health formula accessors. Kept here (with the assignment configs)
 *  because both are DB-backed workspace_config; the pure types/constants live
 *  in lib/metrics/health-config.ts so client components can import those
 *  without pulling this server-only module into their bundle. Always returns
 *  exactly the 8 known keys, in HEALTH_METRIC_ORDER — a config saved before a
 *  new metric existed still gets every current key (new ones default to
 *  disabled) rather than a caller having to guard against a missing entry. */
export async function getClientHealthConfig(): Promise<ClientHealthConfig> {
  // Read the RAW stored value (not readConfig's merge-over-default): tier
  // migration below must see whether the stored config actually carried `tiers`
  // or the legacy `thresholds`, which a shallow merge with the default would
  // hide by leaking default tiers in.
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

export const setClientHealthConfig = (c: ClientHealthConfig) => writeConfig(CLIENT_HEALTH_CONFIG_KEY, c);
