"use server";

/* =========================================================================
   Expansion — every mutation on the board.

   AUTHORIZATION, in one sentence: an opportunity is account data, so every
   write gates on `denyClientWrite` for the opportunity's OWN client_id, looked
   up from the database rather than taken from the request.

   Three mistakes this file is written to avoid, all of which the repo has made
   before and recorded in CLAUDE.md:

     - The read gate is not the write gate. `getClientById` applies
       canSeeClient, which admits `guest` — the explicitly read-only tier — to
       every mutation behind it. Nothing here calls it.
     - A hidden UI control is not a permission. The owner picker filters guests
       out; `resolveOwner` below refuses one anyway.
     - An id in a request is not proof of ownership. A step id is resolved back
       to its opportunity and its account before it is touched, so a writable
       account can never be used as a lever on someone else's row.

   Closing an opportunity writes NOTHING to `arr_events`. See §5 of the spec.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { denyClientWrite, getCurrentUserEmail, getCurrentUserRole } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { hasDatabase } from "@/lib/config";
import { canEditExpansion } from "@/lib/expansion/access";
import { OUTCOME_LABEL, CONFIDENCE_LABEL, LOSS_REASONS, DROP_REASONS,
  isConfidence, isExpansionType, isStage,
  type CloseInput, type Confidence, type NewOpportunityInput, type Outcome, type Stage,
} from "@/lib/expansion/types";
import { assignableOwnerEmails } from "@/lib/expansion/read";
import {
  addNextStepDb, addNoteDb, closeOpportunityDb, completeNextStepDb, createOpportunityDb,
  getOpportunityClientIdDb, getStepOwnerDb, moveStageDb, setArrRecordedDb, updateNextStepDb,
  updateOpportunityDb,
} from "@/lib/expansion/repo";

export interface ExpansionActionResult {
  ok: boolean;
  error?: string;
  /** Set by create, so the caller can open the new record. */
  id?: string;
}

const GONE = "That opportunity no longer exists, or you don't have access to it.";
const NO_DB = "The database isn't configured.";

/** Refresh every surface that reads an opportunity, not just the board — the
 *  client profile shows the same rows and the Action list is derived from them. */
function revalidate(clientId?: string) {
  revalidatePath("/expansion");
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/inbox");
  revalidatePath("/today");
}

/**
 * The feature-level tier gate: may this caller touch Expansion at ALL?
 *
 * Runs before the per-account gate and never replaces it. `denyClientWrite`
 * already refuses a guest today, but that is a fact about `canEditClient`, not
 * a promise Expansion is entitled to lean on — a guest has no access to this
 * feature in its own right, and this is where that is written down.
 */
async function guardFeature(): Promise<string | null> {
  if (!hasDatabase()) return NO_DB;
  const role = await getCurrentUserRole();
  if (!role) return "Not signed in.";
  // Deliberately the same sentence the per-account gate uses, so a guest cannot
  // distinguish "the feature is closed to you" from "this account is".
  if (!canEditExpansion(role)) return "You don't have permission to edit this account.";
  return null;
}

/** The write gate for an account. Null means "go ahead". */
async function guardAccount(clientId: string): Promise<string | null> {
  const blocked = await guardFeature();
  if (blocked) return blocked;
  return denyClientWrite(clientId);
}

/**
 * The write gate for an existing opportunity: resolve which account it is on,
 * then gate on that. Returns the client id when the caller may write, or the
 * reason they may not. "Not found" and "not yours" are the same sentence on
 * purpose — an id-guesser must not be able to enumerate accounts.
 */
async function guardOpportunity(id: string): Promise<{ clientId: string } | { error: string }> {
  if (!hasDatabase()) return { error: NO_DB };
  const clientId = await getOpportunityClientIdDb(id).catch(() => null);
  if (!clientId) return { error: GONE };
  const denied = await denyClientWrite(clientId);
  return denied ? { error: denied } : { clientId };
}

/* ── Field validation ─────────────────────────────────────────────────────── */

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** A date field the user may legitimately leave empty. Invalid text is dropped
 *  rather than rejected: a close date is encouraged, never a blocker. */
const optionalDate = (v: string | null | undefined): string | null =>
  v && isDate(v) ? v : null;

/** Money as the form sends it. Negative and non-finite are refused; an empty
 *  box is a legitimate null — the Arla POKA motion is real and unsized. */
function money(v: number | string | null | undefined): { value: number | null } | { error: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return { error: "That amount isn't a number." };
  return { value: Math.round(n) };
}

/**
 * An owner must be a real, non-guest app user.
 *
 * The picker already filters guests out; this is the enforcement. A guest owner
 * would be an owner who cannot act on their own opportunity, and the whole
 * promise of the page is that every motion has someone who can.
 */
