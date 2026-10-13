import "server-only";

/* When an account churns, its open Expansion opportunities are closed as lost
   with the reason "Account churned" (decided 2026-10-08), so the Expansion
   board never shows live pipeline on a churned account. Called from the
   contract tab's churn action, only once the workspace reads contract records.
   Never throws: the churn record is already saved, and a failure here is
   logged for someone to close the opportunities by hand. */

import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { closeOpportunityDb } from "@/lib/expansion/repo";

export const CHURN_CLOSE_REASON = "Account churned";

/** @returns how many opportunities were closed. */
export async function closeOpenOpportunitiesForChurn(clientId: string, actor: string | null): Promise<number> {
  try {
    const open = await getDb().select({ id: schema.expansionOpportunities.id })
      .from(schema.expansionOpportunities)
      .where(and(eq(schema.expansionOpportunities.clientId, clientId), ne(schema.expansionOpportunities.stage, "closed")));
    for (const o of open) {
      await closeOpportunityDb({
        id: o.id, outcome: "lost", finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false,
        closeReason: CHURN_CLOSE_REASON, closeNote: "Closed automatically when the account's churn was recorded.",
        actorEmail: actor, summary: "Closed Lost · account churned",
      });
    }
    return open.length;
  } catch (e) {
    console.error("[contracts] could not close open opportunities for churned account", clientId, e);
    return 0;
  }
}
