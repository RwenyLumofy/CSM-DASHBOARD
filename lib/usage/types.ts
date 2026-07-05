/* Types for the client Usage tab (product-usage from Metabase). */

/** Raw scalar values returned by SNAPSHOT_SQL (all numbers). */
export interface UsageSnapshotRow {
  wau: number;
  mau: number;
  total_users: number;
  active_users: number;
  seats: number;
  used_licenses: number;
  job_roles: number;
  job_levels: number;
  departments: number;
  divisions: number;
  legal_entities: number;
  learning_enrollments: number; // combined total across all 3 content categories
  learning_completions: number;
  learning_items_count: number;
  pathways_count: number;
  pathway_enrollments: number;
  pathway_completions: number;
  // Pathway company-built vs Lumofy-library split:
  pathway_company_enrollments: number;
  pathway_company_completions: number;
  pathway_lumofy_enrollments: number;
  pathway_lumofy_completions: number;
  quizzes_generated: number;
  quiz_enrollments: number;
  quiz_completions: number;
  sessions_created: number;
  // Engage (employee surveys):
  enps_cycles: number;
  enps_responses: number;
  survey_cycles: number;
  survey_responses: number;
  talent_assessment_enrollments: number;
  talent_assessment_completed: number;
  ai_assessment_enrollments: number;
  ai_assessment_completed: number;
  pm_cycles_configured: number;
  pm_cycles_completed: number;
  competencies_total: number;
  competencies_ai_generated: number;
  ai_generation_runs: number;
}

export interface TrendPoint {
  month: string; // "YYYY-MM"
  value: number;
}

export type TrendMap = Record<string, TrendPoint[]>;

/** Distinct courses + enrollments + completions for one learning content
 *  category or provider. `items` = distinct learning items (courses) touched. */
export interface LearningBucket {
  enrollments: number;
  completions: number;
  items: number;
}

/** The company / Lumofy / global-library split of learning enrollments, with the
 *  provider mix inside the global-library category (Go1, Coursera, edX, …). */
export interface LearningBreakdown {
  company: LearningBucket; // built in the client's own course-builder
  lumofy: LearningBucket; // Lumofy-curated library (Docebo + shared course-builder)
  global: LearningBucket; // external marketplaces (Go1/Coursera/edX/…)
  // global breakdown (per provider): enrollments, completions, and distinct items consumed
  providers: { provider: string; enrollments: number; completions: number; items: number }[];
}

export type UsageTier = "thriving" | "growing" | "at_risk" | "dormant";

/** The 3 Lumofy product modules. */
export type ModuleKey = "develop" | "perform" | "engage";

export interface AdoptionScore {
  score: number; // 0-100
  tier: UsageTier;
  verdict: string; // one-line CSM narrative
  // "breadth" = Module adoption (of owned modules, how many are used);
  // "recency" = Momentum (are people active this week). Kept as keys for
  // stability; the UI shows the renamed labels.
  parts: { activation: number; breadth: number; recency: number };
  // Per-module: does the company OWN it (from the package prop) and is it USED.
  modules: Record<ModuleKey, { owned: boolean; used: boolean }>;
}

/** The fully-assembled payload the Usage tab renders — one company, one
 *  platform environment, resolved via HubSpot's company-level
 *  `mixpanel_company_id` (== the environment's id in Metabase). */
export interface UsageSnapshot {
  status: "ok";
  environmentId: string;
  environmentName: string | null;
  region: "aws" | "ksa";
  fetchedAt: string; // ISO
  metrics: UsageSnapshotRow;
  trends: TrendMap;
  learning: LearningBreakdown;
  score: AdoptionScore;
}

/** When the account can't (yet) be shown live. */
export interface UsageUnavailable {
  status: "unlinked" | "not_configured" | "error";
  message: string;
}

export type UsageResult = UsageSnapshot | UsageUnavailable;

/** Period-bounded totals for the Usage tab's timeline filter — everything
 *  here has a real event date, unlike the point-in-time fields on
 *  UsageSnapshotRow (seats, total_users, org structure, competencies_total,
 *  enps_cycles/survey_cycles), which have no history to reconstruct and stay
 *  "Current" regardless of the selected period. */
export interface UsagePeriodMetrics {
  active_users: number;
  learning_enrollments: number;
  learning_completions: number;
  learning_items_count: number;
  pathways_count: number;
  pathway_enrollments: number;
  pathway_completions: number;
  pathway_company_enrollments: number;
  pathway_company_completions: number;
  pathway_lumofy_enrollments: number;
  pathway_lumofy_completions: number;
  quizzes_generated: number;
  quiz_enrollments: number;
  quiz_completions: number;
  sessions_created: number;
  talent_assessment_enrollments: number;
  talent_assessment_completed: number;
  ai_assessment_enrollments: number;
  ai_assessment_completed: number;
  competencies_created: number;
  competencies_ai_generated: number;
  enps_responses: number;
  survey_responses: number;
  pm_cycles_configured: number;
  pm_cycles_completed: number;
}

/** Trend bucketing grain — 'day' for week/month periods, 'week' for a quarter,
 *  'month' for a year. Drives both the chart's x-axis labels and the
 *  "active/peak {grain}" KPI wording. */
export type UsageTrendGrain = "day" | "week" | "month";

export interface UsagePeriodSnapshot {
  status: "ok";
  start: string; // "YYYY-MM-DD" inclusive
  end: string; // "YYYY-MM-DD" exclusive
  label: string; // e.g. "2026-Q2", "2026-W27"
  grain: UsageTrendGrain;
  /** Distinct active users per bucket (at `grain`) within [start, end) — for the
   *  trend chart only; never sum these for a period total (see PERIOD_TREND_SQL).
   *  `bucket` is the truncated "YYYY-MM-DD" (day / ISO-week-Monday / month-first). */
  activeUsersTrend: { bucket: string; value: number }[];
  metrics: UsagePeriodMetrics;
  /** Same company/Lumofy/global split as UsageSnapshot.learning, bounded to
   *  enrollments created within [start, end). */
  learning: LearningBreakdown;
  /** The Adoption Score recomputed from this period's data instead of the
   *  always-current rolling window — see computePeriodAdoptionScore(). */
  score: AdoptionScore;
}

export type UsagePeriodResult = UsagePeriodSnapshot | UsageUnavailable;
