/* =========================================================================
   Expansion — the database layer.

   Drizzle only. No auth, no React: every function here assumes the caller has
   ALREADY decided the current user may do this. The gates live one level up,
   in ./read.ts (reads) and app/(app)/expansion/actions.ts (writes), so that a
   permission check can never be accidentally satisfied by a repo call.

   Every write also stamps `last_activity_at` and appends an activity line,
   because "when did anything last happen here" is what drives waiting and
   stalled — a mutation that forgets it makes a live deal look abandoned.
   ========================================================================= */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import {
  STAGE_LABEL, isConfidence, isExpansionType, isOutcome, isStage,
  type ActivityEntry, type Confidence, type NextStep, type Opportunity,
  type OpportunityNote, type Stage,
} from "@/lib/expansion/types";

const uid = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;

/** timestamptz → ISO string. */
const iso = (d: Date | string | null): string | null =>
  d == null ? null : typeof d === "string" ? d : d.toISOString();

/** A `date` column comes back as "YYYY-MM-DD" already; normalise defensively. */
const dateOnly = (d: string | Date | null): string | null =>
  d == null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/* ── Row → domain ─────────────────────────────────────────────────────────── */

type OppRow = typeof schema.expansionOpportunities.$inferSelect;

/**
 * A DB string is not a union. Every enum-ish column is narrowed on the way out
 * and falls back to the safe value, so a hand-edited row can widen the type
 * system's back door but never crash a render.
 */
function toOpportunity(
  row: OppRow,
  accountName: string,
  ownerName: string | null,
  nextSteps: NextStep[],
  latestNote: OpportunityNote | null,
): Opportunity {
  const stage: Stage = isStage(row.stage) ? row.stage : "identified";
  const outcome = isOutcome(row.outcome) ? row.outcome : null;
  return {
    id: row.id,
    clientId: row.clientId,
    accountName,
    name: row.name,
    description: row.description,
    // An outcome is what closed MEANS — the DB enforces the iff, so trust it
    // only after narrowing both halves.
    stage: outcome ? "closed" : stage === "closed" ? "identified" : stage,
    outcome,
    expectedArr: row.expectedArr,
    currency: row.currency,
    expansionType: isExpansionType(row.expansionType) ? row.expansionType : "module",
    product: row.product,
    ownerEmail: row.ownerEmail,
    ownerName,
    expectedCloseDate: dateOnly(row.expectedCloseDate),
    confidence: isConfidence(row.confidence) ? row.confidence : null,
    nextSteps,
    lastActivityAt: iso(row.lastActivityAt)!,
    stageChangedAt: iso(row.stageChangedAt)!,
    latestNote,
    createdAt: iso(row.createdAt)!,
    proposalDate: dateOnly(row.proposalDate),
    outcomeDate: dateOnly(row.outcomeDate),
    finalArr: row.finalArr,
    agreementType: row.agreementType === "verbal" || row.agreementType === "written" ? row.agreementType : null,
    confirmedBy: row.confirmedBy,
    arrRecorded: row.arrRecorded,
    closeReason: row.closeReason,
    closeNote: row.closeNote,
  };
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

/**
 * Every opportunity on the given accounts, with its step queue and latest note.
 *
 * Three queries, not N+1: the steps and notes for the whole board come back in
 * one read each and are grouped in memory. An empty `clientIds` returns nothing
 * WITHOUT querying — a user scoped to no accounts must see an empty board, not
 * the whole pipeline, and `inArray(x, [])` is the classic way that goes wrong.
 */
export async function getOpportunitiesForClientsDb(
  clientIds: string[],
  names: Map<string, string>,
  ownerNames: Map<string, string>,
): Promise<Opportunity[]> {
  if (!clientIds.length) return [];
  const db = getDb();
  const rows = await withDbTimeout(
    db.select().from(schema.expansionOpportunities)
      .where(inArray(schema.expansionOpportunities.clientId, clientIds))
      .orderBy(desc(schema.expansionOpportunities.lastActivityAt)),
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const [steps, notes] = await Promise.all([
    withDbTimeout(db.select().from(schema.expansionNextSteps)
      .where(inArray(schema.expansionNextSteps.opportunityId, ids))
      .orderBy(asc(schema.expansionNextSteps.dueDate))),
    withDbTimeout(db.select().from(schema.expansionNotes)
      .where(inArray(schema.expansionNotes.opportunityId, ids))
      .orderBy(desc(schema.expansionNotes.createdAt))),
  ]);

  const stepsBy = new Map<string, NextStep[]>();
  for (const s of steps) {
    const list = stepsBy.get(s.opportunityId) ?? [];
    list.push({ id: s.id, text: s.text, dueDate: dateOnly(s.dueDate)! });
    stepsBy.set(s.opportunityId, list);
  }
  // Notes arrive newest-first, so the first one seen per opportunity is latest.
  const latestBy = new Map<string, OpportunityNote>();
  for (const n of notes) {
    if (latestBy.has(n.opportunityId)) continue;
    latestBy.set(n.opportunityId, toNote(n, ownerNames));
  }

  return rows.map((r) => toOpportunity(
    r,
    names.get(r.clientId) ?? "Unknown account",
    r.ownerEmail ? ownerNames.get(r.ownerEmail.toLowerCase()) ?? r.ownerEmail : null,
    stepsBy.get(r.id) ?? [],
    latestBy.get(r.id) ?? null,
  ));
}

function toNote(
  n: typeof schema.expansionNotes.$inferSelect,
  names: Map<string, string>,
): OpportunityNote {
  const email = n.authorEmail?.toLowerCase() ?? null;
  return {
    id: n.id,
    body: n.body,
    authorEmail: email,
    authorName: (email && names.get(email)) || email || "Someone",
    createdAt: iso(n.createdAt)!,
  };
}

/**
 * What each account holds — "Develop", "Develop + Perform" — from the products
 * named on its TRACKED deals. Untracked deals are dead deals and are excluded,
 * exactly as they are from ARR.
 *
 * Two columns for the named accounts, never the whole deal table: a deal row
 * carries several large JSONB fields, and the record's account panel needs one
 * short string.
 */
export async function getAccountPlansDb(clientIds: string[]): Promise<Map<string, string>> {
  if (!clientIds.length) return new Map();
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ clientId: schema.clientDeals.clientId, products: schema.clientDeals.products })
      .from(schema.clientDeals)
      .where(and(inArray(schema.clientDeals.clientId, clientIds), eq(schema.clientDeals.tracked, true))),
  );
  const byClient = new Map<string, string[]>();
  for (const r of rows) {
    const list = byClient.get(r.clientId) ?? [];
    for (const p of r.products ?? []) if (p && !list.includes(p)) list.push(p);
    byClient.set(r.clientId, list);
  }
  return new Map([...byClient].map(([id, products]) => [id, products.join(" + ")]));
}

