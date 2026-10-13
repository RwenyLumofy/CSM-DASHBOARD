"use server";

/* =========================================================================
   Contract tab — every mutation.

   AUTHORIZATION: a contract record is account data, so every write gates on
   `denyClientWrite` for the record's OWN client_id, looked up from the
   database rather than taken from the request. A record id in a request is not
   proof of ownership.

   Who may write: whoever may edit the account — its CSM, admins and super
   admins (`denyClientWrite`). The tab was super admins only until 2026-10-13.

   What these writes do NOT do yet: they don't change the account's live ARR,
   status or renewal date, and a churn here does not close Expansion
   opportunities. Until the switch-over the app still reads ARR and status from
   deals. A status set by hand here is likewise the contract tab's status only.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { denyClientWrite, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getChurnTaxonomy } from "@/lib/data";
import { churnReasonIds } from "@/lib/metrics/churn-taxonomy";
import {
  clearStatusOverrideDb, createContractRecordDb, getContractRecordDb, setStatusOverrideDb, updateContractRecordDb, voidContractRecordDb,
} from "@/lib/contracts/repo";
import { validateOverride, type ContractStatus } from "@/lib/contracts/status";
import {
  editablePatch, validateKindForCreate, validateRecord, type ContractFields, type ContractKind,
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

async function previewGate(): Promise<string | null> {
  return hasDatabase() ? null : "The database isn't configured.";
}

/** Record a renewal, downgrade or churn on an account. */
export async function recordContractChangeAction(clientId: string, kind: ContractKind, fields: ContractFields): Promise<ContractActionResult> {
  const blocked = (await previewGate()) ?? (await denyClientWrite(clientId));
  if (blocked) return { ok: false, error: blocked };
  const kindOk = validateKindForCreate(kind);
  if (!kindOk.ok) return { ok: false, error: kindOk.error };
  const valid = validateRecord(kind, fields, kind === "churn" ? churnReasonIds(await getChurnTaxonomy()) : undefined);
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    const actor = await getCurrentUserEmail();
    const created = await createContractRecordDb(clientId, kind, fields, actor);
    // A renewal or churn ends a status set by hand (it would stop applying on the record's start date anyway).
    if (kind === "renewal" || kind === "churn") await clearStatusOverrideDb(clientId, actor, `A ${kind} was recorded.`);
    revalidatePath(`/clients/${clientId}/contract`);
    return { ok: true, id: created.id };
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
  const valid = validateRecord(current.kind, merged, current.kind === "churn" ? churnReasonIds(await getChurnTaxonomy()) : undefined);
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    const saved = await updateContractRecordDb(recordId, { ...allowed, ...(counted === undefined ? {} : { counted }) }, await getCurrentUserEmail());
    if (!saved) return { ok: false, error: GONE };
    revalidatePath(`/clients/${current.clientId}/contract`);
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
    revalidatePath(`/clients/${current.clientId}/contract`);
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
    revalidatePath(`/clients/${clientId}/contract`);
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
    revalidatePath(`/clients/${clientId}/contract`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
