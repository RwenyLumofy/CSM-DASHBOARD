"use server";

/* =========================================================================
   Saving the client-health formula (Settings → Client health).

   Split out of workflow-actions.ts when the assignment engine was removed —
   the health save had been sitting in the assignment module's action file, so
   deleting assignment would have taken the only way to configure the score
   with it.

   NOTE: this save runs a full recomputeAllClientHealth() sweep — every client,
   each with a usage read. A "use server" file may only export async functions,
   so its duration ceiling can't be set here; it is set on the route that hosts
   the action (app/(app)/settings/page.tsx maxDuration), and matches the
   client-health cron's.
   ========================================================================= */

import { isAdminOrSuper } from "@/lib/auth";
import { setClientHealthConfig } from "@/lib/metrics/health-config-store";
import type { ClientHealthConfig } from "@/lib/metrics/health-config";
import type { HealthModelOverrides } from "@/lib/health/model-overrides";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function saveClientHealthConfigAction(
  cfg: ClientHealthConfig,
): Promise<ActionResult & { clientsUpdated?: number }> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Super-admin access required." };
  try {
    await setClientHealthConfig(cfg);
    const { recomputeAllClientHealth } = await import("@/lib/repo/drizzle");
    const { clients } = await recomputeAllClientHealth();
    return { ok: true, clientsUpdated: clients };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Save the qualification gates, status rules and coverage floor, then re-score
 * every account.
 *
 * The whole point of these being config is that a retune takes effect now
 * rather than on the next nightly run — a CS leader who raises the pulse bar
 * needs to see what it does to the book before deciding to keep it. The
 * existing overrides are merged, not replaced, so this cannot silently drop
 * the component weights and bands the other editor writes to the same key.
 */
export async function saveHealthModelRulesAction(
  patch: Pick<HealthModelOverrides, "gates" | "rules" | "minCoverage">,
): Promise<ActionResult & { clientsUpdated?: number }> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Super-admin access required." };
  try {
    const { getHealthModelOverrides, setHealthModelOverrides } = await import("@/lib/health/model-overrides-store");
    const current = (await getHealthModelOverrides()) ?? {};
    await setHealthModelOverrides({
      ...current,
      gates: patch.gates,
      rules: patch.rules,
      minCoverage: patch.minCoverage,
    });
    const { recomputeAllClientHealth } = await import("@/lib/repo/drizzle");
    const { clients } = await recomputeAllClientHealth();
    return { ok: true, clientsUpdated: clients };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
