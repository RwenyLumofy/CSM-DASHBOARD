"use server";

/* Managing the taxonomy itself — add, rename, recategorise, retire.

   Distinct from actions.ts, which edits the DEFINITION of an entry. This file
   changes what entries exist at all, so it is stricter: retiring is the only
   way to remove something, and it always records a reason.

   Everything is stored as a delta over the shipped list (lib/use-case-overlay),
   so the code baseline is never mutated and a bad edit is always reversible by
   clearing the overlay. */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { USE_CASE_BY_ID } from "@/lib/use-cases";
import {
  TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups, isShippedGroup,
  newUseCaseId, newGroupId, type TaxonomyOverlay,
} from "@/lib/use-case-overlay";

export interface TaxonomyResult { ok: boolean; error?: string; id?: string }

async function load(): Promise<TaxonomyOverlay> {
  const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
  return normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
}
async function save(next: TaxonomyOverlay): Promise<void> {
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(TAXONOMY_KEY, next);
  revalidatePath("/use-cases");
  revalidatePath("/clients", "layout"); // the profile picker reads the same list
}

async function guard(): Promise<string | null> {
  if (!hasDatabase()) return "No database configured.";
  if (!(await isAdminOrSuper())) return "Admin access required to change the taxonomy.";
  return null;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Create a use case, or edit one that already exists (shipped or custom). */
export async function saveUseCaseAction(input: {
  id?: string; label: string; summary: string; groups: string[];
}): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };

  const label = clean(input.label, 120);
  if (!label) return { ok: false, error: "Give it a name." };
  const summary = clean(input.summary, 400);
  const groups = (input.groups ?? []).filter((g) => typeof g === "string" && g.trim()).slice(0, 4);
  if (groups.length === 0) return { ok: false, error: "Put it in at least one category." };

  const overlay = await load();
  const groupIds = new Set(resolveGroups(overlay).map((g) => g.id));
  const unknown = groups.filter((g) => !groupIds.has(g));
  if (unknown.length) return { ok: false, error: `Unknown category: ${unknown.join(", ")}` };

  // A duplicate NAME is almost always a mistake — usually someone re-adding
  // something that already exists under slightly different wording.
  const clash = resolveTaxonomy(overlay, true)
    .find((u) => u.id !== input.id && u.label.toLowerCase() === label.toLowerCase());
  if (clash) return { ok: false, error: `"${clash.label}" already exists${clash.retired ? " (retired)" : ""}.` };

  const editor = await getCurrentUserEmail();
  const next: TaxonomyOverlay = { ...overlay };

  if (input.id && USE_CASE_BY_ID.has(input.id)) {
    // Shipped entry: record only what differs, so an edit that matches the
    // baseline leaves no override behind to go stale.
    const base = USE_CASE_BY_ID.get(input.id)!;
    const edit: Record<string, unknown> = {};
    if (label !== base.label) edit.label = label;
    if (summary !== base.summary) edit.summary = summary;
    if (JSON.stringify([...groups].sort()) !== JSON.stringify([...base.groups].sort())) edit.groups = groups;
    next.renamed = { ...(overlay.renamed ?? {}) };
    if (Object.keys(edit).length) next.renamed[input.id] = edit;
    else delete next.renamed[input.id];
  } else {
    const id = input.id ?? newUseCaseId();
    const existing = overlay.added?.[id];
    next.added = {
      ...(overlay.added ?? {}),
      [id]: {
        id, label, summary, groups,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        createdBy: existing?.createdBy ?? editor ?? undefined,
      },
    };
    await save(next);
    return { ok: true, id };
  }

  await save(next);
  return { ok: true, id: input.id };
}

/**
 * Retire an entry. Never deletes — an id accounts are recorded against has to
 * keep resolving, or their use cases silently disappear.
 *
 * `mergedInto` is what makes a merge work: retire "Technical Skills" pointing
 * at "Job-role-specific", and every account already carrying the old id reads
 * as the new one.
 */
