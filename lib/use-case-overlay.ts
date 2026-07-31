/* =========================================================================
   The Use Case database — a flat, admin-curated set of definitions and
   categories, stored in workspace_config. Nothing here is shipped in code and
   nothing here is preset: a fresh workspace has zero categories and zero use
   cases until an admin creates them via TaxonomyManager.

   THIS MODULE IS DELIBERATELY UNLINKED FROM lib/use-cases.ts. That file owns
   the separate, older, shipped-26 taxonomy that the account-level "confirmed
   vs declared" picker uses — it is not a seed for this one, and the two never
   share an id. A use case created here is invisible to that picker, and vice
   versa. This was coupled once, by mistake, and un-coupling it is the reason
   this file no longer imports anything from lib/use-cases.ts.

   RETIRE, NEVER DELETE (for use cases). The client-page "associate" feature
   records an account's implementation against a use-case id from this
   database — deleting the id outright would silently orphan that record.
   Retiring keeps the id resolving (via resolveThroughMerges, for the merge
   case) and marks it out of the active picker; it can be restored later.

   Categories don't need retire: TaxonomyManager already refuses to delete one
   while any live use case still lists it, so a delete that succeeds is always
   genuinely empty and safe to remove outright.

   Ids are never reused. A new entry gets `uc_<random>`/`grp_<random>`, so
   nothing collides with a previously retired one.
   ========================================================================= */

export const TAXONOMY_KEY = "use_case_taxonomy";

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
  added?: Record<string, TaxonomyAddition>;
  retired?: Record<string, TaxonomyRetirement>;
  groups?: Record<string, CustomGroup>;
}

/** A use case as the app should show it. Every field is team-authored — there
 *  is no shipped/custom distinction left to track. */
export interface ResolvedUseCase {
  id: string;
  label: string;
  summary: string;
  groups: string[];
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

  return out;
}

/** Every category that exists — purely what the team created. No seed. */
export function resolveGroups(overlay: TaxonomyOverlay): { id: string; label: string; blurb: string }[] {
  return Object.values(overlay.groups ?? {});
}

/**
 * The database as it should be used.
 *
 * `includeRetired` is for the management screen, which has to show what was
 * retired so it can be brought back. Everywhere else wants the live list only.
 */
export function resolveTaxonomy(overlay: TaxonomyOverlay, includeRetired = false): ResolvedUseCase[] {
  const retired = overlay.retired ?? {};
  const all: ResolvedUseCase[] = Object.values(overlay.added ?? {}).map((a) => ({
    id: a.id,
    label: a.label,
    summary: a.summary,
    groups: a.groups,
    retired: retired[a.id],
  }));
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

/** A new id. Random, so it can never collide with a previously retired one. */
export function newUseCaseId(): string {
  return `uc_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

export function newGroupId(): string {
  return `grp_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}
