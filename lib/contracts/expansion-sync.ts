import "server-only";

/* =========================================================================
   Won expansion → contract record.

   Expansions are recorded on the Expansion page. When a Won opportunity's ARR
   is added to the account (lib/expansion/ledger-sync.ts), the same moment
   writes its expansion contract record, so the contract history lists it.
   When that ARR is removed again (unticked, reopened, deleted) the record is
   voided with the reason, never deleted.

   The record id is deterministic per opportunity (ctr-exp-<id>, the id the
   one-time import uses), so recording twice never makes two records, and
   re-recording un-voids the same one. On a re-record only the fields the
   opportunity owns are rewritten (name, amount, currency, date); what CS
   added on the contract tab (licences, modules, libraries, notes) is kept.

   These never throw and never block the Expansion page: the contract tables
   are created by a manual migration and nothing live reads them yet, so a
   failure here is logged and the opportunity's own save stands.
   ========================================================================= */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { recomputeClient } from "@/lib/repo/drizzle";
import { expansionRecordFromOpportunity, type WonOpportunity } from "./import";

export const expansionRecordId = (opportunityId: string) => `ctr-exp-${opportunityId}`;

export async function writeWonExpansionRecord(clientId: string, o: WonOpportunity, actor: string | null): Promise<void> {
  try {
    const rec = expansionRecordFromOpportunity(clientId, o);
    if (!rec) return;
    await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(schema.contractRecords).where(eq(schema.contractRecords.id, rec.id)).limit(1);
      const owned = { name: rec.name, amount: rec.amount, currency: rec.currency, startDate: rec.startDate };
      const [after] = before
        ? await tx.update(schema.contractRecords)
            .set({ ...owned, counted: true, voidedAt: null, voidedBy: null, voidReason: null, updatedBy: actor, updatedAt: new Date() })
            .where(eq(schema.contractRecords.id, rec.id)).returning()
        : await tx.insert(schema.contractRecords)
            .values({ ...rec, oneTimeFees: [], startingModules: [], yearAmounts: null, supportAmount: null, createdBy: actor, updatedBy: actor }).returning();
      await tx.insert(schema.contractAudit).values({ clientId, recordId: rec.id, action: "expansion_won", actor, before: before ?? null, after });
    });
    await recomputeClient(clientId); // the account's numbers follow the record once Signal reads contract records
  } catch (e) {
    console.error("[contracts] could not write the expansion record for", o.id, e);
  }
}

export async function voidWonExpansionRecord(opportunityId: string, actor: string | null, reason: string): Promise<void> {
  try {
    const id = expansionRecordId(opportunityId);
    const clientId = await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(schema.contractRecords).where(eq(schema.contractRecords.id, id)).limit(1);
      if (!before || before.voidedAt) return null;
      const [after] = await tx.update(schema.contractRecords)
        .set({ voidedAt: new Date(), voidedBy: actor, voidReason: reason, updatedBy: actor, updatedAt: new Date() })
        .where(eq(schema.contractRecords.id, id)).returning();
      await tx.insert(schema.contractAudit).values({ clientId: before.clientId, recordId: id, action: "expansion_removed", actor, before, after });
      return before.clientId;
    });
    if (clientId) await recomputeClient(clientId);
  } catch (e) {
    console.error("[contracts] could not void the expansion record for", opportunityId, e);
  }
}
