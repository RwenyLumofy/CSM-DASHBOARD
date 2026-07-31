/* =============================================================================
   Client Health Scoring Engine — persistence schema (§20). Config-driven,
   versioned, auditable, historical. Weights and scores use NUMERIC (not float)
   so weight validation, band boundaries and historical comparisons are exact.
   Flexible config (formulas, rule conditions, threshold tables, applicability,
   full explainable results) is JSONB; identifiers/statuses/weights/dates/FKs/
   audit fields are relational columns.

   Re-exported from lib/db/schema.ts so drizzle-kit generates the migration.
   Migrations are run by the operator (blocked in the dev sandbox).
   ============================================================================= */

import { pgTable, text, integer, boolean, numeric, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { Formula, ConditionSet, StatusRuleAction } from "@/lib/health/model";
import type { AccountHealthResult } from "@/lib/health/model";

const auditCols = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
};

/* --------------------------------------------------- models & versions */

export const healthModels = pgTable("health_models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ...auditCols,
});

export const healthModelVersions = pgTable("health_model_versions", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull().references(() => healthModels.id),
  version: text("version").notNull(), // "1.1"
  status: text("status").notNull().default("draft"), // draft | published | archived
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  changeNote: text("change_note"),
  // Immutable snapshot of the whole resolved config at publish time, so a
  // published version is exactly reconstructable regardless of later edits.
  config: jsonb("config"),
  ...auditCols,
}, (t) => ({
  modelVersionUx: uniqueIndex("health_model_version_ux").on(t.modelId, t.version),
}));

/* ------------------------------------------------------------ components */

export const healthComponents = pgTable("health_components", {
  id: text("id").primaryKey(),
  modelVersionId: text("model_version_id").notNull().references(() => healthModelVersions.id),
  parentComponentId: text("parent_component_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  weight: numeric("weight", { precision: 6, scale: 5 }).notNull().default("0"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isMandatory: boolean("is_mandatory").notNull().default(false),
  isOptional: boolean("is_optional").notNull().default(true),
  isApplicableByDefault: boolean("is_applicable_by_default").notNull().default(true),
  missingDataPolicy: text("missing_data_policy").notNull().default("redistribute_weight"),
  fallbackMetricId: text("fallback_metric_id"),
  minimumValidObservations: integer("minimum_valid_observations"),
  validityWindowDays: integer("validity_window_days"),
  scoreFloor: numeric("score_floor", { precision: 7, scale: 3 }),
  scoreCeiling: numeric("score_ceiling", { precision: 7, scale: 3 }),
  formula: jsonb("formula").$type<Formula>(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft-delete (§10)
  ...auditCols,
}, (t) => ({
  byVersion: index("health_components_version_idx").on(t.modelVersionId),
  byParent: index("health_components_parent_idx").on(t.parentComponentId),
}));

/* ---------------------------------------------------- metric definitions */

export const healthMetricDefinitions = pgTable("health_metric_definitions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  dataSource: text("data_source"), // logical source (product events / support / survey / manual)
  config: jsonb("config"), // qualifying-event map, window, population, aggregation, fallback
  isEnabled: boolean("is_enabled").notNull().default(true),
  ...auditCols,
});

export const healthComponentMetricBindings = pgTable("health_component_metric_bindings", {
  id: text("id").primaryKey(),
  componentId: text("component_id").notNull().references(() => healthComponents.id),
  metricDefinitionId: text("metric_definition_id").notNull().references(() => healthMetricDefinitions.id),
  role: text("role").notNull(), // numerator | denominator | source | actual | expected | fallback
  ...auditCols,
});

/* ------------------------------------------------------------ bands/rules */

export const healthStatusBands = pgTable("health_status_bands", {
  id: text("id").primaryKey(),
  modelVersionId: text("model_version_id").notNull().references(() => healthModelVersions.id),
  name: text("name").notNull(),
  minScore: numeric("min_score", { precision: 7, scale: 3 }).notNull(),
  maxScore: numeric("max_score", { precision: 7, scale: 3 }).notNull(),
  displayOrder: integer("display_order").notNull().default(0),
});

export const healthStatusRules = pgTable("health_status_rules", {
  id: text("id").primaryKey(),
  modelVersionId: text("model_version_id").notNull().references(() => healthModelVersions.id),
  name: text("name").notNull(),
  description: text("description"),
  priority: integer("priority").notNull().default(100),
  kind: text("kind").notNull().default("status"), // status | qualification
  condition: jsonb("condition").$type<ConditionSet>().notNull(),
  actionType: text("action_type").$type<StatusRuleAction>().notNull(),
  targetStatus: text("target_status"),
  reasonTemplate: text("reason_template").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  ...auditCols,
}, (t) => ({ byVersion: index("health_status_rules_version_idx").on(t.modelVersionId) }));

/* ------------------------------------------------- assignment & scope */

export const healthModelAssignments = pgTable("health_model_assignments", {
  id: text("id").primaryKey(),
  modelVersionId: text("model_version_id").notNull().references(() => healthModelVersions.id),
  accountId: text("account_id"), // null ⇒ applies to the default population
  isDefault: boolean("is_default").notNull().default(false),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  ...auditCols,
}, (t) => ({ byAccount: index("health_assignments_account_idx").on(t.accountId) }));

export const accountHealthScope = pgTable("account_health_scope", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  modelVersionId: text("model_version_id").notNull(),
  componentId: text("component_id").notNull(),
  isApplicable: boolean("is_applicable").notNull().default(true),
  applicabilityReason: text("applicability_reason"),
  targetCohortId: text("target_cohort_id"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...auditCols,
}, (t) => ({ byAccount: index("account_scope_account_idx").on(t.accountId) }));

/* --------------------------------------------------------- cohorts */

export const targetCohorts = pgTable("target_cohorts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  moduleCode: text("module_code"),
  workflowCode: text("workflow_code"),
  name: text("name").notNull(),
  expectedPopulation: integer("expected_population").notNull().default(0),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  agreedWithClient: boolean("agreed_with_client").notNull().default(false),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  changeReason: text("change_reason"),
  ...auditCols,
}, (t) => ({ byAccount: index("target_cohorts_account_idx").on(t.accountId) }));

