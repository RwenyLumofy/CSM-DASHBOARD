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
import { LIBRARY_OVERRIDE_KEY, MODULES, type UseCaseOverride, type Module, type ConfusedWith } from "@/lib/use-case-library";
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
  goal?: string;
  soundsLike?: string[];
  delivers?: string[];
  confusedWith?: { id: string; distinction: string }[];
  watchFor?: string[];
  modules?: string[];
  stakeholderRoles?: string[];
  sourceUrl?: string | null;
  needsReview?: boolean;
}

export async function saveUseCaseEntryAction(id: string, input: LibraryEditInput): Promise<LibraryResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to edit the Use Case Universe." };

  // The id must be a live use case in the CURRENT taxonomy, not just a shipped
  // one — the team can add their own, and those need descriptions too.
  const { getWorkspaceConfigFromDb, setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  const { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy } = await import("@/lib/use-case-overlay");
  const taxonomy = normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
  const live = resolveTaxonomy(taxonomy, true);
  if (!live.some((u) => u.id === id)) return { ok: false, error: "Unknown use case." };

  const patch: UseCaseOverride = {
    updatedAt: new Date().toISOString(),
    updatedBy: (await getCurrentUserEmail()) ?? undefined,
  };

  const goal = text(input.goal, 600);
  if (goal !== undefined) patch.goal = goal;
  const sounds = lines(input.soundsLike); if (sounds) patch.soundsLike = sounds;
  const delivers = lines(input.delivers); if (delivers) patch.delivers = delivers;
  const watch = lines(input.watchFor); if (watch) patch.watchFor = watch;

  if (Array.isArray(input.confusedWith)) {
    // Silently drop a pointer at a use case that no longer exists rather than
    // rendering a broken cross-reference later.
    const ids = new Set(live.map((u) => u.id));
    patch.confusedWith = input.confusedWith
      .filter((c) => c && typeof c.id === "string" && ids.has(c.id) && c.id !== id)
      .map<ConfusedWith>((c) => ({ id: c.id, distinction: String(c.distinction ?? "").trim().slice(0, 300) }))
      .slice(0, 6);
  }
  if (Array.isArray(input.modules)) {
    patch.modules = input.modules.filter((m): m is Module => (MODULES as readonly string[]).includes(m));
  }
  if (Array.isArray(input.stakeholderRoles)) {
    patch.stakeholderRoles = input.stakeholderRoles
      .filter((r): r is StakeholderRole => (STAKEHOLDER_ROLES as readonly string[]).includes(r));
  }
  if (typeof input.needsReview === "boolean") patch.needsReview = input.needsReview;
  if (input.sourceUrl !== undefined) {
    const u = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
    if (u && !/^https?:\/\//i.test(u)) return { ok: false, error: "The source link needs to start with https://" };
    patch.sourceUrl = u || null;
  }

  try {
    const current = (await getWorkspaceConfigFromDb(LIBRARY_OVERRIDE_KEY)) as Record<string, UseCaseOverride> | null;
    const next = { ...(current && typeof current === "object" ? current : {}), [id]: patch };
    await setWorkspaceConfigDb(LIBRARY_OVERRIDE_KEY, next);
    revalidatePath("/use-cases");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Delete what the team wrote. There is no shipped text underneath, so this
 *  returns the use case to undocumented. */
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
