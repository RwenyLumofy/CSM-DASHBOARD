/* =============================================================================
   Account facts loader — maps a client's REAL product/support/survey data (+ the
   CSM's CS Pulse) into the engine's `AccountFacts`. Objective components are
   auto-sourced from our tables; the CS Pulse ratings and risk signals are CSM
   judgment (captured in the pulse form). Dependency-light on purpose (only model
   types) so it's unit-testable and runnable in a shadow script.

   Metric→source mapping (data-driven, see docs/health-engine.md):
     Meaningful reach     active_users ÷ seats            (100% / 99% coverage)
     Workflow progress    learning_completions ÷ enroll.  (82% — broadest module)
     Completion/outcomes  pathway_completions ÷ enroll.   (78% — structured paths)
     Manager participation pm_cycles (≈always missing → its weight redistributes)
     Ticket satisfaction  support.csat × csatResponses
     Sentiment            survey NPS only, normalised (nps+100)/2
     SLA / incidents      no reliable source yet → left missing (redistributes)
   ============================================================================= */

import type { AccountFacts, MetricBag, MetricInput } from "./model";

/** CS Pulse — the CSM's read on the relationship. Ratings are keyed by the
 *  metric key each configured dimension maps to (so dimensions can be added/
 *  renamed in Settings without touching this), plus the qualitative risk
 *  signals only the CSM knows. */
export interface CsPulseInput {
  ratingsByMetricKey: Record<string, string>; // metricKey → cs_pulse tier key
  singleThreaded?: boolean;
  sponsorAccess?: boolean;
  championLeft?: boolean;
  economicBuyerKnown?: boolean;
  renewalIntent?: "positive" | "neutral" | "negative" | null;
  competitiveReplacement?: boolean;
  suspensionRequested?: boolean;
  scopeReductionRequested?: boolean;
  executiveEscalationUnresolved?: boolean;
}

export interface HealthFactsInput {
  clientId: string;
  status: string; // onboarding | active | renewal | churned
  renewalDate?: string | null;
  usage?: Record<string, number | null> | null; // usage snapshot metrics jsonb
  support?: { csat?: number | null; csatResponses?: number | null; nps?: number | null } | null;
  sentimentNps?: number | null; // survey NPS (-100..100), preferred sentiment source
  primaryContactCount?: number | null;
  pulse?: CsPulseInput | null;
  previousScore?: number | null;
  previousCalculationDate?: string | null;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function buildAccountFacts(input: HealthFactsInput, now = new Date()): AccountFacts {
  const u = input.usage ?? {};
  const metrics: MetricBag = {};
  const put = (key: string, value: number | null, extra: Partial<MetricInput> = {}) => {
    if (value != null) metrics[key] = { value, ...extra };
  };
  const putRating = (key: string, tierKey: string | undefined) => {
    if (tierKey) metrics[key] = { value: null, categorical: tierKey, source: "cs_pulse" };
  };

  /* Product Adoption & Value Realization */
  put("meaningfully_active_users", n(u.active_users), { source: "usage.active_users" });
  put("target_cohort", n(u.seats) ?? n(u.used_licenses), { source: "usage.seats" });
  put("login_proxy_active_users", n(u.mau), { source: "usage.mau" }); // reach fallback metric
  put("actual_progress", n(u.learning_completions), { source: "usage.learning_completions" });
  put("expected_progress", n(u.learning_enrollments), { source: "usage.learning_enrollments" });
  put("completed_matured_workflows", n(u.pathway_completions), { source: "usage.pathway_completions" });
  put("total_matured_workflows", n(u.pathway_enrollments), { source: "usage.pathway_enrollments" });
  put("participating_managers", n(u.pm_cycles_completed), { source: "usage.pm_cycles_completed" });
  put("expected_managers", n(u.pm_cycles_configured), { source: "usage.pm_cycles_configured" });

  /* CS Pulse (CSM ratings) — one categorical metric per configured dimension */
  const p = input.pulse;
  if (p) for (const [metricKey, tierKey] of Object.entries(p.ratingsByMetricKey)) putRating(metricKey, tierKey);

  /* Support & Reliability — ticket satisfaction (SLA/incidents unavailable).

     observationCount MUST be set here. The engine drops any component whose
     `minimumValidObservations` is not met, reading the count off the metric —
     and nothing was setting it, so it defaulted to 0 and Ticket Satisfaction
     (minimum 3) was discarded for every account, including ones with 28 rated
     tickets at 96% satisfaction. The only real support signal in the system
     was being thrown away. */
  const s = input.support;
  const resp = n(s?.csatResponses);
  const csat = n(s?.csat);
  if (resp && resp > 0 && csat != null) {
    put("total_valid_rated_tickets", resp, { source: "support.csatResponses", observationCount: resp });
    put("satisfied_rated_tickets", Math.round((csat / 100) * resp), { source: "support.csat", observationCount: resp });
  }

  /* Client Sentiment — NPS only, normalised to 0–100 */
  const nps = n(input.sentimentNps) ?? n(s?.nps);
  if (nps != null) put("sentiment_nps", (nps + 100) / 2, { source: "survey.nps", numerator: nps });

  /* Signals for status / qualification rules */
  const daysToRenewal = input.renewalDate
    ? Math.round((new Date(input.renewalDate).getTime() - now.getTime()) / 86_400_000)
    : null;
  const signals: AccountFacts["signals"] = {
    confirmed_termination: input.status === "churned",
    /* The CSM's answer wins. Falling back to the contact count is only valid
       when we actually HAVE a contact count: `(count ?? 0) <= 1` read "we hold
       no contact data" as "yes, single-threaded", capping the account to Watch
       on an assumption nobody made. client_contacts.is_primary is populated
       nowhere in this workspace, so that fallback fired for every account whose
       pulse left the question blank — and capped the entire book to Watch
       regardless of score, including accounts scoring 90.

       Unknown is not a Yes. Same rule the coverage answers below already
       follow: null survives, and the isTrue rule simply does not fire. */
    single_threaded: p?.singleThreaded ?? (input.primaryContactCount == null ? null : input.primaryContactCount <= 1),
    champion_left: p?.championLeft ?? false,
    competitive_replacement: p?.competitiveReplacement ?? false,
    suspension_requested: p?.suspensionRequested ?? false,
    scope_reduction_requested: p?.scopeReductionRequested ?? false,
    executive_escalation_unresolved: p?.executiveEscalationUnresolved ?? false,
    days_to_renewal: daysToRenewal,
    // unknowns stay null so their "isFalse" rules don't fire on absence of data
    sponsor_access: p?.sponsorAccess ?? null,
    economic_buyer_known: p?.economicBuyerKnown ?? null,
    renewal_intent: p?.renewalIntent ?? null,
    valid_cs_pulse_exists: !!p,
  };

  return {
    accountId: input.clientId,
    metrics,
    signals,
    // Onboarding accounts aren't scored on this model (Implementation state);
    // active / renewal / churned are eligible (churned scores, then the rule
    // replaces the applied status with Churned).
    eligible: input.status !== "onboarding",
    lifecycleState: input.status === "onboarding" ? "Implementation" : undefined,
    previousScore: input.previousScore ?? null,
    previousCalculationDate: input.previousCalculationDate ?? null,
  };
}