/** The client id an opportunity belongs to — the ONLY thing a write gate needs
 *  before it has decided the caller may act. Deliberately not the whole row. */
export async function getOpportunityClientIdDb(id: string): Promise<string | null> {
  const db = getDb();
  const [row] = await withDbTimeout(
    db.select({ clientId: schema.expansionOpportunities.clientId })
      .from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.id, id)).limit(1),
  );
  return row?.clientId ?? null;
}

/** Same, for a next step: which opportunity, and therefore which account. */
export async function getStepOwnerDb(stepId: string): Promise<{ opportunityId: string; clientId: string } | null> {
  const db = getDb();
  const [row] = await withDbTimeout(
    db.select({
      opportunityId: schema.expansionNextSteps.opportunityId,
      clientId: schema.expansionOpportunities.clientId,
    })
      .from(schema.expansionNextSteps)
      .innerJoin(schema.expansionOpportunities,
        eq(schema.expansionNextSteps.opportunityId, schema.expansionOpportunities.id))
      .where(eq(schema.expansionNextSteps.id, stepId)).limit(1),
  );
  return row ?? null;
}

/** One opportunity's full history — notes and activity, for the record view. */
export async function getOpportunityHistoryDb(
  opportunityId: string,
  names: Map<string, string>,
): Promise<{ notes: OpportunityNote[]; history: ActivityEntry[] }> {
  const db = getDb();
  const [notes, activity] = await Promise.all([
    withDbTimeout(db.select().from(schema.expansionNotes)
      .where(eq(schema.expansionNotes.opportunityId, opportunityId))
      .orderBy(desc(schema.expansionNotes.createdAt))),
    withDbTimeout(db.select().from(schema.expansionActivity)
      .where(eq(schema.expansionActivity.opportunityId, opportunityId))
      .orderBy(desc(schema.expansionActivity.at))),
  ]);
  return {
    notes: notes.map((n) => toNote(n, names)),
    history: activity.map((a) => ({
      id: a.id,
      what: a.what,
      actorName: (a.actorEmail && names.get(a.actorEmail.toLowerCase())) || a.actorEmail || "Signal",
      at: iso(a.at)!,
    })),
  };
}

/* ── Writes ───────────────────────────────────────────────────────────────── */

/** Append one activity line and bump `last_activity_at` in the same breath.
 *  Every mutation below goes through this: a change that leaves no trace is
 *  indistinguishable from silence, and silence is what `stalled` measures. */
