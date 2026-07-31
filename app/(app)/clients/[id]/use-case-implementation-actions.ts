"use server";

/* =========================================================================
   Associating an account with a use case, and recording what that account is
   actually trying to do. This is the "associate" flow.

   DRIVEN FROM BOTH ENDS. The client page's Use Case Portfolio section is where
   the account-specific detail — objective, scope, status, target date — is
   written. The Use Case Universe directory can also create and remove a bare
   link from its per-card menu, because "put this use case on that client" is a
   question people ask while looking at the use case. Both call the actions
   below, so there is one record and one permission check rather than two
   implementations that can drift.

   Gated on canEditClient, NOT on the admin gate that guards definitions. These
   are two different jobs: curating the canonical wording is a taxonomy
   decision, recording a client's objective is the CSM's own account work. A
   CSM who can edit their account can edit its implementations.

   Writes go through the atomic JSONB array helpers, so two CSMs editing
   different implementations on the same client can't clobber each other — the
   same lost-update class that cost real data on this table before.

   REMOVING AN ASSOCIATION DELETES THE IMPLEMENTATION RECORD ONLY. Neither the
   account nor the canonical use case is touched, and the UI says so before
   asking.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { denyClientWrite, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getClientById } from "@/lib/data";
import {
  IMPLEMENTATION_KEY, IMPLEMENTATION_STATUSES, normalizeImplementations, newImplementationId,
  type UseCaseImplementation, type ImplementationStatus,
} from "@/lib/use-case-implementation";

export interface ImplementationResult {
  ok: boolean;
  error?: string;
  implementation?: UseCaseImplementation;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface ImplementationInput {
  id?: string;
  useCaseId: string;
  status?: string;
  objective?: string;
  scope?: string;
  csmEmail?: string | null;
  clientOwner?: string;
  targetDate?: string | null;
  nextStep?: string;
  missionId?: string | null;
  notes?: string;
}

export async function saveImplementationAction(
  clientId: string, input: ImplementationInput,
): Promise<ImplementationResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };
  if (!input.useCaseId) return { ok: false, error: "Pick a use case." };

  const { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy } = await import("@/lib/use-case-overlay");
  const { getWorkspaceConfigFromDb, upsertJsonbArrayElementForClientDb } = await import("@/lib/repo/drizzle");
  const taxonomy = normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
  if (!resolveTaxonomy(taxonomy, true).some((u) => u.id === input.useCaseId)) {
    return { ok: false, error: "That use case doesn't exist." };
  }

  const client = await getClientById(clientId);
  const existing = normalizeImplementations(
    (client?.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY],
  );

  // One implementation per use case per account. A second would split the
  // objective across two records and neither would be the truth.
  const clash = existing.find((i) => i.useCaseId === input.useCaseId && i.id !== input.id);
  if (clash) return { ok: false, error: "This account is already associated with that use case." };

  const prior = input.id ? existing.find((i) => i.id === input.id) : undefined;
  if (input.id && !prior) return { ok: false, error: "That association no longer exists." };

  const targetDate = text(input.targetDate, 20);
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: "Use the date picker." };

  const implementation: UseCaseImplementation = {
    id: prior?.id ?? newImplementationId(),
    useCaseId: input.useCaseId,
    status: (IMPLEMENTATION_STATUSES as readonly string[]).includes(input.status ?? "")
      ? (input.status as ImplementationStatus) : (prior?.status ?? "exploring"),
    objective: text(input.objective, 1000),
    scope: text(input.scope, 300),
    // Defaults to the account's own CSM, which is right almost always.
    csmEmail: text(input.csmEmail, 200).toLowerCase() || prior?.csmEmail || client?.csm?.email || null,
    clientOwner: text(input.clientOwner, 200),
    targetDate: targetDate || null,
    nextStep: text(input.nextStep, 500),
    // Falls back to the prior value like csmEmail above: the edit form never
    // sends missionId, so without this every save silently wipes whatever was
    // linked. Latent today — nothing writes it yet — but a data-loss bug the
    // moment something does.
    missionId: text(input.missionId, 100) || prior?.missionId || null,
    notes: text(input.notes, 4000),
    updatedAt: new Date().toISOString(),
    updatedBy: (await getCurrentUserEmail()) ?? null,
  };

  try {
    await upsertJsonbArrayElementForClientDb(clientId, IMPLEMENTATION_KEY, implementation.id, implementation);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true, implementation };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Remove the association. Deletes the implementation record — the objective,
 * scope and next step recorded on it — and nothing else. The account and the
 * canonical use case are untouched.
 */
export async function removeImplementationAction(clientId: string, implementationId: string): Promise<ImplementationResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };
  if (!implementationId) return { ok: false, error: "Missing association." };
  try {
    const { deleteJsonbArrayElementForClientDb } = await import("@/lib/repo/drizzle");
    await deleteJsonbArrayElementForClientDb(clientId, IMPLEMENTATION_KEY, implementationId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
