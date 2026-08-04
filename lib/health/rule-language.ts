/* =========================================================================
   Rules, in words a CS leader can check.

   The editor shows a toggle and a number; without a sentence saying what the
   rule actually reads, "Not single-threaded / on / 75" is unauditable. These
   restatements are generated from the same `when` the engine evaluates, so a
   condition and its description cannot drift — the alternative, a hand-written
   label per rule, is exactly how a UI ends up describing behaviour the code
   stopped having.
   ========================================================================= */

import { editableThreshold } from "./model-overrides";

/** Signal and metric keys in the language the product uses elsewhere. */
const TERMS: Record<string, string> = {
  product_adoption_score: "Product adoption",
  cs_pulse_score: "CS Pulse",
  support_reliability_score: "Support & reliability",
  client_sentiment_score: "Client sentiment",
  data_coverage: "Data coverage",
  calculated_score: "The score",
  momentum_delta: "Score movement",
  single_threaded: "the account is single-threaded",
  sponsor_access: "there is sponsor or economic-buyer access",
  economic_buyer_known: "the economic buyer is known",
  champion_left: "the champion has left",
  competitive_replacement: "a competitor is replacing us",
  suspension_requested: "a suspension was requested",
  scope_reduction_requested: "a scope reduction was requested",
  executive_escalation_unresolved: "an executive escalation is unresolved",
  confirmed_termination: "termination is confirmed",
  termination_notice_received: "a termination notice was received",
  imminent_churn: "churn is imminent",
  renewal_intent: "renewal intent",
  valid_cs_pulse_exists: "a current CS Pulse exists",
  renewal_within_90d: "renewal is within 90 days",
  active_critical_incidents: "open critical incidents",
  days_since_meaningful_activity: "days since meaningful activity",
};

/* Negative readings, written out rather than derived. "NOT there is sponsor
   access" and "the account is single-threaded is not true" both parse, and
   both are the kind of sentence a reader skips instead of checking — which
   defeats the point of showing the rule in words at all. */
const NEGATIONS: Record<string, string> = {
  single_threaded: "the account is not single-threaded",
  sponsor_access: "there is no sponsor or economic-buyer access",
  economic_buyer_known: "the economic buyer is unknown",
  champion_left: "the champion has not left",
  competitive_replacement: "no competitor is replacing us",
  confirmed_termination: "termination is not confirmed",
  valid_cs_pulse_exists: "there is no current CS Pulse",
  executive_escalation_unresolved: "no executive escalation is outstanding",
  suspension_requested: "no suspension was requested",
  scope_reduction_requested: "no scope reduction was requested",
};

const term = (k: string) => TERMS[k] ?? k.replace(/_/g, " ");
const negated = (k: string) => NEGATIONS[k] ?? `${term(k)} is false`;

function phrase(key: string, cmp: Record<string, unknown>): string {
  const t = term(key);
  if (cmp.isTrue === true) return t;
  if (cmp.isFalse === true) return negated(key);
  // `ne: true` is "anything but yes" — false OR unanswered. Say so, because
  // that distinction is the whole reason the operator was chosen.
  if (cmp.ne === true) return `${negated(key)} (or unanswered)`;
  if (cmp.ne !== undefined) return `${t} is not ${cmp.ne}`;
  if (cmp.eq !== undefined) return `${t} is ${cmp.eq}`;
  if (cmp.present !== undefined) return cmp.present ? `${t} is recorded` : `${t} is not recorded`;
  for (const [op, word] of [["gte", "is at least"], ["gt", "is above"], ["lte", "is at most"], ["lt", "is below"]] as const) {
    if (cmp[op] !== undefined) {
      const v = cmp[op] as number;
      return `${t} ${word} ${key === "data_coverage" ? `${Math.round(v * 100)}%` : v}`;
    }
  }
  return t;
}

/** One sentence for a whole condition set. Multiple keys are AND-ed, which is
 *  how the engine evaluates them. */
export function describeCondition(when: Record<string, Record<string, unknown>>): string {
  const parts = Object.entries(when ?? {}).map(([k, c]) => phrase(k, c));
  if (!parts.length) return "always";
  return parts.join(" and ");
}

/** What a qualification gate does when it fails. */
export function describeGateEffect(capTo: string): string {
  return `Fails → capped to ${capTo}`;
}

/** What a status rule does when it fires. */
export function describeRuleEffect(action: string, targetStatus?: string | null): string {
  switch (action) {
    case "churned": return `Fires → status becomes ${targetStatus ?? "Churned"}`;
    case "not_assessed": return "Fires → status becomes Not Assessed";
    case "replace": return `Fires → status becomes ${targetStatus ?? "Not Assessed"}`;
    case "force": return `Fires → forced to ${targetStatus ?? "Critical"}`;
    case "cap_max": return `Fires → cannot read better than ${targetStatus ?? "Watch"}`;
    default: return "Fires → recorded as a warning only";
  }
}

/** The number an admin may move, or null when the rule is toggle-only. */
export { editableThreshold };