export const targetCohortMembers = pgTable("target_cohort_members", {
  id: text("id").primaryKey(),
  targetCohortId: text("target_cohort_id").notNull().references(() => targetCohorts.id),
  userId: text("user_id").notNull(),
  eligibleFrom: timestamp("eligible_from", { withTimezone: true }),
  eligibleUntil: timestamp("eligible_until", { withTimezone: true }),
  membershipStatus: text("membership_status").notNull().default("active"),
  exemptionReason: text("exemption_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------- CS Pulse (immutable) */

export const csPulseReviews = pgTable("cs_pulse_reviews", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  reviewerId: text("reviewer_id").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  stakeholderCoverageRating: text("stakeholder_coverage_rating"),
  engagementExecutionRating: text("engagement_execution_rating"),
  renewalReadinessRating: text("renewal_readiness_rating"),
  calculatedPulseScore: numeric("calculated_pulse_score", { precision: 7, scale: 3 }),
  singleThreaded: boolean("single_threaded"),
  activeChampion: boolean("active_champion"),
  sponsorAccess: boolean("sponsor_access"),
  renewalIntent: text("renewal_intent"),
  mainRisk: text("main_risk"),
  nextAction: text("next_action"),
  actionOwner: text("action_owner"),
  actionDueDate: timestamp("action_due_date", { withTimezone: true }),
  overallEvidence: text("overall_evidence"),
  structured: jsonb("structured"), // full field set (§6.1–6.3)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byAccount: index("cs_pulse_account_idx").on(t.accountId, t.reviewedAt) }));

/* ---------------------------------------------------------- overrides */

export const accountHealthOverrides = pgTable("account_health_overrides", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  overrideType: text("override_type").notNull(), // force | cap_max
  requestedStatus: text("requested_status"),
  maximumStatus: text("maximum_status"),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  reviewAt: timestamp("review_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ownerId: text("owner_id"),
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byAccount: index("overrides_account_idx").on(t.accountId) }));

/* ----------------------------------------------- runs & snapshots */

export const healthCalculationRuns = pgTable("health_calculation_runs", {
  id: text("id").primaryKey(),
  runType: text("run_type").notNull(), // nightly | event | manual | preview | backfill
  modelVersionId: text("model_version_id").notNull(),
  calculationDate: timestamp("calculation_date", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  accountCount: integer("account_count").notNull().default(0),
  triggeredBy: text("triggered_by"),
  status: text("status").notNull().default("running"),
});

export const healthScoreSnapshots = pgTable("health_score_snapshots", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => healthCalculationRuns.id),
  accountId: text("account_id").notNull(),
  modelVersionId: text("model_version_id").notNull(),
  calculationDate: timestamp("calculation_date", { withTimezone: true }).notNull(),
  calculatedScore: numeric("calculated_score", { precision: 7, scale: 3 }),
  calculatedBand: text("calculated_band"),
  appliedStatus: text("applied_status").notNull(),
  momentum: text("momentum"),
  scoreDelta: numeric("score_delta", { precision: 7, scale: 3 }),
  previousScore: numeric("previous_score", { precision: 7, scale: 3 }),
  dataCoverage: numeric("data_coverage", { precision: 5, scale: 4 }),
  dataConfidence: text("data_confidence"),
  primaryRisk: text("primary_risk"),
  nextAction: text("next_action"),
  actionOwner: text("action_owner"),
  actionDueDate: timestamp("action_due_date", { withTimezone: true }),
  notAssessed: boolean("not_assessed").notNull().default(false),
  // Full explainable result (§19) — immutable once written.
  result: jsonb("result").$type<AccountHealthResult>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // §30 hot query paths.
  byAccountDate: index("snapshots_account_date_idx").on(t.accountId, t.calculationDate),
  byStatus: index("snapshots_status_idx").on(t.appliedStatus),
  byBand: index("snapshots_band_idx").on(t.calculatedBand),
  byVersion: index("snapshots_version_idx").on(t.modelVersionId),
  uniqueRun: uniqueIndex("snapshots_idempotency_ux").on(t.accountId, t.modelVersionId, t.calculationDate, t.runId),
}));

export const healthComponentResults = pgTable("health_component_results", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => healthScoreSnapshots.id),
  componentId: text("component_id"),
  code: text("code").notNull(),
  score: numeric("score", { precision: 7, scale: 3 }),
  originalWeight: numeric("original_weight", { precision: 6, scale: 5 }),
  effectiveWeight: numeric("effective_weight", { precision: 6, scale: 5 }),
  weightedContribution: numeric("weighted_contribution", { precision: 7, scale: 3 }),
  isApplicable: boolean("is_applicable").notNull().default(true),
  isMissing: boolean("is_missing").notNull().default(false),
  missingReason: text("missing_reason"),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
}, (t) => ({ bySnapshot: index("component_results_snapshot_idx").on(t.snapshotId) }));

export const healthMetricResults = pgTable("health_metric_results", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => healthScoreSnapshots.id),
  componentId: text("component_id"),
  metricKey: text("metric_key").notNull(),
  value: numeric("value", { precision: 14, scale: 4 }),
  numerator: numeric("numerator", { precision: 14, scale: 4 }),
  denominator: numeric("denominator", { precision: 14, scale: 4 }),
  score: numeric("score", { precision: 7, scale: 3 }),
  isValid: boolean("is_valid").notNull().default(true),
  isProxy: boolean("is_proxy").notNull().default(false),
  observationCount: integer("observation_count"),
  source: text("source"),
}, (t) => ({ bySnapshot: index("metric_results_snapshot_idx").on(t.snapshotId) }));

/* ------------------------------------------------------------- audit */

export const healthAuditLogs = pgTable("health_audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  modelVersion: text("model_version"),
  publicationNote: text("publication_note"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ byEntity: index("health_audit_entity_idx").on(t.entityType, t.entityId) }));
