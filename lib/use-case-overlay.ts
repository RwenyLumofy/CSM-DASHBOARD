/* =========================================================================
   Editable taxonomy — the overlay that sits on top of the shipped 23.

   WHY AN OVERLAY AND NOT A TABLE. The published taxonomy lives in code
   (lib/use-cases.ts) because it's the thing aliases resolve onto and reports
   aggregate over. But the team owns it, not the codebase: they need to add
   Qiwa Disclosure, merge Technical Skills into Job-role-specific, rename
   things, and recut categories — without a deploy.

   So the code list is a SEED, and everything the team does is recorded as a
   delta in workspace_config:

     renamed[id]   label / summary / category overrides on a shipped entry
     added[id]     entries the team created, with ids of their own
     retired[id]   entries taken out of the picker, WITH A REASON

   RETIRE, NEVER DELETE. An id that accounts are already recorded against must
   keep resolving forever, or their use cases silently vanish. Retiring hides
   it from the picker and marks it on any account still carrying it — which is
   exactly what you want when merging: retire "Technical Skills", point it at
   its successor, and every account already on it reads as the merged entry.
   That is why `mergedInto` exists rather than a plain delete.

   Ids are never reused. A new entry gets `uc_<random>`, so nothing the team
   creates can ever collide with a shipped id or with a previously retired one.
   ========================================================================= */

import { USE_CASES, USE_CASE_GROUPS, type UseCaseGroup, type UseCaseOption } from "@/lib/use-cases";

export const TAXONOMY_KEY = "use_case_taxonomy";

export interface TaxonomyEdit {
  label?: string;
  summary?: string;
  groups?: string[];
}

export interface TaxonomyAddition {
  id: string;
  label: string;
  summary: string;
  groups: string[];
  createdAt?: string;
  createdBy?: string;
}

export interface TaxonomyRetirement {
  reason?: string;
  /** When retiring as part of a merge, the id that supersedes it. Accounts
   *  still carrying the retired id are read as the successor. */
  mergedInto?: string;
  retiredAt?: string;
  retiredBy?: string;
}

export interface CustomGroup {
  id: string;
  label: string;
  blurb: string;
}

export interface TaxonomyOverlay {
  renamed?: Record<string, TaxonomyEdit>;
  added?: Record<string, TaxonomyAddition>;
  retired?: Record<string, TaxonomyRetirement>;
  /** Categories: team-created ones AND label/blurb overrides on shipped ones,
   *  keyed the same way so one code path handles both. */
  groups?: Record<string, CustomGroup>;
  /** Shipped categories the team has removed. Hidden rather than deleted,
   *  because historical entries are still filed under them. */
  hiddenGroups?: string[];
}

