/* =========================================================================
   Editorial content for a use case — WRITTEN BY THE TEAM, not shipped.

   lib/use-cases.ts owns the taxonomy — ids, names, categories, all of which
   come from the published Lumofy library and are real. This file owns the
   longer-form content that sits under a name.

   IT SHIPS EMPTY, ON PURPOSE.

   An earlier version shipped a full written entry for all 23 — definition,
   what it looks like in practice, examples, evidence, pitfalls. That text was
   authored here rather than by Lumofy, and only four of the 23 have a written
   page in the Notion library behind them. So the app was presenting invented
   prose to a CSM in the same typeface as the real taxonomy, with nothing to
   tell the two apart. A definition somebody might repeat to a client has to
   come from the people who own the product.

   So the baseline is empty and everything displayed is written by the team,
   through the editor on /use-cases. An entry with nothing written shows as
   undocumented, which is the truth. The shape below is deliberately provisional
   — it is a container, not a proposal about how a use case should be described,
   and it should change once that structure is decided.
   ========================================================================= */

import type { StakeholderRole } from "@/lib/stakeholders/profile";

export interface UseCaseEntry {
  /** Matches a UseCaseOption id in lib/use-cases.ts. */
  id: string;
  /** One sentence — what the client is trying to achieve. */
  definition: string;
  /** What it actually looks like inside the account. */
  inPractice: string;
  /** Recognisable activities — helps tell neighbouring use cases apart. */
  examples: string[];
  /** Observable evidence it is working. */
  evidence: string[];
  /** The way this one usually goes wrong. */
  pitfall: string;
  /** Who normally owns it on the client side. */
  stakeholderRoles: StakeholderRole[];
}

export const USE_CASE_LIBRARY: UseCaseEntry[] = [];

export const LIBRARY_BY_ID = new Map(USE_CASE_LIBRARY.map((e) => [e.id, e]));

/** Team-authored additions, stored in workspace_config. */
export const LIBRARY_OVERRIDE_KEY = "use_case_library";

export type UseCaseOverride = Partial<Omit<UseCaseEntry, "id">> & {
  updatedAt?: string;
  updatedBy?: string;
};

/**
 * Every entry the team has actually written.
 *
 * Only ids present in `overrides` come back. Nothing is invented to fill a gap:
 * a use case nobody has written about simply has no entry, and the page says so
 * rather than showing plausible text of unknown origin.
 */
export function mergeLibrary(overrides: Record<string, UseCaseOverride> | null | undefined): UseCaseEntry[] {
  if (!overrides) return [];
  return Object.entries(overrides)
    .map(([id, o]) => ({
      id,
      definition: o.definition?.trim() ?? "",
      inPractice: o.inPractice?.trim() ?? "",
      examples: Array.isArray(o.examples) ? o.examples.filter(Boolean) : [],
      evidence: Array.isArray(o.evidence) ? o.evidence.filter(Boolean) : [],
      pitfall: o.pitfall?.trim() ?? "",
      stakeholderRoles: Array.isArray(o.stakeholderRoles) ? o.stakeholderRoles : [],
    }))
    // An override holding only audit fields isn't content.
    .filter((e) => e.definition || e.inPractice || e.pitfall || e.examples.length || e.evidence.length || e.stakeholderRoles.length);
}

/** True when the team has written anything for this use case. */
export function isCustomised(id: string, overrides: Record<string, UseCaseOverride> | null | undefined): boolean {
  const o = overrides?.[id];
  if (!o) return false;
  return Object.keys(o).some((k) => k !== "updatedAt" && k !== "updatedBy");
}
