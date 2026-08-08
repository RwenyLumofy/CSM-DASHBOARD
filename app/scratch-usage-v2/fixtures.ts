/* =========================================================================
   Typed fixtures for the Usage tab v2 prototypes. Fixture-only — nothing here
   reaches a database, and nothing here may become production behaviour.

   Shaped to match lib/usage/types.ts where it overlaps, and shaped to the
   handoff's release-1 contracts where it does not exist yet.

   Numbers are Bank of Bahrain & Kuwait's real production readings where known
   (757 available licences, 748 used, 317 monthly actives, the nine-month
   MAU/WAU series). Everything else is illustrative and marked in the UI.
   ========================================================================= */

export type Freshness = "current" | "delayed" | "stale" | "unavailable";
export type PeriodStatus = "complete" | "in_progress";

/** §8 of the decisions: hours since last successful sync decides freshness,
 *  independently of whether the selected period has finished. */
export function freshnessFromHours(h: number | null): Freshness {
  if (h == null) return "unavailable";
  if (h <= 24) return "current";
  if (h <= 48) return "delayed";
  return "stale";
}

export const FRESHNESS_COPY: Record<Freshness, { label: string; detail: (h: number | null) => string }> = {
  current: { label: "Current", detail: (h) => `Last sync ${h}h ago` },
  delayed: { label: "Delayed", detail: (h) => `Last sync ${h}h ago — over 24h` },
  stale: { label: "Stale", detail: (h) => `Last sync ${h}h ago — over 48h. Figures below are the last good readings.` },
  unavailable: { label: "Unavailable", detail: () => "No successful sync on record" },
};

/* ------------------------------------------------------- monthly series */

export interface MonthPoint {
  key: string;        // "2026-07"
  label: string;      // "Jul"
  year: string;       // "26"
  activeUsers: number | null;
  weeklyActives: number | null;
  status: PeriodStatus;
}

/** The durable monthly series — the only resolution release 1 charts.
 *  Decision 6: daily/weekly deferred rather than shown unreliably. */
export const MONTHS: MonthPoint[] = [
  { key: "2025-11", label: "Nov", year: "25", activeUsers: 288, weeklyActives: 96, status: "complete" },
  { key: "2025-12", label: "Dec", year: "25", activeUsers: 241, weeklyActives: 74, status: "complete" },
  { key: "2026-01", label: "Jan", year: "26", activeUsers: 334, weeklyActives: 118, status: "complete" },
  { key: "2026-02", label: "Feb", year: "26", activeUsers: 348, weeklyActives: 127, status: "complete" },
  { key: "2026-03", label: "Mar", year: "26", activeUsers: 302, weeklyActives: 104, status: "complete" },
  { key: "2026-04", label: "Apr", year: "26", activeUsers: 341, weeklyActives: 121, status: "complete" },
  { key: "2026-05", label: "May", year: "26", activeUsers: 356, weeklyActives: 129, status: "complete" },
  { key: "2026-06", label: "Jun", year: "26", activeUsers: 333, weeklyActives: 117, status: "complete" },
  { key: "2026-07", label: "Jul", year: "26", activeUsers: 317, weeklyActives: 112, status: "complete" },
  { key: "2026-08", label: "Aug", year: "26", activeUsers: 96, weeklyActives: 71, status: "in_progress" },
];

/* ------------------------------------------------------------- metrics */

export interface MetricFact {
  id: "m1" | "m2";
  name: string;
  /** The value as a bare fact — never a percentage of today's seats (decision 7). */
  value: string;
  unit: string | null;
  /** Movement against the previous COMPLETE period, absolute not percentage. */
  change: { from: number; to: number; periodLabel: string } | null;
  definition: string;
  /** Why a comparison is unavailable, when it is. */
  comparisonBlockedReason?: string;
  suppressed?: { reason: string };
}

export const METRICS: MetricFact[] = [
  {
    id: "m1",
    name: "Active users",
    value: "317",
    unit: "people",
    change: { from: 333, to: 317, periodLabel: "Jun 2026" },
    definition:
      "Distinct users with at least one recorded product action in the selected period. Not logins. Deduplicated across modules, so a person active in two modules counts once. Shown as an absolute count — no percentage of licences, because the licence count for a past period is not stored.",
  },
  {
    id: "m2",
    name: "Weekly-to-monthly ratio",
    value: "35",
    unit: "%",
    change: { from: 35, to: 35, periodLabel: "Jun 2026" },
    definition:
      "Weekly actives divided by monthly actives within the selected period. A within-period ratio, so both sides come from the same window and no historical seat count is involved. Higher means the people who use the product return more often.",
  },
];