/** An entry as the app should show it, after the overlay is applied. */
export interface ResolvedUseCase extends UseCaseOption {
  /** True when this entry was created by the team rather than shipped. */
  custom?: boolean;
  /** True when the team has edited a shipped entry. */
  edited?: boolean;
  retired?: TaxonomyRetirement;
}

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function normalizeOverlay(raw: unknown): TaxonomyOverlay {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: TaxonomyOverlay = {};

  if (r.renamed && typeof r.renamed === "object") {
    out.renamed = {};
    for (const [id, v] of Object.entries(r.renamed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as Record<string, unknown>;
      const edit: TaxonomyEdit = {};
      const label = str(e.label); if (label) edit.label = label;
      const summary = str(e.summary, 400); if (summary) edit.summary = summary;
      if (Array.isArray(e.groups)) edit.groups = e.groups.filter((g): g is string => typeof g === "string");
      if (Object.keys(edit).length) out.renamed[id] = edit;
    }
  }

  if (r.added && typeof r.added === "object") {
    out.added = {};
    for (const [id, v] of Object.entries(r.added as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as Record<string, unknown>;
      const label = str(e.label);
      if (!label) continue; // an unnamed entry is unusable
      out.added[id] = {
        id,
        label,
        summary: str(e.summary, 400) ?? "",
        groups: Array.isArray(e.groups) ? e.groups.filter((g): g is string => typeof g === "string") : [],
        createdAt: str(e.createdAt, 40) ?? undefined,
        createdBy: str(e.createdBy) ?? undefined,
      };
    }
  }

  if (r.retired && typeof r.retired === "object") {
    out.retired = {};
    for (const [id, v] of Object.entries(r.retired as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as Record<string, unknown>;
      out.retired[id] = {
        reason: str(e.reason, 400) ?? undefined,
        mergedInto: str(e.mergedInto) ?? undefined,
        retiredAt: str(e.retiredAt, 40) ?? undefined,
        retiredBy: str(e.retiredBy) ?? undefined,
      };
    }
  }

  if (r.groups && typeof r.groups === "object") {
    out.groups = {};
    for (const [id, v] of Object.entries(r.groups as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const e = v as Record<string, unknown>;
      const label = str(e.label);
      if (!label) continue;
      out.groups[id] = { id, label, blurb: str(e.blurb, 300) ?? "" };
    }
  }

  if (Array.isArray(r.hiddenGroups)) {
    out.hiddenGroups = r.hiddenGroups.filter((g): g is string => typeof g === "string");
  }

  return out;
}

/**
 * Every category the app should offer: the shipped six with any renames
 * applied and any removals honoured, followed by the team's own.
 *
 * A removed shipped category is HIDDEN, not deleted — entries created before
 * the removal still carry its id, and dropping it outright would leave them
 * filed under nothing. The manager refuses the removal while anything is still
 * in it, so hidden should only ever mean genuinely empty.
 */
export function resolveGroups(overlay: TaxonomyOverlay): { id: string; label: string; blurb: string }[] {
  const edits = overlay.groups ?? {};
  const hidden = new Set(overlay.hiddenGroups ?? []);
  const shippedIds = new Set<string>(USE_CASE_GROUPS.map((g) => g.id as string));

  const shipped = USE_CASE_GROUPS
    .filter((g) => !hidden.has(g.id))
    .map((g) => {
      const e = edits[g.id];
      return e ? { id: g.id, label: e.label, blurb: e.blurb || g.blurb } : { id: g.id, label: g.label, blurb: g.blurb };
    });

  const custom = Object.values(edits).filter((g) => !shippedIds.has(g.id) && !hidden.has(g.id));
  return [...shipped, ...custom];
}

/** True when this category ships with the product (so removing it hides rather
 *  than deletes, and resetting restores its original wording). */
export const isShippedGroup = (id: string): boolean => USE_CASE_GROUPS.some((g) => (g.id as string) === id);

/**
 * The taxonomy as it should be used.
 *
 * `includeRetired` is for the management screen, which has to show what was
 * retired so it can be brought back. Everywhere else — the picker, adoption —
 * wants the live list only.
 */
export function resolveTaxonomy(overlay: TaxonomyOverlay, includeRetired = false): ResolvedUseCase[] {
  const retired = overlay.retired ?? {};
  const renamed = overlay.renamed ?? {};

  const shipped: ResolvedUseCase[] = USE_CASES.map((u) => {
    const edit = renamed[u.id];
    return {
      ...u,
      label: edit?.label ?? u.label,
      summary: edit?.summary ?? u.summary,
      groups: (edit?.groups as UseCaseGroup[] | undefined) ?? u.groups,
      edited: !!edit,
      retired: retired[u.id],
    };
  });

  const added: ResolvedUseCase[] = Object.values(overlay.added ?? {}).map((a) => ({
    id: a.id,
    label: a.label,
    summary: a.summary,
    groups: a.groups as UseCaseGroup[],
    custom: true,
    retired: retired[a.id],
  }));

  const all = [...shipped, ...added];
  return includeRetired ? all : all.filter((u) => !u.retired);
}

/**
 * Follow merge pointers so an account recorded against a retired id reads as
 * its successor. Bounded, because a mis-entered chain (A→B→A) must not spin.
 */
export function resolveThroughMerges(id: string, overlay: TaxonomyOverlay): string {
  const retired = overlay.retired ?? {};
  let cursor = id;
  const seen = new Set<string>();
  while (retired[cursor]?.mergedInto && !seen.has(cursor)) {
    seen.add(cursor);
    cursor = retired[cursor].mergedInto!;
  }
  return cursor;
}

/** A new id. Random, so it can never collide with a shipped or retired one. */
export function newUseCaseId(): string {
  return `uc_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

export function newGroupId(): string {
  return `grp_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
