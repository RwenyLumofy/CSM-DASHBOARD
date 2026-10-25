"use server";

/* =========================================================================
   Contract tab — every mutation.

   AUTHORIZATION: a contract record is account data, so every write gates on
   `denyClientWrite` for the record's OWN client_id, looked up from the
   database rather than taken from the request. A record id in a request is not
   proof of ownership.

   Who may write: whoever may edit the account — its CSM, admins and super
   admins (`denyClientWrite`). The tab was super admins only until 2026-10-13.

   Effect on the rest of Signal: every write re-materializes the account
   (recomputeClient). While the workspace is NOT switched to contract records
   that changes nothing — live ARR, status and renewal date still come from
   deals. Once it is switched (Contract check page), the account's ARR, status
   and renewal date follow the records at once, and recording a churn also
   closes the account's open Expansion opportunities as lost.

   REASONS: a churn, a downgrade and a renewal worth less than the ARR it
   replaces all need at least one reason from Settings → Churn taxonomy,
   stored on the record. Whoever may write the record may set them; there is
   no admin-only step.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { denyClientWrite, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getChurnTaxonomy } from "@/lib/data";
import { churnReasonIds } from "@/lib/metrics/churn-taxonomy";
import {
  clearStatusOverrideDb, createContractRecordDb, getContractRecordDb, getContractRecordsDb, setStatusOverrideDb, updateContractRecordDb, voidContractRecordDb,
} from "@/lib/contracts/repo";
import { arrReplacedBy } from "@/lib/contracts/live";
import { validateOverride, type ContractStatus } from "@/lib/contracts/status";
import { closeOpenOpportunitiesForChurn } from "@/lib/contracts/churn-close";
import { contractRecordsLive, recomputeClient } from "@/lib/repo/drizzle";
import {
  editablePatch, validateKindForCreate, validateRecord, type ContractFields, type ContractKind, type RecordContext,
} from "@/lib/contracts/validate";

export interface ContractActionResult {
  ok: boolean;
  error?: string;
  /** Set by create. */
  id?: string;
  /** The save worked, but part of it was not applied (shown to the user). */
  warning?: string;
}

const GONE = "That record no longer exists, or you don't have access to it.";

/** After any write: re-materialize the account, then refresh the two screens that show it. */
async function afterWrite(clientId: string): Promise<void> {
  try {
    await recomputeClient(clientId);
  } catch (e) {
    console.error("[contracts] recompute after a contract write failed for", clientId, e);
  }
  revalidatePath(`/clients/${clientId}/contract`);
  revalidatePath(`/clients/${clientId}`);
}

async function previewGate(): Promise<string | null> {
  return hasDatabase() ? null : "The database isn't configured.";
}

/** What a record is validated against: the live reason taxonomy and, for a renewal, the ARR it replaces. */
async function recordContext(clientId: string, kind: ContractKind, f: ContractFields, recordId?: string): Promise<RecordContext> {
  const reasonIds = churnReasonIds(await getChurnTaxonomy());
  const replacesArr = kind === "renewal" && f.startDate ? arrReplacedBy(await getContractRecordsDb(clientId), f.startDate, recordId) : undefined;
  return { reasonIds, replacesArr };
}

/** The fields that decide whether a record loses ARR, or that carry its reasons. */
const LOSS_FIELDS: (keyof ContractFields)[] = ["amount", "currency", "supportAmount", "supportLevel", "yearAmounts", "startDate", "churnReasons"];