async function touch(opportunityId: string, actorEmail: string | null, what: string, at = new Date()) {
  const db = getDb();
  await Promise.all([
    db.insert(schema.expansionActivity).values({ id: uid("exa"), opportunityId, what, actorEmail, at }),
    db.update(schema.expansionOpportunities)
      .set({ lastActivityAt: at })
      .where(eq(schema.expansionOpportunities.id, opportunityId)),
  ]);
}

export async function createOpportunityDb(input: {
  clientId: string;
  name: string;
  description: string | null;
  expectedArr: number | null;
  currency: string;
  expansionType: string;
  product: string | null;
  ownerEmail: string | null;
  expectedCloseDate: string | null;
  confidence: Confidence | null;
  createdByEmail: string | null;
  nextStep: { text: string; dueDate: string } | null;
}): Promise<string> {
  const db = getDb();
  const id = uid("exp");
  const now = new Date();
  await db.insert(schema.expansionOpportunities).values({
    id,
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    stage: "identified",
    outcome: null,
    expectedArr: input.expectedArr,
    currency: input.currency,
    expansionType: input.expansionType,
    product: input.product,
    ownerEmail: input.ownerEmail,
    expectedCloseDate: input.expectedCloseDate,
    confidence: input.confidence,
    lastActivityAt: now,
    stageChangedAt: now,
    createdByEmail: input.createdByEmail,
    createdAt: now,
  });
  if (input.nextStep) {
    await db.insert(schema.expansionNextSteps).values({
      id: uid("exs"),
      opportunityId: id,
      text: input.nextStep.text,
      dueDate: input.nextStep.dueDate,
      createdByEmail: input.createdByEmail,
    });
  }
  await touch(id, input.createdByEmail, "Opportunity created", now);
  return id;
}

/**
 * Move between the three ACTIVE stages. Closing is a different operation
 * (closeOpportunityDb) because it carries an outcome and its own facts.
 *
 * Reopening a closed opportunity lands here too: the outcome and every
 * closed-only fact are cleared, because a reopened deal that still remembers it
 * was Lost will report itself as both.
 */
export async function moveStageDb(
  id: string, to: Stage, actorEmail: string | null,
): Promise<{ from: Stage; outcomeCleared: boolean } | null> {
  const db = getDb();
  const [before] = await db.select({
    stage: schema.expansionOpportunities.stage,
    outcome: schema.expansionOpportunities.outcome,
    proposalDate: schema.expansionOpportunities.proposalDate,
  }).from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.id, id)).limit(1);
  if (!before) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  await db.update(schema.expansionOpportunities).set({
    stage: to,
    outcome: null,
    outcomeDate: null,
    finalArr: null,
    agreementType: null,
    confirmedBy: null,
    arrRecorded: false,
    closeReason: null,
    closeNote: null,
    stageChangedAt: now,
    lastActivityAt: now,
    // First time it reaches Proposed, record when. Never overwritten: "when did
    // we put a proposal in front of them" is answered once.
    proposalDate: to === "proposed" ? (before.proposalDate ?? today) : before.proposalDate,
  }).where(eq(schema.expansionOpportunities.id, id));

  const wasClosed = before.outcome !== null;
  // The label, not the column value: the activity log is read by people, and
  // "Moved to proposed" is a database row talking to itself.
  const label = STAGE_LABEL[to];
  await touch(id, actorEmail, wasClosed ? `Reopened at ${label}` : `Moved to ${label}`, now);
  return { from: isStage(before.stage) ? before.stage : "identified", outcomeCleared: wasClosed };
}

/**
 * Close it. Writes NOTHING to `arr_events` — the ARR ledger stays the source of
 * truth for recorded ARR, and `arrRecorded` only says whether the two have been
 * reconciled. An invoice is not an acceptance and a Won opportunity is not a
 * ledger entry; conflating them is how a running balance silently doubles.
 *
 * Closing also clears the step queue: a finished deal cannot be late for
 * anything, and leaving steps behind would keep it in the overdue count.
 */
