/* =========================================================================
   Does a health score rest on anything the CUSTOMER did?

   WHY THIS EXISTS. computeHealthScore renormalizes over whichever metrics
   produced a value, so an account with no customer signal at all is scored
   entirely on how completely we have filled in our OWN records — profile
   fields, use cases, stakeholder mapping, the onboarding window. The number
   that comes out is a real number in the wrong units, and nothing on screen
   distinguishes it from a score built on usage, CSAT and a CS Pulse.

   Both directions of that error were live in production on 2026-08-03:

     Masdar Building Materials   "Healthy"  76   profile + onboarding only
     DHL                         "At risk"   0   profile fields only

   The false green is the dangerous one. "Healthy, 76" on an account nobody
   has any evidence about is a reason not to call them.

   Derived from the stored components at READ time rather than persisted on
   the score, deliberately: every health row already on the table gets the
   correct treatment without a migration or a full recompute, and the rule can
   be retuned without rewriting 133 rows.
   ========================================================================= */

import type { HealthComponents, HealthScore } from "@/lib/types";

/**
 * Metrics that say something about the CUSTOMER — what they did, or what they
 * told us.
 *
 * Everything absent from this set describes our own record-keeping instead:
 * `profile_complete`, `use_case_set` and `stakeholder_mapping` measure whether
 * a CSM has filled Signal in, and `onboarding_period` is a date window we set.
 * Those are worth tracking, and they legitimately contribute to a score — they
 * just cannot BE the score.
 *
 * `usage` counts as evidence even at zero: a snapshot showing 20 seats and no
 * monthly actives is not a gap, it is the single loudest churn signal we hold.
 * That distinction is the whole point of this module.
 */
export const CUSTOMER_EVIDENCE_METRICS = new Set([
  // Product usage — what they actually did.
  "reach", "progress", "outcomes",
  // The CS Pulse dimensions — what the CSM saw and recorded.
  "stakeholder", "engagement", "renewal",
  // Support — what happened when they needed help.
  "sla", "incidents", "aged", "ticket_sat",
  // Survey NPS.
  "sentiment",

  /* Deliberately NOT here:
     · `breadth` — use-case breadth is Signal's own record of what the account
       runs, the same kind of thing as the `use_case_set` this rule already
       excluded. It is present on 96% of accounts, so counting it would mark
       almost everything assessed and defeat the rule.
     · `product`, `pulse`, `support` — the parent aggregates. `product` is
       present whenever ANY of its children are, breadth included, so keying
       off it would let a use-case count alone stand in for evidence.

     These are the ENGINE's component ids. The set previously held the retired
     formula's keys (usage, csat, nps, sla_breaches, cs_pulse), which share not
     one name with what the engine stores — so after the migration every one of
     133 accounts rendered "Not assessed" on a perfectly good score. */
]);

/** True when at least one metric reflects the customer rather than our records. */
export function hasCustomerEvidence(components: HealthComponents | null | undefined): boolean {
  if (!components) return false;
  return Object.keys(components).some((k) => CUSTOMER_EVIDENCE_METRICS.has(k));
}

/**
 * Whether a stored health score should be shown as a score at all.
 *
 * A null/absent health row is unassessed for the obvious reason. A present one
 * is unassessed when nothing behind it came from the customer.
 */
export function isAssessed(health: Pick<HealthScore, "components"> | null | undefined): boolean {
  return !!health && hasCustomerEvidence(health.components);
}

/** What to show instead of a tier when there is nothing to judge. */
export const NOT_ASSESSED_LABEL = "Not assessed";
