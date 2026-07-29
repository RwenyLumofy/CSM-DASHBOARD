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
import { ACCOUNT_USE_CASES_KEY, normalizeUseCases } from "@/lib/use-cases";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveThroughMerges } from "@/lib/use-case-overlay";

export interface UseCaseResult { ok: boolean; error?: string; ids?: string[] }

export async function setAccountUseCasesAction(clientId: string, ids: string[]): Promise<UseCaseResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };

  /* Validated against the RESOLVED taxonomy, not the 26 shipped in code.
     USE_CASE_BY_ID only knows the code list, so every use case the team added
     through TaxonomyManager was silently dropped here — you could create one,
     see it in the picker, select it, and have it vanish on save.

     Ids are also followed through merge pointers first. Retiring with
     `mergedInto` is how a merge is performed, and resolveThroughMerges existed
     for exactly that but had no production caller — so confirming an account
     against a merged-away id dropped it instead of recording the successor. */
  const { getWorkspaceConfigFromDb, setClientPropertyDb } = await import("@/lib/repo/drizzle");
  const overlay = normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY).catch(() => null));
  const live = new Set(resolveTaxonomy(overlay).map((u) => u.id));

  const clean = [...new Set(
    ids.filter((id): id is string => typeof id === "string")
       .map((id) => resolveThroughMerges(id, overlay))
       .filter((id) => live.has(id)),
  )];
  if (clean.length > 15) return { ok: false, error: "That's more than 15 use cases — pick the ones that actually drive the account." };

  try {
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