export async function closeOpportunityDb(input: {
  id: string;
  outcome: "won" | "lost" | "dropped";
  finalArr: number | null;
  agreementType: "verbal" | "written" | null;
  confirmedBy: string | null;
  arrRecorded: boolean;
  closeReason: string | null;
  closeNote: string | null;
  actorEmail: string | null;
  summary: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(schema.expansionOpportunities).set({
    stage: "closed",
    outcome: input.outcome,
    outcomeDate: now.toISOString().slice(0, 10),
    finalArr: input.outcome === "won" ? input.finalArr : null,
    agreementType: input.outcome === "won" ? input.agreementType : null,
    confirmedBy: input.outcome === "won" ? input.confirmedBy : null,
    arrRecorded: input.outcome === "won" ? input.arrRecorded : false,
    closeReason: input.outcome === "won" ? null : input.closeReason,
    closeNote: input.outcome === "won" ? null : input.closeNote,
    stageChangedAt: now,
    lastActivityAt: now,
  }).where(eq(schema.expansionOpportunities.id, input.id));
  await db.delete(schema.expansionNextSteps).where(eq(schema.expansionNextSteps.opportunityId, input.id));
  await touch(input.id, input.actorEmail, input.summary, now);
}

/** Mark a Won opportunity as reconciled against the ledger. Reversible, because
 *  the person who ticks it can be wrong and an un-ticked marker is recoverable
 *  information whereas a wrong tick is a lie the amber badge no longer tells. */
export async function setArrRecordedDb(id: string, recorded: boolean, actorEmail: string | null): Promise<number> {
  const db = getDb();
  const rows = await db.update(schema.expansionOpportunities)
    .set({ arrRecorded: recorded })
    .where(and(eq(schema.expansionOpportunities.id, id), eq(schema.expansionOpportunities.outcome, "won")))
    .returning({ id: schema.expansionOpportunities.id });
  if (rows.length) {
    await touch(id, actorEmail, recorded ? "ARR reconciled against the ledger" : "ARR marked not recorded");
  }
  return rows.length;
}

/** Patch the fields a CSM edits in place. Only the keys present are written, so
 *  setting confidence can never blank an owner. */
export async function updateOpportunityDb(
  id: string,
  patch: {
    name?: string; description?: string | null; expectedArr?: number | null;
    expansionType?: string; product?: string | null; ownerEmail?: string | null;
    expectedCloseDate?: string | null; confidence?: Confidence | null;
  },
  actorEmail: string | null,
  summary: string,
): Promise<number> {
  const db = getDb();
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[k] = v;
  if (!Object.keys(set).length) return 0;
  const now = new Date();
  set.lastActivityAt = now;
  const rows = await db.update(schema.expansionOpportunities).set(set)
    .where(eq(schema.expansionOpportunities.id, id))
    .returning({ id: schema.expansionOpportunities.id });
  if (rows.length) await touch(id, actorEmail, summary, now);
  return rows.length;
}

export async function addNextStepDb(
  opportunityId: string, text: string, dueDate: string, actorEmail: string | null, summary: string,
): Promise<string> {
  const db = getDb();
  const id = uid("exs");
  await db.insert(schema.expansionNextSteps)
    .values({ id, opportunityId, text, dueDate, createdByEmail: actorEmail });
  await touch(opportunityId, actorEmail, summary);
  return id;
}

export async function updateNextStepDb(
  stepId: string, opportunityId: string, text: string, dueDate: string, actorEmail: string | null, summary: string,
): Promise<number> {
  const db = getDb();
  const rows = await db.update(schema.expansionNextSteps).set({ text, dueDate })
    .where(eq(schema.expansionNextSteps.id, stepId))
    .returning({ id: schema.expansionNextSteps.id });
  if (rows.length) await touch(opportunityId, actorEmail, summary);
  return rows.length;
}

/** Completing a step DELETES the row — see the note on the table. The activity
 *  line is what records that it happened. */
export async function completeNextStepDb(
  stepId: string, opportunityId: string, actorEmail: string | null, summary: string,
): Promise<number> {
  const db = getDb();
  const rows = await db.delete(schema.expansionNextSteps)
    .where(eq(schema.expansionNextSteps.id, stepId))
    .returning({ id: schema.expansionNextSteps.id });
  if (rows.length) await touch(opportunityId, actorEmail, summary);
  return rows.length;
}

export async function addNoteDb(
  opportunityId: string, body: string, authorEmail: string | null,
): Promise<string> {
  const db = getDb();
  const id = uid("exn");
  await db.insert(schema.expansionNotes).values({ id, opportunityId, body, authorEmail });
  await touch(opportunityId, authorEmail, "Note added");
  return id;
}

/**
 * How many accounts have at least one open opportunity — used by nothing on the
 * board, only by the Clients table, so it stays a count and never a payload.
 */
export async function getAccountsWithOpenOpportunitiesDb(clientIds: string[]): Promise<Set<string>> {
  if (!clientIds.length) return new Set();
  const db = getDb();
  const rows = await withDbTimeout(
    db.selectDistinct({ clientId: schema.expansionOpportunities.clientId })
      .from(schema.expansionOpportunities)
      .where(and(
        inArray(schema.expansionOpportunities.clientId, clientIds),
        sql`${schema.expansionOpportunities.outcome} is null`,
      )),
  );
  return new Set(rows.map((r) => r.clientId));
}
