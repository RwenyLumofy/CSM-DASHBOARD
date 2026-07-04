"use server";

/* Settings → Workflows server actions. Super-admin only, enforced server-side.
   Save the assignment rule configs / capacity, and run the assignment workflow
   on demand for any unassigned clients. */

import { isSuperAdmin } from "@/lib/auth";
import {
  setCapacityConfig,
  setCsmAssignmentConfig,
  setImplementationAssignmentConfig,
} from "@/lib/assignment/config";
import type {
  CapacityConfig,
  CsmAssignmentConfig,
  ImplementationAssignmentConfig,
} from "@/lib/assignment/types";
import type { AssignmentRunSummary } from "@/lib/assignment/run";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function guard(): Promise<ActionResult | null> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Super-admin access required." };
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
