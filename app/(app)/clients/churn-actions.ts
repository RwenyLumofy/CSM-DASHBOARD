"use server";

/* =========================================================================
   Churn classification — tag a churned client with ONE reason id from the
   admin-managed churn taxonomy (Settings → Churn taxonomy). Stored on the
   client's protected `properties.churn_reason` JSONB key so it survives the
   HubSpot sync, and validated against the live taxonomy so a stored id can
   never drift from a renamed/removed reason.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getChurnTaxonomy } from "@/lib/data";
import { churnReasonIds } from "@/lib/metrics/churn-taxonomy";

export interface ChurnReasonResult {
  ok: boolean;
  error?: string;
}

/** Set (or clear, when reasonId is null) a client's churn reason. */
export async function setClientChurnReasonAction(clientId: string, reasonId: string | null): Promise<ChurnReasonResult> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access is required to set a churn reason." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!clientId) return { ok: false, error: "Missing client." };

  // Reject anything that isn't a live taxonomy reason — keeps the stored tag
  // in lock-step with what the Churn dashboard can group by.
  if (reasonId) {
    const ids = churnReasonIds(await getChurnTaxonomy());
    if (!ids.has(reasonId)) return { ok: false, error: "That churn reason no longer exists in the taxonomy." };
  }

  try {
    const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
    await setClientPropertyDb(clientId, "churn_reason", reasonId);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
