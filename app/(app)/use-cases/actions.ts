"use server";

/* =========================================================================
   Editing the Use Case Universe.

   WHAT IS AND ISN'T EDITABLE. The taxonomy — ids, labels, categories — is NOT.
   It comes from the published deck, other reporting aggregates over it, and a
   renamed id would orphan every account already recorded against it. What IS
   editable is the editorial layer: definition, what it looks like in practice,
   examples, evidence, pitfall, owning roles. That is the part written to be
   argued with.

   OVERRIDES, NOT REPLACEMENT. Edits land in workspace_config under
   `use_case_library` and merge over the shipped baseline field by field
   (mergeLibrary). Clearing an override restores the original, so a bad edit is
   never destructive and the baseline can't be lost.

   WHO. isAdminOrSuper. This is workspace-wide reference content — one edit
   changes what every CSM reads when deciding how to classify an account — so
   it sits with the people who curate the taxonomy rather than with everyone
   who can edit an account. Loosening it later is a one-line change.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { LIBRARY_OVERRIDE_KEY, LIBRARY_BY_ID, type UseCaseOverride } from "@/lib/use-case-library";
import { STAKEHOLDER_ROLES, type StakeholderRole } from "@/lib/stakeholders/profile";

export interface LibraryResult { ok: boolean; error?: string }

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : "";  // "" means "clear this override"
};

const lines = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12).map((x) => x.slice(0, 400));
};

export interface LibraryEditInput {
  definition?: string;
  inPractice?: string;
  examples?: string[];
  evidence?: string[];
  pitfall?: string;
  stakeholderRoles?: string[];
}

export async function saveUseCaseEntryAction(id: string, input: LibraryEditInput): Promise<LibraryResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to edit the Use Case Universe." };
  if (!LIBRARY_BY_ID.has(id)) return { ok: false, error: "Unknown use case." };

  const patch: UseCaseOverride = {
    updatedAt: new Date().toISOString(),
    updatedBy: (await getCurrentUserEmail()) ?? undefined,
  };
  const def = text(input.definition, 600);
  const prac = text(input.inPractice, 1200);
  const pit = text(input.pitfall, 800);
  if (def !== undefined) patch.definition = def;
  if (prac !== undefined) patch.inPractice = prac;
  if (pit !== undefined) patch.pitfall = pit;
  const ex = lines(input.examples); if (ex) patch.examples = ex;
  const ev = lines(input.evidence); if (ev) patch.evidence = ev;
  if (Array.isArray(input.stakeholderRoles)) {
    patch.stakeholderRoles = input.stakeholderRoles
      .filter((r): r is StakeholderRole => (STAKEHOLDER_ROLES as readonly string[]).includes(r));
  }

  try {
    const { getWorkspaceConfigFromDb, setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    const current = (await getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY)) as Record<string, UseCaseOverride> | null;
    const next = { ...(current && typeof current === "object" ? current : {}), [id]: patch };
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, next);
    revalidatePath("/use-cases");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Drop this entry's override so the shipped baseline shows again. */
export async function resetUseCaseEntryAction(id: string): Promise<LibraryResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required." };
  try {
    const { getWorkspaceConfigFromDb, setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
    const current = (await getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY)) as Record<string, UseCaseOverride> | null;
    if (!current || typeof current !== "object" || !(id in current)) return { ok: true }; // already baseline
    const next = { ...current };
    delete next[id];
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, next);
    revalidatePath("/use-cases");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
