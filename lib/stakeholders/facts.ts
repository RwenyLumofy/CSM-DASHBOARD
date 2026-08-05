/* =========================================================================
   Stakeholder facts for the health engine.

   WHAT THIS REPLACED. The engine's four relationship facts — single_threaded,
   sponsor_access, champion_left, economic_buyer_known — came from the CS Pulse
   questionnaire alone, with single_threaded falling back to a count of contacts
   flagged `isPrimary` in HubSpot. The stakeholder mapping never fed the score
   at all, so a CSM could map an executive sponsor, a champion and a buyer and
   the engine would still cap the account for having no sponsor access, because
   nobody had answered a question.

   THE PRECEDENCE, AND WHY. A Pulse answer always wins. It is a judgement a CSM
   made deliberately — "I know we look multi-threaded on paper, but only one of
   them takes my calls" is exactly the kind of thing the roster cannot see, and
   overwriting it with a headcount would replace knowledge with bookkeeping.
   These derivations fill the BLANKS: where the question was left unanswered,
   the mapped stakeholders answer it instead of the fact staying null and the
   rule silently never firing.

   `null` is preserved as a third state throughout. An unanswered question on
   an account with no stakeholder records is not "false" — the qualification
   gates use `ne: true` precisely so our own missing data cannot penalise a
   customer, and returning false here would undo that.
   ========================================================================= */

import { CRITICAL_ROLES, type StakeholderProfile, type StakeholderRole } from "./profile";

export interface StakeholderFacts {
  single_threaded: boolean | null;
  sponsor_access: boolean | null;
  champion_left: boolean | null;
  economic_buyer_known: boolean | null;
  /** How many people actually count, for the evidence line. */
  activeStakeholders: number;
  /** Which of the four commercial roles are covered. */
  criticalRolesCovered: StakeholderRole[];
}

/** Someone who has left is kept as a record — it explains why a relationship
 *  went cold — but never counts as coverage. Same rule as the Stakeholders
 *  tab's coverage warnings, deliberately: two definitions of "active" would
 *  let the tab and the score disagree about the same account. */
export const isActive = (p: StakeholderProfile) => p.engagementStatus !== "left_company";

const NO_DATA: StakeholderFacts = {
  single_threaded: null, sponsor_access: null, champion_left: null,
  economic_buyer_known: null, activeStakeholders: 0, criticalRolesCovered: [],
};

/**
 * Derive what the stakeholder roster can prove.
 *
 * An account with NO profiles returns all-null rather than a set of falses:
 * absence of records is absence of evidence, and the engine treats the two
 * differently on purpose.
 */
export function stakeholderFacts(profiles: StakeholderProfile[]): StakeholderFacts {
  if (!profiles.length) return NO_DATA;

  const active = profiles.filter(isActive);
  const has = (r: StakeholderRole) => active.some((p) => p.roles.includes(r));

  /* A champion is "left" only when we HAD one and every one of them has gone.
     An account that never had a champion has not lost one — that is the
     missing-role gap, which is a different signal with a different remedy. */
  const champions = profiles.filter((p) => p.roles.includes("champion"));
  const championLeft = champions.length > 0 && champions.every((p) => !isActive(p));

  return {
    // Fewer than two people means one resignation ends the relationship. Same
    // threshold as SINGLE_THREADED_AT in coverage.ts.
    single_threaded: active.length < 2,
    sponsor_access: has("executive_sponsor") || has("economic_buyer"),
    champion_left: championLeft,
    economic_buyer_known: has("economic_buyer"),
    activeStakeholders: active.length,
    criticalRolesCovered: CRITICAL_ROLES.filter((r) => has(r)),
  };
}

/**
 * Merge a CSM's Pulse answer with what the roster shows.
 *
 * Pulse first, roster second, the existing fallback last. Written as one
 * function so every caller applies the same precedence — the four facts drifted
 * apart once already, when `champion_left` defaulted to `false` while its three
 * siblings defaulted to `null`.
 */
export const preferAnswered = <T>(answered: T | null | undefined, derived: T | null, fallback: T | null = null): T | null =>
  answered ?? derived ?? fallback;
