"use server";

/* Settings → Workflows server actions. Super-admin only, enforced server-side.
   Save the assignment rule configs / capacity, and run the assignment workflow
   on demand for any unassigned clients. */

import { isAdminOrSuper } from "@/lib/auth";
import {
  setCapacityConfig,
  setCsmAssignmentConfig,
  setImplementationAssignmentConfig,
  setClientHealthConfig,
} from "@/lib/assignment/config";
import type {
  CapacityConfig,
  CsmAssignmentConfig,
  ImplementationAssignmentConfig,
} from "@/lib/assignment/types";
import type { AssignmentRunSummary } from "@/lib/assignment/run";
import type { ClientHealthConfig } from "@/lib/metrics/health-config";

// NOTE: The health-formula save runs a full recomputeAllClientHealth() sweep
// (74 clients, each with a usage read). A "use server" file may only export
// async functions, so its duration ceiling can't be set here — it's set on the
// route that hosts the action (app/(app)/settings/page.tsx maxDuration).

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function guard(): Promise<ActionResult | null> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Super-admin access required." };
  return null;
}

export async function saveCsmAssignmentAction(cfg: CsmAssignmentConfig): Promise<ActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    // Keep bands ascending so the engine's "largest minArr ≤ arr" is intuitive.
    const bands = [...cfg.bands].sort((a, b) => a.minArr - b.minArr);
    await setCsmAssignmentConfig({ ...cfg, bands });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function saveImplementationAssignmentAction(cfg: ImplementationAssignmentConfig): Promise<ActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    await setImplementationAssignmentConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function saveCapacityAction(cfg: CapacityConfig): Promise<ActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    await setCapacityConfig(cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function saveClientHealthConfigAction(cfg: ClientHealthConfig): Promise<ActionResult & { clientsUpdated?: number }> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    await setClientHealthConfig(cfg);
    const { recomputeAllClientHealth } = await import("@/lib/repo/drizzle");
    const { clients } = await recomputeAllClientHealth();
    return { ok: true, clientsUpdated: clients };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function runAssignmentNowAction(): Promise<ActionResult & { summary?: AssignmentRunSummary }> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    const { runAssignment } = await import("@/lib/assignment/run");
    const summary = await runAssignment();
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
