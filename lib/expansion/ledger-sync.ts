import "server-only";

/* =========================================================================
   Won expansion → ARR ledger.

   Ticking "ARR recorded" on a Won opportunity ADDS its final ARR to the
   account's ARR ledger as an expansion, dated the Won date. Unticking it,
   reopening the opportunity, or deleting it removes that entry again.

   Before 2026-10-08 the tick was only a check-off ("the CSM recorded it on
   the client profile"). It was ticked without the ledger entry ever being
   made, so a $20,000 win never reached the account's ARR while the board said
   "ARR recorded". The tick now does what it says.

   The entry has a deterministic id per opportunity, so ticking twice never
   counts it twice.

   Double counting with HubSpot: while the HubSpot CS pipeline is still synced,
   an expansion can also arrive as a CS-pipeline "Expanded" deal, and a ticked
   deal already counts toward ARR. If the account has one dated near the Won
   date, the entry is refused with an explanation instead of added.
   ========================================================================= */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { appendArrEvent, recomputeClient } from "@/lib/repo/drizzle";
import { findSameHubspotExpansion } from "./same-expansion";

/** One ledger entry per opportunity. */
export const wonArrEventId = (opportunityId: string) => `exp-won-${opportunityId}`;

export type RecordWonArrResult = { ok: true } | { ok: false; error: string };

export async function recordWonArr(opportunityId: string, actorEmail: string | null): Promise<RecordWonArrResult> {
  const db = getDb();
  const [o] = await db.select({
    clientId: schema.expansionOpportunities.clientId,
    name: schema.expansionOpportunities.name,
    outcome: schema.expansionOpportunities.outcome,
    finalArr: schema.expansionOpportunities.finalArr,
    outcomeDate: schema.expansionOpportunities.outcomeDate,
  }).from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.id, opportunityId)).limit(1);
  if (!o || o.outcome !== "won") return { ok: false, error: "Only a Won opportunity can add ARR." };
  if (!o.finalArr || o.finalArr <= 0) return { ok: false, error: "This opportunity has no final ARR to add." };
  const wonOn = o.outcomeDate ?? new Date().toISOString().slice(0, 10);

  // Is the same expansion already counted through a ticked HubSpot CS-pipeline deal?
  const hubspotExpansions = await db.select({
    name: schema.clientDeals.name, amount: schema.clientDeals.amount,
    closeDate: schema.clientDeals.closeDate, tracked: schema.clientDeals.tracked,
  }).from(schema.clientDeals).where(and(
    eq(schema.clientDeals.clientId, o.clientId),
    eq(schema.clientDeals.pipeline, "cs"),
    eq(schema.clientDeals.category, "expansion"),
  ));
  const near = findSameHubspotExpansion(hubspotExpansions, wonOn);
  if (near) {
    return {
      ok: false,
      error: `This account already counts a HubSpot expansion deal${near.name ? ` (“${near.name}”)` : ""} of ${Math.round(near.amount).toLocaleString("en-US")} closed near this date, so adding this would count it twice. If they're the same expansion, leave this unticked. If they're different, untick the HubSpot deal on the client's Contracts & deals card first.`,
    };
  }

  await appendArrEvent({
    id: wonArrEventId(opportunityId),
    clientId: o.clientId,
    type: "expansion",
    amount: o.finalArr,
    arr: 0,
    effectiveDate: wonOn,
    renewalDate: null,
    source: "manual",
    externalId: opportunityId,
    note: `Expansion won · ${o.name}`,
    createdBy: actorEmail,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/** Remove the ledger entry an opportunity added, if any, and re-materialize the account's ARR. */
export async function removeWonArr(opportunityId: string, clientId: string): Promise<void> {
  const db = getDb();
  const removed = await db.delete(schema.arrEvents)
    .where(eq(schema.arrEvents.id, wonArrEventId(opportunityId)))
    .returning({ id: schema.arrEvents.id });
  if (removed.length) await recomputeClient(clientId);
}