export async function retireUseCaseAction(
  id: string,
  opts: { reason?: string; mergedInto?: string } = {},
): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  if (!id) return { ok: false, error: "Missing use case." };

  const overlay = await load();
  const live = resolveTaxonomy(overlay, true);
  if (!live.some((u) => u.id === id)) return { ok: false, error: "That use case doesn't exist." };

  const mergedInto = clean(opts.mergedInto, 80) || undefined;
  if (mergedInto) {
    if (mergedInto === id) return { ok: false, error: "It can't be merged into itself." };
    if (!live.some((u) => u.id === mergedInto)) return { ok: false, error: "The target use case doesn't exist." };
    // Merging into something already retired would leave accounts pointing at a
    // dead end, unless that one itself forwards somewhere live.
    const target = overlay.retired?.[mergedInto];
    if (target && !target.mergedInto) return { ok: false, error: "That target is retired. Pick a live use case." };
  }

  await save({
    ...overlay,
    retired: {
      ...(overlay.retired ?? {}),
      [id]: {
        reason: clean(opts.reason, 400) || undefined,
        mergedInto,
        retiredAt: new Date().toISOString(),
        retiredBy: (await getCurrentUserEmail()) ?? undefined,
      },
    },
  });
  return { ok: true, id };
}

export async function restoreUseCaseAction(id: string): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const overlay = await load();
  if (!overlay.retired?.[id]) return { ok: true };
  const retired = { ...overlay.retired };
  delete retired[id];
  await save({ ...overlay, retired });
  return { ok: true, id };
}

export async function saveCategoryAction(input: {
  id?: string; label: string; blurb: string;
}): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const label = clean(input.label, 80);
  if (!label) return { ok: false, error: "Give the category a name." };

  const overlay = await load();
  const clash = resolveGroups(overlay).find((g) => g.id !== input.id && g.label.toLowerCase() === label.toLowerCase());
  if (clash) return { ok: false, error: `"${clash.label}" already exists.` };

  // A shipped category is edited by writing an override under its own id, so
  // one code path covers both "rename Enablement" and "add a new category".
  const id = input.id ?? newGroupId();
  await save({
    ...overlay,
    groups: { ...(overlay.groups ?? {}), [id]: { id, label, blurb: clean(input.blurb, 300) } },
    // Renaming a category the team had previously removed brings it back.
    hiddenGroups: (overlay.hiddenGroups ?? []).filter((g) => g !== id),
  });
  return { ok: true, id };
}

/** Undo a rename on a shipped category, restoring its original wording. */
export async function resetCategoryAction(id: string): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  if (!isShippedGroup(id)) return { ok: false, error: "That category has no shipped wording to restore." };
  const overlay = await load();
  if (!overlay.groups?.[id]) return { ok: true };
  const groups = { ...overlay.groups };
  delete groups[id];
  await save({ ...overlay, groups });
  return { ok: true, id };
}

/**
 * Remove a category — shipped or team-created.
 *
 * Only ever once it is EMPTY. A use case filed under a category that no longer
 * exists would render with a missing label and become unreachable by filter,
 * so the move has to happen first and the error says so.
 *
 * A shipped category is hidden rather than deleted, because historical entries
 * may still carry its id and hiding is reversible; a team-created one is
 * genuinely removed.
 */
export async function deleteCategoryAction(id: string): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const overlay = await load();
  if (!resolveGroups(overlay).some((g) => g.id === id)) return { ok: false, error: "That category doesn't exist." };

  const inUse = resolveTaxonomy(overlay, true).filter((u) => (u.groups as string[]).includes(id));
  if (inUse.length) {
    const names = inUse.slice(0, 3).map((u) => u.label).join(", ");
    return {
      ok: false,
      error: `${inUse.length} use case${inUse.length === 1 ? " is" : "s are"} still filed under it (${names}${inUse.length > 3 ? "…" : ""}). Move them first.`,
    };
  }

  if (isShippedGroup(id)) {
    await save({ ...overlay, hiddenGroups: [...new Set([...(overlay.hiddenGroups ?? []), id])] });
  } else {
    const groups = { ...(overlay.groups ?? {}) };
    delete groups[id];
    await save({ ...overlay, groups });
  }
  return { ok: true };
}

/** Bring a hidden shipped category back. */
export async function restoreCategoryAction(id: string): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const overlay = await load();
  await save({ ...overlay, hiddenGroups: (overlay.hiddenGroups ?? []).filter((g) => g !== id) });
  return { ok: true, id };
}

/** Drop the whole overlay — back to the shipped 23. */
export async function resetTaxonomyAction(): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  await save({});
  return { ok: true };
}
