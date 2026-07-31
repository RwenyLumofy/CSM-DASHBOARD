"use server";

/* Managing the taxonomy itself — add, rename, recategorise, retire.

   Distinct from actions.ts, which edits the DEFINITION of an entry. This file
   changes what entries exist at all, so it is stricter: retiring is the only
   way to remove a use case that might have account associations, and it
   always records a reason.

   Every use case and category is a plain, team-created row in workspace_config
   (lib/use-case-overlay) — there is no shipped baseline to diff against or
   fall back to, so every save here writes (or removes) a row directly. */

import { revalidatePath } from "next/cache";
import { isAdminOrSuper, getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import {
  TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups,
  newUseCaseId, newGroupId, type TaxonomyOverlay,
} from "@/lib/use-case-overlay";
import { LIBRARY_OVERRIDE_KEY } from "@/lib/use-case-library";

export interface TaxonomyResult { ok: boolean; error?: string; id?: string }

async function load(): Promise<TaxonomyOverlay> {
  const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
  return normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
}
async function save(next: TaxonomyOverlay): Promise<void> {
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(TAXONOMY_KEY, next);
  revalidatePath("/use-cases");
  revalidatePath("/clients", "layout"); // the client-page portfolio reads the same list
}

async function guard(): Promise<string | null> {
  if (!hasDatabase()) return "No database configured.";
  if (!(await isAdminOrSuper())) return "Admin access required to change the taxonomy.";
  return null;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Create a use case, or edit one that already exists. */
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
  const id = input.id ?? newUseCaseId();
  const existing = overlay.added?.[id];
  const next: TaxonomyOverlay = {
    ...overlay,
    added: {
      ...(overlay.added ?? {}),
      [id]: {
        id, label, summary, groups,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        createdBy: existing?.createdBy ?? editor ?? undefined,
      },
    },
  };
  await save(next);
  return { ok: true, id };
}

/**
 * Retire an entry. Never deletes — an id an account is recorded against has to
 * keep resolving, or its "associate" record silently orphans.
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

  const id = input.id ?? newGroupId();
  await save({
    ...overlay,
    groups: { ...(overlay.groups ?? {}), [id]: { id, label, blurb: clean(input.blurb, 300) } },
  });
  return { ok: true, id };
}

/**
 * Remove a category. Only ever once it is EMPTY — a use case filed under a
 * category that no longer exists would render with a missing label and become
 * unreachable by filter, so the move has to happen first and the error says
 * so. Nothing outside this taxonomy ever references a category id directly
 * (unlike a use case id, which an account's associate record can point at), so
 * once it passes that check a real delete is always safe.
 */
export async function deleteCategoryAction(id: string): Promise<TaxonomyResult> {
  const denied = await guard();
  if (denied) return { ok: false, error: denied };
  const overlay = await load();
  if (!resolveGroups(overlay).some((g) => g.id === id)) return { ok: false, error: "That category doesn't exist." };

  const inUse = resolveTaxonomy(overlay, true).filter((u) => u.groups.includes(id));
  if (inUse.length) {
    const names = inUse.slice(0, 3).map((u) => u.label).join(", ");
    return {
      ok: false,
      error: `${inUse.length} use case${inUse.length === 1 ? " is" : "s are"} still filed under it (${names}${inUse.length > 3 ? "…" : ""}). Move them first.`,
    };
  }

  const groups = { ...(overlay.groups ?? {}) };
  delete groups[id];
  await save({ ...overlay, groups });
  return { ok: true };
}

/**
 * Clear the whole database — every use case, every category, every
 * definition. There is nothing to "reset to" any more (no shipped baseline),
 * so this is a genuine wipe: both workspace_config keys the Universe owns are
 * emptied in one action. Used once per environment to start the pure database
 * from zero.
 */
export async function resetTaxonomyAction(): Promise<TaxonomyResult> {
  /* The same admin gate as every other taxonomy write. Destructive, but the
     taxonomy is the admin's to own, and the orphan-preserving logic below is
     what makes a wipe survivable — not a narrower role. */
  const denied = await guard();
  if (denied) return { ok: false, error: denied };

  const { getClients } = await import("@/lib/data");
  const { groupImplementationsByUseCase } = await import("@/lib/use-case-implementation");
  const { setWorkspaceConfigManyDb } = await import("@/lib/repo/drizzle");

  const overlay = await load();
  const stillReferenced = groupImplementationsByUseCase(await getClients());

  /* A wipe must not orphan. Any id an account is still recorded against keeps
     its taxonomy row — retired, so it is gone from every picker — because
     resolveTaxonomy emits only from `added`: drop the row and the profile
     renders a raw uc_xxxx id and /use-cases/[id] 404s. Same invariant the
     replace-import path has to honour. Everything unreferenced really does go. */
  const keptAdded: NonNullable<TaxonomyOverlay["added"]> = {};
  const keptRetired: NonNullable<TaxonomyOverlay["retired"]> = {};
  const keptGroups: NonNullable<TaxonomyOverlay["groups"]> = {};
  for (const [id, row] of Object.entries(overlay.added ?? {})) {
    if (!stillReferenced.has(id)) continue;
    keptAdded[id] = row;
    keptRetired[id] = overlay.retired?.[id] ?? { reason: "Kept only so existing account links keep resolving." };
    // Its categories have to survive too, or the kept row renders uncategorised.
    for (const g of row.groups) {
      const group = overlay.groups?.[g];
      if (group) keptGroups[g] = group;
    }
  }

  const next: TaxonomyOverlay = Object.keys(keptAdded).length
    ? { added: keptAdded, retired: keptRetired, groups: keptGroups }
    : {};

  await setWorkspaceConfigManyDb([
    { key: TAXONOMY_KEY, value: next },
    // The definitions go regardless: a retained row only needs to resolve to a
    // name, not to carry a problem/outcome nobody maintains any more.
    { key: LIBRARY_OVERRIDE_KEY, value: {} },
  ]);
  revalidatePath("/use-cases");
  revalidatePath("/clients", "layout");
  return { ok: true };
}