/** Record a renewal, downgrade or churn on an account. */
export async function recordContractChangeAction(clientId: string, kind: ContractKind, fields: ContractFields): Promise<ContractActionResult> {
  const blocked = (await previewGate()) ?? (await denyClientWrite(clientId));
  if (blocked) return { ok: false, error: blocked };
  const kindOk = validateKindForCreate(kind);
  if (!kindOk.ok) return { ok: false, error: kindOk.error };
  const valid = validateRecord(kind, fields, await recordContext(clientId, kind, fields));
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    const actor = await getCurrentUserEmail();
    const created = await createContractRecordDb(clientId, kind, fields, actor);
    // A renewal or churn ends a status set by hand (it would stop applying on the record's start date anyway).
    if (kind === "renewal" || kind === "churn") await clearStatusOverrideDb(clientId, actor, `A ${kind} was recorded.`);
    // Once Signal reads contract records, a churned account can't keep open opportunities on the Expansion board.
    let closed = 0;
    if (kind === "churn" && (await contractRecordsLive())) closed = await closeOpenOpportunitiesForChurn(clientId, actor);
    await afterWrite(clientId);
    return { ok: true, id: created.id, warning: closed ? `${closed} open expansion opportunit${closed === 1 ? "y was" : "ies were"} closed as lost.` : undefined };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Save edits to a record. On a HubSpot sale, HubSpot-owned fields are left alone and reported. */
export async function updateContractRecordAction(recordId: string, patch: Partial<ContractFields> & { counted?: boolean }): Promise<ContractActionResult> {
  const pre = await previewGate();
  if (pre) return { ok: false, error: pre };
  const current = await getContractRecordDb(recordId);
  if (!current) return { ok: false, error: GONE };
  const denied = await denyClientWrite(current.clientId);
  if (denied) return { ok: false, error: denied };
  if (current.voidedAt) return { ok: false, error: "A voided record can't be edited." };

  const { counted, ...fieldPatch } = patch;
  const { patch: allowed, refused } = editablePatch(current.source, fieldPatch);
  const merged: ContractFields = { ...current, ...allowed };
  const ctx = await recordContext(current.clientId, current.kind, merged, recordId);
  const valid = validateRecord(current.kind, merged, { ...ctx, skipLossReasons: !LOSS_FIELDS.some((k) => k in allowed) });
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    const saved = await updateContractRecordDb(recordId, { ...allowed, ...(counted === undefined ? {} : { counted }) }, await getCurrentUserEmail());
    if (!saved) return { ok: false, error: GONE };
    await afterWrite(current.clientId);
    return {
      ok: true,
      warning: refused.length ? `${refused.join(", ")} come${refused.length === 1 ? "s" : ""} from HubSpot and ${refused.length === 1 ? "was" : "were"} not changed. Change ${refused.length === 1 ? "it" : "them"} in HubSpot.` : undefined,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Void a record made by mistake. It stays in the history, struck through, and stops counting. */
export async function voidContractRecordAction(recordId: string, reason: string): Promise<ContractActionResult> {
  const pre = await previewGate();
  if (pre) return { ok: false, error: pre };
  const current = await getContractRecordDb(recordId);
  if (!current) return { ok: false, error: GONE };
  const denied = await denyClientWrite(current.clientId);
  if (denied) return { ok: false, error: denied };
  if (current.source === "hubspot") return { ok: false, error: "A HubSpot sale can't be voided here. If it shouldn't count, keep it as history instead." };
  if (current.voidedAt) return { ok: false, error: "This record is already voided." };
  if (!reason.trim()) return { ok: false, error: "Say why this record is being voided." };
  try {
    await voidContractRecordDb(recordId, reason.trim(), await getCurrentUserEmail());
    await afterWrite(current.clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Set the account's status by hand. Needs a reason; lasts 30 days or until a renewal or churn. Churned is refused: record a churn. */
export async function setStatusOverrideAction(clientId: string, status: string, reason: string): Promise<ContractActionResult> {
  const blocked = (await previewGate()) ?? (await denyClientWrite(clientId));
  if (blocked) return { ok: false, error: blocked };
  const valid = validateOverride(status, reason);
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    await setStatusOverrideDb(clientId, status as ContractStatus, reason.trim(), await getCurrentUserEmail());
    await afterWrite(clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Return the account to its automatic status. */
export async function clearStatusOverrideAction(clientId: string): Promise<ContractActionResult> {
  const blocked = (await previewGate()) ?? (await denyClientWrite(clientId));
  if (blocked) return { ok: false, error: blocked };
  try {
    await clearStatusOverrideDb(clientId, await getCurrentUserEmail(), "Returned to automatic by hand.");
    await afterWrite(clientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
