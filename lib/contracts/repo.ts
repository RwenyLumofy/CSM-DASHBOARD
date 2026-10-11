import "server-only";

/* =========================================================================
   Contract records — reads and writes.

   Every write also writes `contract_audit` (who, what, before, after) in the
   same transaction, so there is no path that changes a record without a trace.
   A mistake is VOIDED with a reason, never deleted: a voided record stays
   readable in the history and stops counting toward ARR.

   Authorization is NOT here. Callers gate first (see
   app/(app)/clients/[id]/contract/actions.ts → denyClientWrite).
   ========================================================================= */

import { randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { Currency } from "./ledger";
import { overrideExpiry, type ContractStatus, type StatusOverride } from "./status";
import type { ContractFields, ContractKind, ContractSource } from "./validate";

export interface ContractRecord extends ContractFields {
  id: string;
  clientId: string;
  kind: ContractKind;
  source: ContractSource;
  hubspotDealId: string | null;
  opportunityId: string | null;
  channel: string | null;
  /** false = kept as history only. */
  counted: boolean;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

type Row = typeof schema.contractRecords.$inferSelect;

function rowToRecord(r: Row): ContractRecord {
  return {
    id: r.id, clientId: r.clientId, kind: r.kind as ContractKind, source: r.source as ContractSource,
    hubspotDealId: r.hubspotDealId, opportunityId: r.opportunityId, channel: r.channel,
    name: r.name, currency: (r.currency as Currency) ?? "USD", amount: r.amount, yearAmounts: r.yearAmounts ?? null,
    supportLevel: r.supportLevel, supportAmount: r.supportAmount, oneTimeFees: r.oneTimeFees ?? [],
    licences: r.licences, complementary: r.complementary, pricePerUser: r.pricePerUser,
    modules: r.modules ?? [], startingModules: r.startingModules ?? [],
    libraryDecided: r.libraryDecided, libraryTerms: r.libraryTerms ?? {},
    implementationLevel: r.implementationLevel, aiCredits: r.aiCredits, milestones: r.milestones ?? {},
    startDate: r.startDate, endDate: r.endDate, renewalDate: r.renewalDate,
    counted: r.counted, churnReasons: r.churnReasons ?? [], note: r.note,
    voidedAt: r.voidedAt?.toISOString() ?? null, voidedBy: r.voidedBy, voidReason: r.voidReason,
    createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString(),
  };
}

/** True when the contract tables exist in this database (they are created by a manual migration). */
export async function contractTablesExist(): Promise<boolean> {
  try {
    await getDb().select({ id: schema.contractRecords.id }).from(schema.contractRecords).limit(1);
    return true;
  } catch {
    return false;
  }
}

/** Every record on an account, oldest first, including voided ones (the history shows them struck through). */
export async function getContractRecordsDb(clientId: string): Promise<ContractRecord[]> {
  const rows = await getDb().select().from(schema.contractRecords)
    .where(eq(schema.contractRecords.clientId, clientId))
    .orderBy(asc(schema.contractRecords.startDate), asc(schema.contractRecords.createdAt));
  return rows.map(rowToRecord);
}

export async function getContractRecordDb(id: string): Promise<ContractRecord | null> {
  const [row] = await getDb().select().from(schema.contractRecords).where(eq(schema.contractRecords.id, id)).limit(1);
  return row ? rowToRecord(row) : null;
}

export async function createContractRecordDb(
  clientId: string, kind: ContractKind, fields: ContractFields, actor: string | null,
): Promise<ContractRecord> {
  const id = `ctr-${randomUUID()}`;
  return getDb().transaction(async (tx) => {
    const [row] = await tx.insert(schema.contractRecords).values({
      id, clientId, kind, source: "signal", ...fields, counted: true, createdBy: actor, updatedBy: actor,
    }).returning();
    const created = rowToRecord(row);
    await tx.insert(schema.contractAudit).values({ clientId, recordId: id, action: "create", actor, before: null, after: created });
    return created;
  });
}

/** Apply a patch. `counted` may be flipped here too (keep a record as history, or count it again). */
export async function updateContractRecordDb(
  id: string, patch: Partial<ContractFields> & { counted?: boolean }, actor: string | null,
): Promise<ContractRecord | null> {
  return getDb().transaction(async (tx) => {
    const [beforeRow] = await tx.select().from(schema.contractRecords).where(eq(schema.contractRecords.id, id)).limit(1);
    if (!beforeRow) return null;
    const [row] = await tx.update(schema.contractRecords)
      .set({ ...patch, updatedBy: actor, updatedAt: new Date() })
      .where(eq(schema.contractRecords.id, id)).returning();
    const after = rowToRecord(row);
    await tx.insert(schema.contractAudit).values({
      clientId: after.clientId, recordId: id, action: "update", actor, before: rowToRecord(beforeRow), after,
    });
    return after;
  });
}

export async function voidContractRecordDb(id: string, reason: string, actor: string | null): Promise<ContractRecord | null> {
  return getDb().transaction(async (tx) => {
    const [beforeRow] = await tx.select().from(schema.contractRecords).where(eq(schema.contractRecords.id, id)).limit(1);
    if (!beforeRow) return null;
    const [row] = await tx.update(schema.contractRecords)
      .set({ voidedAt: new Date(), voidedBy: actor, voidReason: reason, updatedBy: actor, updatedAt: new Date() })
      .where(eq(schema.contractRecords.id, id)).returning();
    const after = rowToRecord(row);
    await tx.insert(schema.contractAudit).values({
      clientId: after.clientId, recordId: id, action: "void", actor, before: rowToRecord(beforeRow), after,
    });
    return after;
  });
}

/* ── Status set by hand ────────────────────────────────────────────────── */

type OverrideRow = typeof schema.clientStatusOverrides.$inferSelect;
const rowToOverride = (r: OverrideRow): StatusOverride => ({
  status: r.status as ContractStatus, reason: r.reason, setBy: r.setBy,
  setOn: r.setAt.toISOString().slice(0, 10),
  expiresOn: r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : overrideExpiry(r.setAt.toISOString().slice(0, 10)),
});

/** The stored override, whether or not it still applies (see activeOverride in status.ts). */
export async function getStatusOverrideDb(clientId: string): Promise<StatusOverride | null> {
  const [row] = await getDb().select().from(schema.clientStatusOverrides).where(eq(schema.clientStatusOverrides.clientId, clientId)).limit(1);
  return row ? rowToOverride(row) : null;
}

/** Set (or replace) the account's status by hand. One per account; the audit log keeps the earlier ones. */
export async function setStatusOverrideDb(clientId: string, status: ContractStatus, reason: string, actor: string | null): Promise<StatusOverride> {
  return getDb().transaction(async (tx) => {
    const [beforeRow] = await tx.select().from(schema.clientStatusOverrides).where(eq(schema.clientStatusOverrides.clientId, clientId)).limit(1);
    const setAt = new Date();
    const expiresAt = new Date(`${overrideExpiry(setAt.toISOString().slice(0, 10))}T00:00:00Z`);
    const values = { status, reason, setBy: actor, setAt, expiresAt };
    const [row] = await tx.insert(schema.clientStatusOverrides).values({ clientId, ...values })
      .onConflictDoUpdate({ target: schema.clientStatusOverrides.clientId, set: values }).returning();
    const after = rowToOverride(row);
    await tx.insert(schema.contractAudit).values({ clientId, recordId: null, action: "status_set", actor, before: beforeRow ? rowToOverride(beforeRow) : null, after });
    return after;
  });
}

/** Return the account to its automatic status. `why` says what cleared it (a person, or a renewal / churn). */
export async function clearStatusOverrideDb(clientId: string, actor: string | null, why: string): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const [beforeRow] = await tx.delete(schema.clientStatusOverrides).where(eq(schema.clientStatusOverrides.clientId, clientId)).returning();
    if (!beforeRow) return false;
    await tx.insert(schema.contractAudit).values({ clientId, recordId: null, action: "status_clear", actor, before: rowToOverride(beforeRow), after: { why } });
    return true;
  });
}