async function resolveOwner(email: string | null | undefined): Promise<{ value: string | null } | { error: string }> {
  if (!email) return { value: null };
  const lower = email.toLowerCase();
  const allowed = await assignableOwnerEmails();
  if (!allowed.has(lower)) return { error: "That person can't own an opportunity." };
  return { value: lower };
}

/* ── Create ───────────────────────────────────────────────────────────────── */

/**
 * Only the account and the name are required.
 *
 * Everything else is encouraged and flagged when absent, because blocking
 * creation is how opportunities stop being recorded at all — and an
 * unrecorded motion is invisible, which is the one thing this page exists to
 * prevent. A thin record is a problem the board can show; a missing one is not.
 */
export async function createOpportunityAction(input: NewOpportunityInput): Promise<ExpansionActionResult> {
  const clientId = input.clientId?.trim();
  if (!clientId) return { ok: false, error: "Choose a client account." };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Give the opportunity a name." };

  const denied = await guardAccount(clientId);
  if (denied) return { ok: false, error: denied };

  // Currency follows the account, never the form: an amount typed against one
  // currency and stored against another is a silent corruption.
  const client = (await getClients()).find((c) => c.id === clientId);
  if (!client) return { ok: false, error: GONE };

  const arr = money(input.expectedArr);
  if ("error" in arr) return { ok: false, error: arr.error };
  const owner = await resolveOwner(input.ownerEmail);
  if ("error" in owner) return { ok: false, error: owner.error };

  const step = input.nextStep?.text?.trim() && isDate(input.nextStep.dueDate)
    ? { text: input.nextStep.text.trim(), dueDate: input.nextStep.dueDate }
    : null;

  try {
    const id = await createOpportunityDb({
      clientId,
      name,
      description: input.description?.trim() || null,
      expectedArr: arr.value,
      currency: client.currency || "USD",
      expansionType: isExpansionType(input.expansionType) ? input.expansionType : "module",
      product: input.product?.trim() || null,
      ownerEmail: owner.value,
      expectedCloseDate: optionalDate(input.expectedCloseDate),
      confidence: isConfidence(input.confidence) ? input.confidence : null,
      createdByEmail: await getCurrentUserEmail(),
      nextStep: step,
    });
    revalidate(clientId);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── Movement ─────────────────────────────────────────────────────────────── */

/**
 * Move between stages. Instant and undoable — the Undo in the UI calls this
 * again with the previous stage, which is why moving is a plain idempotent
 * write with no confirmation of its own.
 *
 * A move to `closed` is refused here: closing carries an outcome and its own
 * facts, and that is `closeOpportunityAction`. Only Closed asks a question.
 */
export async function moveStageAction(id: string, to: Stage): Promise<ExpansionActionResult> {
  if (!isStage(to)) return { ok: false, error: "That isn't a stage." };
  if (to === "closed") return { ok: false, error: "Closing needs an outcome — use the close dialog." };
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const moved = await moveStageDb(id, to, await getCurrentUserEmail());
    if (!moved) return { ok: false, error: GONE };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── Closing ──────────────────────────────────────────────────────────────── */

/**
 * Record the commercial outcome.
 *
 * WON requires a final ARR and the person who confirmed, because "the client
 * agreed" with nobody named is not a record anyone can check later. Agreement
 * type is verbal or written; BOTH are Won. An invoice on its own is neither —
 * it leaves the opportunity at Proposed, which is why there is no invoice
 * option here at all.
 *
 * LOST / DROPPED require a reason from the fixed list (decision D-2) plus an
 * optional note. Free text alone cannot be counted, and "why do we lose
 * expansion" is the first question anyone asks of this data.
 *
 * Nothing here writes to the ARR ledger.
 */
export async function closeOpportunityAction(id: string, input: CloseInput): Promise<ExpansionActionResult> {
  const outcome = input.outcome;
  if (outcome !== "won" && outcome !== "lost" && outcome !== "dropped") {
    return { ok: false, error: "Choose Won, Lost or Dropped." };
  }
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };

  let finalArr: number | null = null;
  let agreementType: "verbal" | "written" | null = null;
  let confirmedBy: string | null = null;
  let closeReason: string | null = null;

  if (outcome === "won") {
    const arr = money(input.finalArr);
    if ("error" in arr) return { ok: false, error: arr.error };
    if (arr.value === null) return { ok: false, error: "Record what the client agreed to." };
    finalArr = arr.value;
    agreementType = input.agreementType === "verbal" ? "verbal" : "written";
    confirmedBy = input.confirmedBy?.trim() || null;
    if (!confirmedBy) return { ok: false, error: "Name the person who confirmed it." };
  } else {
    const allowed: readonly string[] = outcome === "lost" ? LOSS_REASONS : DROP_REASONS;
    closeReason = input.closeReason ?? "";
    if (!allowed.includes(closeReason)) return { ok: false, error: "Choose a reason." };
  }

  try {
    await closeOpportunityDb({
      id,
      outcome,
      finalArr,
      agreementType,
      confirmedBy,
      arrRecorded: outcome === "won" && !!input.arrRecorded,
      closeReason,
      closeNote: input.closeNote?.trim() || null,
      actorEmail: await getCurrentUserEmail(),
      summary: outcome === "won"
        ? `Closed Won · ${agreementType} agreement`
        : `Closed ${OUTCOME_LABEL[outcome as Outcome]} · ${closeReason}`,
    });
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Tick (or untick) "ARR recorded" on a Won opportunity.
 *
 * Gated on exactly what gates an `arr_events` write today — denyClientWrite,
 * the gate on recordArrAction (decision D-3). It is deliberately not a stricter
 * gate: the marker says the two records have been reconciled, and whoever may
 * write the ledger entry is whoever can know that.
 */
export async function setArrRecordedAction(id: string, recorded: boolean): Promise<ExpansionActionResult> {
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const n = await setArrRecordedDb(id, recorded, await getCurrentUserEmail());
    if (!n) return { ok: false, error: "Only a Won opportunity can be reconciled against the ledger." };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── In-place edits ───────────────────────────────────────────────────────── */

export async function setOwnerAction(id: string, ownerEmail: string | null): Promise<ExpansionActionResult> {
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  const owner = await resolveOwner(ownerEmail);
  if ("error" in owner) return { ok: false, error: owner.error };
  try {
    const { ownerNameFor } = await import("@/lib/expansion/read");
    const n = await updateOpportunityDb(
      id,
      { ownerEmail: owner.value },
      await getCurrentUserEmail(),
      owner.value ? `Owner → ${await ownerNameFor(owner.value)}` : "Owner cleared",
    );
    if (!n) return { ok: false, error: GONE };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function setConfidenceAction(id: string, confidence: Confidence | null): Promise<ExpansionActionResult> {
  if (confidence !== null && !isConfidence(confidence)) return { ok: false, error: "That isn't a confidence." };
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const n = await updateOpportunityDb(
      id,
      { confidence },
      await getCurrentUserEmail(),
      confidence ? `Confidence → ${CONFIDENCE_LABEL[confidence]}` : "Confidence cleared",
    );
    if (!n) return { ok: false, error: GONE };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── The next-step queue ──────────────────────────────────────────────────── */

export async function addNextStepAction(id: string, text: string, dueDate: string): Promise<ExpansionActionResult> {
  const body = text?.trim();
  if (!body) return { ok: false, error: "Say what happens next." };
  if (!isDate(dueDate)) return { ok: false, error: "A next step needs a due date." };
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const stepId = await addNextStepDb(id, body, dueDate, await getCurrentUserEmail(), `Next step added · due ${dueDate}`);
    revalidate(gate.clientId);
    return { ok: true, id: stepId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** A step id alone proves nothing: it is resolved back to its opportunity, and
 *  the gate is applied to THAT account. */
async function guardStep(stepId: string, opportunityId: string): Promise<{ clientId: string } | { error: string }> {
  if (!hasDatabase()) return { error: NO_DB };
  const owner = await getStepOwnerDb(stepId).catch(() => null);
  if (!owner || owner.opportunityId !== opportunityId) return { error: "That step is no longer on this opportunity." };
  const denied = await denyClientWrite(owner.clientId);
  return denied ? { error: denied } : { clientId: owner.clientId };
}

export async function updateNextStepAction(
  id: string, stepId: string, text: string, dueDate: string,
): Promise<ExpansionActionResult> {
  const body = text?.trim();
  if (!body) return { ok: false, error: "Say what happens next." };
  if (!isDate(dueDate)) return { ok: false, error: "A next step needs a due date." };
  const gate = await guardStep(stepId, id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const n = await updateNextStepDb(stepId, id, body, dueDate, await getCurrentUserEmail(), `Next step updated · due ${dueDate}`);
    if (!n) return { ok: false, error: "That step is no longer on this opportunity." };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function completeNextStepAction(id: string, stepId: string): Promise<ExpansionActionResult> {
  const gate = await guardStep(stepId, id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const n = await completeNextStepDb(stepId, id, await getCurrentUserEmail(), "Next step completed");
    if (!n) return { ok: false, error: "That step is no longer on this opportunity." };
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ── Notes ────────────────────────────────────────────────────────────────── */

export async function addNoteAction(id: string, body: string): Promise<ExpansionActionResult> {
  const text = body?.trim();
  if (!text) return { ok: false, error: "The note can't be empty." };
  const gate = await guardOpportunity(id);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await addNoteDb(id, text, await getCurrentUserEmail());
    revalidate(gate.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Exported for the record overlay, which loads notes and activity on demand
 *  rather than shipping every opportunity's history to the board. */
export async function loadOpportunityDetailAction(id: string) {
  const { getOpportunityDetail } = await import("@/lib/expansion/read");
  return getOpportunityDetail(id);
}