/** Licences are facts as of today, deliberately separate from the metrics
 *  above and never labelled contracted seats (decision 1). */
export const LICENCES = {
  available: 757,
  used: 748,
  asOf: "8 Aug 2026",
  note: "Available and used licences are read from the current snapshot only. Neither is a contracted seat count, and neither has a stored history.",
};

/* -------------------------------------------------------- observations */

export type ObservationId = "activity_decline" | "no_activity_perform" | "insufficient_history";

export interface Observation {
  id: ObservationId;
  headline: string;
  evidence: string;
  /** Months the observation was computed from — the chart highlights these. */
  periods: string[];
  action: { label: string; kind: "task" | "plan" | "connection" | "sync" | "definition" | "none"; implemented: boolean } | null;
}

export const OBSERVATIONS: Observation[] = [
  {
    id: "activity_decline",
    headline: "Active users fell for two consecutive complete months",
    evidence: "356 in May, 333 in June, 317 in July. Earlier falls lasted one month and recovered the month after.",
    periods: ["2026-05", "2026-06", "2026-07"],
    action: { label: "Create task", kind: "task", implemented: true },
  },
  {
    id: "no_activity_perform",
    headline: "No Perform activity recorded in nine complete months",
    evidence: "Zero cycles configured and zero completed since the first month on record. Meets the three-complete-month minimum for no-activity.",
    periods: MONTHS.filter((m) => m.status === "complete").map((m) => m.key),
    action: { label: "Create task", kind: "task", implemented: true },
  },
];

/** Neutral commentary — NOT an observation, no CTA (decision 9). */
export const CHART_COMMENTARY =
  "The weekly-to-monthly ratio has stayed between 31% and 37% every month on record. The people who use the product return as often as they always have; there are fewer of them.";

/* --------------------------------------------------- use-case evidence */

export type EvidenceState =
  | "activity_present"
  | "no_activity_recorded"
  | "not_entitled"
  | "telemetry_unavailable"
  | "sync_failed"
  | "no_product_mapping";

export const EVIDENCE_STATE: Record<EvidenceState, {
  label: string;
  tone: "ok" | "warn" | "blocked" | "unknown";
  action: { label: string; implemented: boolean } | null;
}> = {
  activity_present:      { label: "Activity recorded",     tone: "ok",      action: null },
  no_activity_recorded:  { label: "No activity recorded",  tone: "warn",    action: { label: "Create task", implemented: true } },
  not_entitled:          { label: "Not entitled",          tone: "blocked", action: { label: "Review account plan", implemented: false } },
  telemetry_unavailable: { label: "Telemetry unavailable", tone: "unknown", action: { label: "Investigate connection", implemented: false } },
  sync_failed:           { label: "Sync failed",           tone: "unknown", action: { label: "Retry sync", implemented: true } },
  no_product_mapping:    { label: "No product mapping",    tone: "unknown", action: { label: "Open use-case definition", implemented: true } },
};

export interface ProductEvidence {
  product: string;
  state: EvidenceState;
  reading: string | null;
}

export interface UseCaseRow {
  id: string;
  name: string;
  products: ProductEvidence[];
}

export const USE_CASES: UseCaseRow[] = [
  {
    id: "uc1", name: "Compliance training at scale",
    products: [{ product: "Develop", state: "activity_present", reading: "4,812 enrolment starts · 3,904 completions" }],
  },
  {
    id: "uc2", name: "Onboarding new joiners",
    // The multi-product case — two products, one use case.
    products: [
      { product: "Develop", state: "activity_present", reading: "1,204 enrolment starts · 61% completed" },
      { product: "Engage", state: "no_activity_recorded", reading: "0 survey cycles in 9 complete months" },
    ],
  },
  {
    id: "uc3", name: "Annual performance cycle",
    products: [{ product: "Perform", state: "no_activity_recorded", reading: "0 cycles in 9 complete months" }],
  },
  {
    id: "uc4", name: "Succession planning",
    products: [{ product: "Perform", state: "not_entitled", reading: "Not in the account plan" }],
  },
  {
    id: "uc5", name: "Skills diagnostics",
    products: [{ product: "Assess", state: "telemetry_unavailable", reading: "Module reports no activity table" }],
  },
  {
    id: "uc6", name: "Employee listening",
    products: [{ product: "Engage", state: "sync_failed", reading: "Last good reading 30 Jul: 2 cycles · 418 responses" }],
  },
  {
    id: "uc7", name: "Leadership development",
    products: [{ product: "—", state: "no_product_mapping", reading: "Definition names no product" }],
  },
];

