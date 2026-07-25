"use server";

/* =========================================================================
   CS Pulse dimensions — the admin-editable sub-categories of the Customer
   Success Pulse (name, weight, description, per-tier rubric). Stored in
   workspace_config "cs_pulse_dimensions". Editing here drives BOTH the capture
   form (a new dimension becomes a new rating) and the engine (the CS Pulse
   component's children are rebuilt from these).
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { normalizeCsPulseDimensions, normalizeCsPulseTiers, type PulseDimension, type RatingTier } from "@/lib/health/pulse";

export interface PulseConfigResult {
  ok: boolean;
  error?: string;
}

export async function saveCsPulseDimensionsAction(dimensions: PulseDimension[]): Promise<PulseConfigResult> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };

  const clean = normalizeCsPulseDimensions(dimensions);
  if (!clean.length) return { ok: false, error: "Add at least one CS Pulse dimension with a name." };
  const total = clean.reduce((a, d) => a + (d.weight || 0), 0);
  if (Math.round(total) !== 100) {
    return { ok: false, error: `Dimension weights must total 100% (currently ${Math.round(total)}%).` };
  }

  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    await setWorkspaceConfigDb("cs_pulse_dimensions", clean);
    revalidatePath("/settings");
    revalidatePath("/clients", "layout"); // scores + the pulse form depend on this
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Save the CS Pulse rating scale (Strong/Moderate/… — labels + scores). */
export async function saveCsPulseTiersAction(tiers: RatingTier[]): Promise<PulseConfigResult> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };

  const clean = normalizeCsPulseTiers(tiers);
  if (clean.length < 2) return { ok: false, error: "Keep at least two rating tiers." };

  try {
    const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    await setWorkspaceConfigDb("cs_pulse_tiers", clean);
    revalidatePath("/settings");
    revalidatePath("/clients", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
