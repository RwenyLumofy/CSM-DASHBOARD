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
