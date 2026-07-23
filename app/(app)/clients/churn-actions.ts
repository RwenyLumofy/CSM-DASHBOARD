"use server";

/* =========================================================================
   Churn classification — tag a churned client with the reason(s) it left for,
   from the admin-managed churn taxonomy (Settings → Churn taxonomy). An account
   can have MORE THAN ONE reason. Stored on the client's protected
   `properties.churn_reasons` JSONB key (a string[] of stable reason ids) so it
   survives the HubSpot sync, validated against the live taxonomy so a stored id
   can never drift from a renamed/removed reason.
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

/** Set the full set of churn reasons for a client (replaces any prior set;
 *  pass [] to clear). Ids not in the live taxonomy are dropped. */
export async function setClientChurnReasonsAction(clientId: string, reasonIds: string[]): Promise<ChurnReasonResult> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access is required to set churn reasons." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!clientId) return { ok: false, error: "Missing client." };

  // Keep only live taxonomy ids, de-duplicated — the stored tag stays in
  // lock-step with what the Churn dashboard can group by.
  const valid = churnReasonIds(await getChurnTaxonomy());
  const clean = [...new Set(reasonIds)].filter((id) => valid.has(id));

  try {
    const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
    await setClientPropertyDb(clientId, "churn_reasons", clean.length ? clean : null);
    // Retire the legacy single-reason key so reads never see a stale scalar.
    await setClientPropertyDb(clientId, "churn_reason", null);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
