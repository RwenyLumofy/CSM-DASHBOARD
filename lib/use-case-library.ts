/* =========================================================================
   What gets recorded about a use case — WRITTEN BY THE TEAM, not shipped.

   lib/use-cases.ts owns the taxonomy: ids, names, categories. Those are real,
   published, and not editable here. This file owns the longer content, and it
   ships EMPTY on purpose — an earlier version shipped a full written entry for
   all 23, authored in this repo rather than by Lumofy, when only four have a
   written page in the Notion library behind them. Invented prose in the same
   typeface as a real taxonomy is worse than a blank.

   THE SHAPE, AND WHY IT ISN'T THE NOTION SHAPE

   The Notion template (Goal · Key Challenges · Implementation Plan · Digital
   Enablement Tools · Consulting & Advisory · KPIs Impacted) is built to SELL
   and DELIVER a use case. A CSM opening this page has a narrower question:
   which of these is this client actually doing, and how do I tell it apart
   from the one next to it?

   So two fields exist here that appear nowhere in the Notion pages or the
   company profile, and they are the ones that make the taxonomy usable:

     soundsLike     the client's own words. Classification fails because a CSM
                    hears "our managers all onboard differently" and has to
                    reverse-engineer which of 23 product names that maps to.
                    This is the lookup in the direction the work arrives.

     confusedWith   names the neighbour and the distinguishing test. The direct
                    fix for Job-role-specific Training absorbing everything
                    nobody could classify: the ambiguity gets documented at the
                    point of choosing, not discovered later in a report.

   Everything else is deliberately short. A structure nobody can finish writing
   is worse than a smaller one they can — 23 entries have to actually get done.
   ========================================================================= */

import type { StakeholderRole } from "@/lib/stakeholders/profile";

/** Lumofy's product areas. Matches the `products` picklist on a HubSpot deal
 *  and the three sections of the company profile. */
export const MODULES = ["Perform", "Develop", "Engage"] as const;
export type Module = (typeof MODULES)[number];

export interface ConfusedWith {
  /** The neighbouring use case id. */
  id: string;
  /** How to tell them apart, in one line. */
  distinction: string;
}

export interface UseCaseEntry {
  /** Matches a UseCaseOption id in lib/use-cases.ts. */
  id: string;

  /** One sentence: what the client is trying to achieve. */
  goal: string;
  /** How a client describes it in their own words, before anyone names it. */
  soundsLike: string[];
  /** The artefacts this produces — what you could point at in the account. */
  delivers: string[];
  /** Neighbours it gets mixed up with, and the test that separates them. */
  confusedWith: ConfusedWith[];
  /** Observable signs, not KPIs — things you'd notice without a measurement
   *  programme in place. */
  watchFor: string[];

  /* ---- metadata, not prose ---- */
  /** Product areas this typically runs on. */
  modules: Module[];
  /** Who normally owns it on the client side. */
  stakeholderRoles: StakeholderRole[];
  /** The Notion page, when one exists. Provenance, so a CSM can always reach
   *  the fuller sales/delivery material rather than this summary of it. */
  sourceUrl: string | null;
}

/** Ships empty. Everything shown is written by the team. */
export const USE_CASE_LIBRARY: UseCaseEntry[] = [];

export const LIBRARY_BY_ID = new Map(USE_CASE_LIBRARY.map((e) => [e.id, e]));

/** Where team-written content lives, in workspace_config. */
export const LIBRARY_OVERRIDE_KEY = "use_case_library";

export type UseCaseOverride = Partial<Omit<UseCaseEntry, "id">> & {
  updatedAt?: string;
  updatedBy?: string;
};

const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/**
 * Every entry the team has actually written.
 *
 * Only ids present in `overrides` come back, and nothing is invented to fill a
 * gap: a use case nobody has written about has no entry, and the page says so.
 */
export function mergeLibrary(overrides: Record<string, UseCaseOverride> | null | undefined): UseCaseEntry[] {
  if (!overrides) return [];
  return Object.entries(overrides)
    .map(([id, o]) => ({
      id,
      goal: o.goal?.trim() ?? "",
      soundsLike: lines(o.soundsLike),
      delivers: lines(o.delivers),
      confusedWith: Array.isArray(o.confusedWith)
        ? o.confusedWith
            .filter((c): c is ConfusedWith => !!c && typeof c === "object" && typeof c.id === "string")
            .map((c) => ({ id: c.id, distinction: String(c.distinction ?? "").trim() }))
            .filter((c) => c.id)
        : [],
      watchFor: lines(o.watchFor),
      modules: Array.isArray(o.modules)
        ? o.modules.filter((m): m is Module => (MODULES as readonly string[]).includes(m as string))
        : [],
      stakeholderRoles: Array.isArray(o.stakeholderRoles) ? o.stakeholderRoles : [],
      sourceUrl: typeof o.sourceUrl === "string" && o.sourceUrl.trim() ? o.sourceUrl.trim() : null,
    }))
    // An override carrying only audit fields, or only metadata, isn't a
    // description — the page should still read as undocumented.
    .filter((e) => e.goal || e.soundsLike.length || e.delivers.length || e.confusedWith.length || e.watchFor.length);
}

/** True when anything has been written for this use case. */
export function isCustomised(id: string, overrides: Record<string, UseCaseOverride> | null | undefined): boolean {
  const o = overrides?.[id];
  if (!o) return false;
  return Object.keys(o).some((k) => k !== "updatedAt" && k !== "updatedBy");
}

/** How much of an entry is written, for the "what still needs doing" view.
 *  Metadata isn't counted — an entry carrying only a module tag tells a CSM
 *  nothing. */
export function completeness(e: UseCaseEntry | undefined): number {
  if (!e) return 0;
  const filled = [e.goal, e.soundsLike.length, e.delivers.length, e.confusedWith.length, e.watchFor.length]
    .filter(Boolean).length;
  return filled / 5;
}
