/* =============================================================================
   Client Health Scoring Engine — configuration model & result types.

   The engine is CONFIG-DRIVEN: a published model version is a tree of components
   (each a leaf metric+formula or a weighted branch), a set of score bands, a set
   of applied-status rules, healthy-qualification rules, momentum thresholds and
   confidence thresholds. NONE of the scoring math is hardcoded per-model — the
   engine interprets these structures. New models = new config, not new code.

   Calculated health (the weighted number + band) is kept strictly separate from
   the applied operational status (what a status rule / override lands on).
   ============================================================================= */

/* --------------------------------------------------------------- formulas */

export type ZeroDenominatorPolicy = "missing" | "score_zero" | "score_full" | "not_applicable" | "use_fallback";

/** Comparison operators for threshold/condition tables — a closed, safe set
 *  (NO eval / Function / arbitrary code). */
export interface Comparison {
  gte?: number;
  gt?: number;
  lte?: number;
  lt?: number;
  eq?: number | string | boolean;
  ne?: number | string | boolean;
  in?: (number | string)[];
  isTrue?: boolean; // matches boolean metric === true
  isFalse?: boolean; // matches boolean metric === false
  present?: boolean; // metric has a non-null value
}

/** A rule's `when` is an AND across metric conditions. */
export type ConditionSet = Record<string, Comparison>;

export type Formula =
  | { type: "constant"; value: number }
  | { type: "constant_if"; when: ConditionSet; value: number; else_value: number }
  | {
      type: "ratio";
      numerator_metric: string;
      denominator_metric: string;
      multiplier?: number;
      minimum?: number;
      maximum?: number;
      zero_denominator_policy: ZeroDenominatorPolicy;
    }
  | { type: "percentage"; source_metric: string; minimum?: number; maximum?: number }
  | {
      type: "stage_adjusted_ratio";
      actual_metric: string;
      expected_metric: string;
      multiplier?: number;
      minimum?: number;
      maximum?: number;
      zero_denominator_policy: ZeroDenominatorPolicy;
    }
  | { type: "categorical_map"; source_metric: string; mapping: Record<string, number>; missing_policy?: MissingDataPolicy }
  | { type: "boolean_map"; source_metric: string; true_score: number; false_score: number; missing_policy?: MissingDataPolicy }
  | { type: "threshold_table"; rules: { when: ConditionSet; score: number }[]; default_score: number }
  | { type: "weighted_average"; inputs: { metric: string; weight: number }[] }
  | { type: "simple_average"; metrics: string[] }
  | { type: "minimum"; metrics: string[] }
  | { type: "maximum"; metrics: string[] }
  | { type: "sum"; metrics: string[] }
  | { type: "count"; metrics: string[] }
  | { type: "latest_valid_value"; metrics: string[] }; // priority order — first valid wins

export type FormulaType = Formula["type"];

/* ----------------------------------------------------------- components */

export type MissingDataPolicy =
  | "redistribute_weight"
  | "score_zero"
  | "mark_not_assessed"
  | "use_fallback_metric"
  | "retain_last_valid_value"
  | "exclude_component";

/** A node in the model tree. A LEAF has a `formula`; a BRANCH has `children`
 *  (its score is the reweighted average of its applicable, valid children). */
export interface HealthComponent {
  id: string;
  code: string;
  name: string;
  description?: string;
  displayOrder: number;
  /** Decimal share of the parent (top-level children sum to 1.0). */
  weight: number;
  isEnabled: boolean;
  isMandatory: boolean;
  missingDataPolicy: MissingDataPolicy;
  fallbackMetric?: string;
  minimumValidObservations?: number;
  validityWindowDays?: number;
  scoreFloor?: number;
  scoreCeiling?: number;
  formula?: Formula; // leaf
  children?: HealthComponent[]; // branch
}

/* ---------------------------------------------------------------- bands */

/** Bands are resolved by lower bound: a score lands in the highest band whose
 *  `minScore` it meets. `maxScore` is illustrative for display only. */
export interface HealthBand {
  name: string;
  minScore: number;
  maxScore: number;
}

/* --------------------------------------------------------- status rules */

export type StatusRuleAction =
  | "cap_max" // applied status may be no better than target_status
  | "force" // applied status becomes exactly target_status
  | "replace" // replacement state (Implementation / Not Assessed / Churned)
  | "not_assessed"
  | "churned"
  | "warn"; // annotate only, no status change

export interface StatusRule {
  id: string;
  name: string;
  description?: string;
  priority: number; // lower = evaluated first
  when: ConditionSet;
  action: StatusRuleAction;
  targetStatus?: string;
  reasonTemplate: string;
  isEnabled: boolean;
}

/** Healthy is earned, not just scored: every enabled qualification rule must
 *  pass or the applied status is capped at `capTo` (default "Watch"). */
export interface QualificationRule {
  id: string;
  name: string;
  when: ConditionSet; // condition that must HOLD to qualify
  capTo: string;
  reasonTemplate: string;
  isEnabled: boolean;
}

/* ------------------------------------------------------ momentum / conf */

export interface MomentumThreshold {
  label: string;
  minDelta: number; // score delta >= minDelta (sorted desc) picks this label
}

export interface ConfidenceThreshold {
  label: string;
  minCoverage: number; // coverage (0..1) >= minCoverage picks this label
}

/* ---------------------------------------------------- model + version */