/* ------------------------------------------------- reference sections */

export const SETUP_CHECKLIST = [
  { label: "Environment linked", ok: true },
  { label: "Usage sync succeeded in the last 48h", ok: true },
  { label: "Seats recorded on the plan", ok: true },
  { label: "Use cases recorded on the account", ok: true },
  { label: "Every use case names a product", ok: false },
  { label: "All planned modules report telemetry", ok: false },
];

export const MODULES = [
  { name: "Develop", entitled: true, reading: "12,514 enrolment starts · 9,727 completions" },
  { name: "Perform", entitled: true, reading: "No activity recorded in 9 complete months" },
  { name: "Engage", entitled: true, reading: "Last good reading 30 Jul — sync failing" },
  { name: "Assess", entitled: false, reading: "Not in the account plan" },
];

export const CONTENT_MIX = [
  { source: "Lumofy library", starts: 8509, share: 68 },
  { source: "Global — Go1", starts: 1908, share: 15 },
  { source: "Global — Coursera", starts: 970, share: 8 },
  { source: "Company-authored", starts: 1127, share: 9 },
];

export const FOLLOW_THROUGH = [
  { activity: "Learning items", started: 12514, completed: 9727, distinctCourses: 412 },
  { activity: "Pathways", started: 2932, completed: 1531, distinctCourses: 38 },
  { activity: "Quizzes", started: 3140, completed: 2714, distinctCourses: 96 },
];

export const AI_LEVERAGE = [
  { label: "Competencies total", value: "184" },
  { label: "AI-generated", value: "141 · 77%" },
  { label: "Generation runs", value: "62" },
];

export const ALL_METRICS = [
  { key: "active_users", name: "Active users", value: "317", change: "−16", source: "PERIOD_SNAPSHOT_SQL" },
  { key: "mau", name: "Monthly active users", value: "317", change: "−16", source: "client_usage_monthly" },
  { key: "wau", name: "Weekly active users", value: "112", change: "−5", source: "client_usage_monthly" },
  { key: "seats", name: "Available licences", value: "757", change: "0", source: "SNAPSHOT_SQL" },
  { key: "used_licenses", name: "Used licences", value: "748", change: "+8", source: "SNAPSHOT_SQL" },
  { key: "learning_enrollments", name: "Enrolment starts", value: "12,514", change: "+486", source: "PERIOD_SNAPSHOT_SQL" },
  { key: "learning_completions", name: "Enrolment completions", value: "9,727", change: "+551", source: "PERIOD_SNAPSHOT_SQL" },
];

/* ------------------------------------------------------------ scenarios */

export type Scenario = "default" | "in_progress" | "stale" | "no_environment";

export interface ScenarioState {
  label: string;
  selectedPeriod: string;
  periodStatus: PeriodStatus;
  syncHoursAgo: number | null;
  environment: string | null;
  /** Why comparison is off, when it is. */
  comparisonDisabled: string | null;
  note: string | null;
}

export const SCENARIOS: Record<Scenario, ScenarioState> = {
  default: {
    label: "Default — last complete month",
    selectedPeriod: "2026-07",
    periodStatus: "complete",
    syncHoursAgo: 6,
    environment: "bbk-prod",
    comparisonDisabled: null,
    note: null,
  },
  in_progress: {
    label: "Current incomplete month",
    selectedPeriod: "2026-08",
    periodStatus: "in_progress",
    syncHoursAgo: 6,
    environment: "bbk-prod",
    comparisonDisabled: "August is 8 days in. Comparing a partial month to a complete one would read as a fall that has not happened.",
    note: "Figures are month-to-date and will rise.",
  },
  stale: {
    label: "Stale data, previous readings retained",
    selectedPeriod: "2026-07",
    periodStatus: "complete",
    syncHoursAgo: 143,
    environment: "bbk-prod",
    comparisonDisabled: "Comparisons are off while data is stale — a delta between a stale figure and a fresh one is misleading.",
    note: "Everything below is the last good reading, from 30 Jul 2026.",
  },
  no_environment: {
    label: "No linked environment",
    selectedPeriod: "2026-07",
    periodStatus: "complete",
    syncHoursAgo: null,
    environment: null,
    comparisonDisabled: "No environment is linked, so there is nothing to compare.",
    note: null,
  },
};
