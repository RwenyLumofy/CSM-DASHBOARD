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
     Use-case breadth     count of live use cases          (100% coverage)
     Ticket satisfaction  support.csat × csatResponses
     Sentiment            survey NPS only, normalised (nps+100)/2
     SLA / incidents      no reliable source yet → left missing (redistributes)
   ============================================================================= */

import type { AccountFacts, MetricBag, MetricInput } from "./model";
import type { StakeholderProfile } from "@/lib/stakeholders/profile";
import { stakeholderFacts, preferAnswered } from "@/lib/stakeholders/facts";

/** The ticket fields the health model reads. Structurally a subset of
 *  lib/types SupportTicket, kept local so this file stays dependency-light. */
export interface SupportTicketFact {
  state: "open" | "snoozed" | "closed";
  priority: "P1" | "P2" | "P3";
  createdAt: string;
  slaBreaches?: { kind?: string }[] | null;
}

/* How old an open ticket has to be before it counts as aged. Both are the
   first defensible choice rather than a measured one, and both are easy to
   move — a high-severity ticket open past a fortnight is a burden regardless
   of SLA, and a month is a long time for anything to sit open. */
const AGED_HIGH_SEVERITY_DAYS = 14;
const AGED_TICKET_DAYS = 30;
const HIGH_SEVERITY = new Set(["P1", "P2"]);
const OPEN_STATES = new Set(["open", "snoozed"]);

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
  support?: {
    csat?: number | null;
    csatResponses?: number | null;
    nps?: number | null;
    /** Every ticket for the account, each carrying its own SLA breach status.
     *  An ABSENT array means Intercom was never synced for this account; an
     *  EMPTY one means we looked and there were no tickets. The difference
     *  decides whether Support scores or is missing. */
    tickets?: SupportTicketFact[] | null;
    /** Null when no tracked deal sets a support level — SLA is then not
     *  evaluated for this account, so a clean ticket proves nothing. */
    supportLevelUsed?: string | null;
  } | null;
  sentimentNps?: number | null; // survey NPS (-100..100), preferred sentiment source
  primaryContactCount?: number | null;
  /** The account's stakeholder profiles. Fills the four relationship facts a
   *  CSM left blank on the Pulse — see lib/stakeholders/facts.ts for why the
   *  answered value always wins. */
  stakeholders?: StakeholderProfile[] | null;
  /** Live use cases on the account (client.properties.use_cases_rollup). */
  useCaseCount?: number | null;
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
  /* Use-case breadth — Signal's own data, not the product DB. Every live
     account carries a rollup, so unlike the performance-cycle counts this
     replaced, it is present for the whole book. */
  put("live_use_cases", n(input.useCaseCount), { source: "client.use_cases_rollup" });

  /* CS Pulse (CSM ratings) — one categorical metric per configured dimension */
  const p = input.pulse;
  /* What the mapped stakeholders can prove, used only where the Pulse left a
     question blank. Empty roster -> all null, so an account with no records is
     never asserted to be single-threaded or sponsorless. */
  const sh = stakeholderFacts(input.stakeholders ?? []);
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

  /* SLA, incidents and aged tickets, from the ticket list the Intercom sync
     already stores. These were declared in the model and fed by nothing, so
     Incident Burden and Aged & Reopened fell through to their default_score of
     100 and handed Support a perfect mark on no observations at all.

     Fed only when `tickets` is actually an array. Absent means Intercom was
     never synced for the account and we know nothing; empty means we looked
     and there were no tickets, which is a real (good) reading. That
     distinction is the whole difference between this and the bug it fixes. */
  const tickets = Array.isArray(s?.tickets) ? s!.tickets! : null;
  if (tickets) {
    const ageDays = (t: SupportTicketFact) =>
      (now.getTime() - new Date(t.createdAt).getTime()) / 86_400_000;
    const isOpen = (t: SupportTicketFact) => OPEN_STATES.has(t.state);
    const closed = tickets.filter((t) => t.state === "closed");
    const open = tickets.filter(isOpen);

    /* SLA is only meaningful when the account HAS a support level — with none
       resolved, the sync leaves every breach list empty and a clean ticket
       proves nothing. Feeding it anyway would score 100% on-target for
       accounts nobody ever measured. */
    if (s?.supportLevelUsed) {
      const onTarget = closed.filter((t) => !(t.slaBreaches ?? []).some((b) => b?.kind === "resolution"));
      put("eligible_resolved_tickets", closed.length, { source: "support.tickets", observationCount: closed.length });
      put("tickets_resolved_within_target", onTarget.length, { source: "support.tickets", observationCount: closed.length });
    }

    put("active_critical_incidents", open.filter((t) => t.priority === "P1").length, { source: "support.tickets" });
    put("aged_high_severity_incidents",
      open.filter((t) => HIGH_SEVERITY.has(t.priority) && ageDays(t) > AGED_HIGH_SEVERITY_DAYS).length,
      { source: "support.tickets" });
    put("resolved_high_severity_incidents",
      closed.filter((t) => HIGH_SEVERITY.has(t.priority)).length, { source: "support.tickets" });
    /* "Reopened" has no representation in the synced ticket — Intercom's state
       is a snapshot, not a history — so this counts aged only. Named as the
       model names it; the gap is real and worth closing at the sync, not
       papered over by pretending a reopen can be inferred. */
    put("aged_or_reopened_tickets",
      open.filter((t) => ageDays(t) > AGED_TICKET_DAYS).length, { source: "support.tickets (aged only)" });
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
    single_threaded: preferAnswered(
      p?.singleThreaded, sh.single_threaded,
      input.primaryContactCount == null ? null : input.primaryContactCount <= 1),
    /* Was `?? false`, alone among the four. An account whose champion had left
       without anyone recording it read as "champion has not left", which is a
       claim rather than a gap. It now falls through to the roster and then to
       null, like its three siblings. */
    champion_left: preferAnswered(p?.championLeft, sh.champion_left),
    competitive_replacement: p?.competitiveReplacement ?? false,
    suspension_requested: p?.suspensionRequested ?? false,
    scope_reduction_requested: p?.scopeReductionRequested ?? false,
    executive_escalation_unresolved: p?.executiveEscalationUnresolved ?? false,
    days_to_renewal: daysToRenewal,
    // unknowns stay null so their "isFalse" rules don't fire on absence of data
    sponsor_access: preferAnswered(p?.sponsorAccess, sh.sponsor_access),
    economic_buyer_known: preferAnswered(p?.economicBuyerKnown, sh.economic_buyer_known),
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
