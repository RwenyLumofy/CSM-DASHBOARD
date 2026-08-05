/* =========================================================================
   One answer to "how is this account doing", for every surface.

   The stored `tier` is the APPLIED status — what the engine concluded after
   its qualification gates and status rules ran. Re-deriving a band from the
   raw score, as healthBand() does, throws that away: an account scoring 90 and
   capped to Watch reads Healthy on any surface that re-bands, and Watch on the
   profile. The score and the status legitimately disagree; the status is the
   one that means "how is this account doing".

   Three statuses are lifecycle facts rather than judgements — Churned,
   Implementation and Not Assessed. Counting them as at-risk is how the old
   dashboard reported 75 at-risk accounts on a book that was mostly churned.
   ========================================================================= */

import type { HealthScore } from "@/lib/types";

export type RiskLevel = "healthy" | "watch" | "at_risk" | "critical";
/** Not a judgement: no score should be read from these. */
export type NonJudgement = "churned" | "implementation" | "not_assessed";
export type AccountStatus = RiskLevel | NonJudgement;

/* Matched case- and space-insensitively. The old engine wrote "At risk", this
   one writes "At Risk", and bands are admin-renameable — so a literal string
   comparison silently stops matching the day somebody edits a tier name. */
const CANON: Record<string, AccountStatus> = {
  healthy: "healthy",
  watch: "watch",
  atrisk: "at_risk",
  critical: "critical",
  churned: "churned",
  implementation: "implementation",
  notassessed: "not_assessed",
};

const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * The account's status, from the stored tier.
 *
 * An unrecognised tier — an admin-renamed band like "Thriving" — falls back to
 * the score, because a custom name still sits in a numeric band and guessing
 * "not assessed" would hide the account from every count.
 */
export function accountStatus(health: Pick<HealthScore, "tier" | "score" | "components"> | null | undefined): AccountStatus {
  if (!health) return "not_assessed";
  const known = CANON[key(health.tier ?? "")];
  if (known) return known;
  return bandFromScore(health.score);
}

/** Score → risk level on the model's own cutoffs (65 / 50 / 25). Only used for
 *  tiers this module doesn't recognise, and for rows written before the engine
 *  switch. */
export function bandFromScore(score: number): RiskLevel {
  if (score >= 65) return "healthy";
  if (score >= 50) return "watch";
  if (score >= 25) return "at_risk";
  return "critical";
}

/** Does this account need attention? Churned and un-scored accounts do not —
 *  they need a decision or a data fix, which is a different queue. */
export function isAtRisk(health: Parameters<typeof accountStatus>[0]): boolean {
  const s = accountStatus(health);
  return s === "at_risk" || s === "critical";
}

/** Should this account appear in portfolio health counts at all? */
export function isJudged(health: Parameters<typeof accountStatus>[0]): boolean {
  const s = accountStatus(health);
  return s !== "churned" && s !== "implementation" && s !== "not_assessed";
}

/** Human label for a status, for surfaces that render it directly. */
export const STATUS_LABEL: Record<AccountStatus, string> = {
  healthy: "Healthy",
  watch: "Watch",
  at_risk: "At Risk",
  critical: "Critical",
  churned: "Churned",
  implementation: "Implementation",
  not_assessed: "Not assessed",
};