/** A configurable ordered rating tier for a categorical (CS Pulse) input.
 *  `key` is the STABLE stored value a formula maps on; `label` is the display
 *  term admins rename in Settings; `score` is what the categorical_map resolves
 *  to. Renaming a label never touches stored pulse values or the engine. */
export interface RatingTier {
  key: string;
  label: string;
  score: number;
}

export interface HealthModelVersion {
  modelName: string;
  version: string; // e.g. "1.1"
  status: "draft" | "published" | "archived";
  components: HealthComponent[]; // top-level (weights sum to 1.0)
  bands: HealthBand[];
  /** Named categorical rating scales (e.g. `cs_pulse`) — the tiers a CS Pulse
   *  rating can take. Editable/renameable in Settings; categorical_map formulas
   *  resolve a stored tier key → its score via these. */
  ratingScales?: Record<string, RatingTier[]>;
  statusRules: StatusRule[];
  qualificationRules: QualificationRule[];
  momentumThresholds: MomentumThreshold[];
  confidenceThresholds: ConfidenceThreshold[];
  /** Operational severity order (least→most severe) for choosing the applied
   *  status when several caps/forces fire. Replacement states sit outside. */
  severityOrder: string[];
  /** Replacement states that override normal severity (Churned, etc.). */
  replacementStates: string[];
  /** Minimum original data coverage (0..1) to produce any assessment. */
  minCoverageForAssessment: number;
  /** Coverage (0..1) below which the applied status cannot exceed this cap. */
  coverageCapThreshold: number;
  coverageCapTo: string;
}

/* -------------------------------------------------------------- inputs */

/** One resolved metric fact fed to the engine. `value` is the numeric input a
 *  formula reads; categorical/boolean carry the non-numeric forms. Everything
 *  needed for explainability (§19) travels with it. */
export interface MetricInput {
  value: number | null;
  numerator?: number | null;
  denominator?: number | null;
  categorical?: string | null;
  boolean?: boolean | null;
  observationCount?: number;
  freshnessDays?: number;
  source?: string;
  sourceRef?: string;
  measurementPeriod?: string;
  isProxy?: boolean;
  label?: string;
  isValid?: boolean; // default true; false ⇒ treated as missing
}

export type MetricBag = Record<string, MetricInput>;

/** Everything the engine needs about one account for one calculation. */
export interface AccountFacts {
  accountId: string;
  metrics: MetricBag;
  /** Flat signals used by status/qualification rule conditions (incidents,
   *  single_threaded, renewal fields, termination, etc.). */
  signals: Record<string, number | string | boolean | null>;
  previousScore?: number | null;
  previousCalculationDate?: string | null;
  overrides?: ActiveOverride[];
  eligible: boolean;
  eligibilityReason?: string;
  lifecycleState?: string; // Implementation / Not Launched / etc.
}

export interface ActiveOverride {
  id: string;
  overrideType: "force" | "cap_max";
  targetStatus: string;
  reason: string;
  expiresAt?: string | null;
}

/* -------------------------------------------------------------- results */

export interface MetricResult {
  key: string;
  value: number | null;
  numerator?: number | null;
  denominator?: number | null;
  score: number | null;
  isValid: boolean;
  isMissing: boolean;
  isProxy: boolean;
  fallbackUsed: boolean;
  observationCount?: number;
  source?: string;
  measurementPeriod?: string;
  label?: string;
  reason?: string;
}

export interface ComponentResult {
  id: string;
  code: string;
  name: string;
  score: number | null;
  originalWeight: number;
  effectiveWeight: number;
  weightedContribution: number | null;
  isApplicable: boolean;
  isMissing: boolean;
  isValid: boolean;
  missingReason?: string;
  fallbackUsed: boolean;
  children?: ComponentResult[];
  metrics?: MetricResult[];
}

/**
 * For a threshold gate or rule, the number the account is at and the number it
 * has to reach. "CS Pulse below the Healthy minimum of 75" tells a CSM the rule
 * exists; it does not tell them the account is at 63 and twelve points short.
 *
 * Only produced when clearing the rule means a value going UP. A count that has
 * to reach zero reads badly as a threshold — "1 now, needs to be under 1" — and
 * those rules carry a remedy that already says what to do.
 */
export interface RuleShortfall {
  /** The fact key, e.g. `cs_pulse_score`. */
  metric: string;
  actual: number;
  /** The value that clears the rule. */
  target: number;
}

export interface TriggeredRule {
  ruleId: string;
  ruleName: string;
  action: StatusRuleAction;
  reason: string;
  priority: number;
  previousStatus: string;
  resultingStatus: string;
  shortfall?: RuleShortfall;
}

export interface AccountHealthResult {
  accountId: string;
  eligible: boolean;
  eligibilityReason?: string;
  modelName: string;
  modelVersion: string;
  calculationTimestamp: string;

  calculatedScore: number | null;
  calculatedBand: string | null;
  appliedStatus: string;

  momentum: string;
  scoreDelta: number | null;
  previousScore: number | null;

  dataCoverage: number; // 0..1 (original weights)
  dataConfidence: string;

  positiveDrivers: string[];
  negativeDrivers: string[];
  primaryRisk: string | null;
  nextAction: string | null;
  actionOwner: string | null;
  actionDueDate: string | null;

  activeStatusRules: TriggeredRule[];
  activeOverrides: ActiveOverride[];

  components: ComponentResult[];
  notAssessed: boolean;
  notAssessedReason?: string;
}
