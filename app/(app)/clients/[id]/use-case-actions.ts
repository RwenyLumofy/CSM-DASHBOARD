"use server";

/* Account-level use cases — the CS-confirmed answer to "what did they buy this
   to achieve", stored separately from the sales-declared deal values.

   Why not just edit the deal: the deal's use_cases are re-pulled and rewritten
   by every HubSpot sync (syncClientEngagement rewrites every deal column on
   every run), so a CSM's correction there survives at most four hours. And it
   would be wrong even if it persisted — what sales sold and what the account
   turned out to need are two different facts, and the gap between them is
   worth seeing. Both are kept; see compareUseCases. */

import { revalidatePath } from "next/cache";
import { denyClientWrite, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { ACCOUNT_USE_CASES_KEY, USE_CASE_BY_ID, normalizeUseCases } from "@/lib/use-cases";

export interface UseCaseResult { ok: boolean; error?: string; ids?: string[] }

export async function setAccountUseCasesAction(clientId: string, ids: string[]): Promise<UseCaseResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };

  // Only canonical ids are accepted. An unknown id here would be a bug or a
  // crafted request, not a legitimate free-text use case — free text belongs
  // in the account note, not in a taxonomy other reports aggregate over. This
  // is deliberately unaware of the separate, editable Use Case database: the
  // two systems never share ids.
  const clean = [...new Set(ids.filter((id) => typeof id === "string" && USE_CASE_BY_ID.has(id)))];
  if (clean.length > 15) return { ok: false, error: "That's more than 15 use cases — pick the ones that actually drive the account." };

  try {
    const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
    // Atomic single-key write (properties || patch) — never a read-modify-write
    // of the whole blob, which would race pulse/health/stakeholder writers.
    await setClientPropertyDb(clientId, ACCOUNT_USE_CASES_KEY, {
      ids: clean,
      updatedAt: new Date().toISOString(),
      updatedBy: await getCurrentUserEmail(),
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, ids: normalizeUseCases(clean).ids };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
