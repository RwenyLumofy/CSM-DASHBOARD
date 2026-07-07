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
