-- Client Health Scoring Engine — tables only (§20).
-- Incremental DDL extracted from the generated schema; adds ONLY the health
-- tables to an existing database. Review, then apply:
--   psql "$DATABASE_URL" -f drizzle/health-tables.sql
-- (or: npm run db:push, which diffs the live DB and creates only these tables)

CREATE TABLE "account_health_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"override_type" text NOT NULL,
	"requested_status" text,
	"maximum_status" text,
	"reason" text NOT NULL,
	"evidence" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"owner_id" text,
	"created_by" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_health_scope" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"model_version_id" text NOT NULL,
	"component_id" text NOT NULL,
	"is_applicable" boolean DEFAULT true NOT NULL,
	"applicability_reason" text,
	"target_cohort_id" text,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "cs_pulse_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"stakeholder_coverage_rating" text,
	"engagement_execution_rating" text,
	"renewal_readiness_rating" text,
	"calculated_pulse_score" numeric(7, 3),
	"single_threaded" boolean,
	"active_champion" boolean,
	"sponsor_access" boolean,
	"renewal_intent" text,
	"main_risk" text,
	"next_action" text,
	"action_owner" text,
	"action_due_date" timestamp with time zone,
	"overall_evidence" text,
	"structured" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"previous_value" jsonb,
	"new_value" jsonb,
	"model_version" text,
	"publication_note" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_calculation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_type" text NOT NULL,
	"model_version_id" text NOT NULL,
	"calculation_date" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"account_count" integer DEFAULT 0 NOT NULL,
	"triggered_by" text,
	"status" text DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_component_metric_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"component_id" text NOT NULL,
	"metric_definition_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "health_component_results" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"component_id" text,
	"code" text NOT NULL,
	"score" numeric(7, 3),
	"original_weight" numeric(6, 5),
	"effective_weight" numeric(6, 5),
	"weighted_contribution" numeric(7, 3),
	"is_applicable" boolean DEFAULT true NOT NULL,
	"is_missing" boolean DEFAULT false NOT NULL,
	"missing_reason" text,
	"fallback_used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_components" (
	"id" text PRIMARY KEY NOT NULL,
	"model_version_id" text NOT NULL,
	"parent_component_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"weight" numeric(6, 5) DEFAULT '0' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"is_optional" boolean DEFAULT true NOT NULL,
	"is_applicable_by_default" boolean DEFAULT true NOT NULL,
	"missing_data_policy" text DEFAULT 'redistribute_weight' NOT NULL,
	"fallback_metric_id" text,
	"minimum_valid_observations" integer,
	"validity_window_days" integer,
	"score_floor" numeric(7, 3),
	"score_ceiling" numeric(7, 3),
	"formula" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "health_metric_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data_source" text,
	"config" jsonb,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "health_metric_definitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "health_metric_results" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"component_id" text,
	"metric_key" text NOT NULL,
	"value" numeric(14, 4),
	"numerator" numeric(14, 4),
	"denominator" numeric(14, 4),
	"score" numeric(7, 3),
	"is_valid" boolean DEFAULT true NOT NULL,
	"is_proxy" boolean DEFAULT false NOT NULL,
	"observation_count" integer,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "health_model_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"model_version_id" text NOT NULL,
	"account_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "health_model_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone,
	"published_by" text,
	"published_at" timestamp with time zone,
	"change_note" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "health_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "health_score_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"account_id" text NOT NULL,
	"model_version_id" text NOT NULL,
	"calculation_date" timestamp with time zone NOT NULL,
	"calculated_score" numeric(7, 3),
	"calculated_band" text,
	"applied_status" text NOT NULL,
	"momentum" text,
	"score_delta" numeric(7, 3),
	"previous_score" numeric(7, 3),
	"data_coverage" numeric(5, 4),
	"data_confidence" text,
	"primary_risk" text,
	"next_action" text,
	"action_owner" text,
	"action_due_date" timestamp with time zone,
	"not_assessed" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_status_bands" (
	"id" text PRIMARY KEY NOT NULL,
	"model_version_id" text NOT NULL,
	"name" text NOT NULL,
	"min_score" numeric(7, 3) NOT NULL,
	"max_score" numeric(7, 3) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_status_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"model_version_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"kind" text DEFAULT 'status' NOT NULL,
	"condition" jsonb NOT NULL,
	"action_type" text NOT NULL,
	"target_status" text,
	"reason_template" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "target_cohort_members" (
	"id" text PRIMARY KEY NOT NULL,
	"target_cohort_id" text NOT NULL,
	"user_id" text NOT NULL,
	"eligible_from" timestamp with time zone,
	"eligible_until" timestamp with time zone,
	"membership_status" text DEFAULT 'active' NOT NULL,
	"exemption_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_cohorts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"module_code" text,
	"workflow_code" text,
	"name" text NOT NULL,
	"expected_population" integer DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_until" timestamp with time zone,
	"agreed_with_client" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "health_component_metric_bindings" ADD CONSTRAINT "health_component_metric_bindings_component_id_health_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."health_components"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_component_metric_bindings" ADD CONSTRAINT "health_component_metric_bindings_metric_definition_id_health_metric_definitions_id_fk" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."health_metric_definitions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_component_results" ADD CONSTRAINT "health_component_results_snapshot_id_health_score_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."health_score_snapshots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_components" ADD CONSTRAINT "health_components_model_version_id_health_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."health_model_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_metric_results" ADD CONSTRAINT "health_metric_results_snapshot_id_health_score_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."health_score_snapshots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_model_assignments" ADD CONSTRAINT "health_model_assignments_model_version_id_health_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."health_model_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_model_versions" ADD CONSTRAINT "health_model_versions_model_id_health_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."health_models"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_score_snapshots" ADD CONSTRAINT "health_score_snapshots_run_id_health_calculation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."health_calculation_runs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_status_bands" ADD CONSTRAINT "health_status_bands_model_version_id_health_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."health_model_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "health_status_rules" ADD CONSTRAINT "health_status_rules_model_version_id_health_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."health_model_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "target_cohort_members" ADD CONSTRAINT "target_cohort_members_target_cohort_id_target_cohorts_id_fk" FOREIGN KEY ("target_cohort_id") REFERENCES "public"."target_cohorts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "overrides_account_idx" ON "account_health_overrides" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "account_scope_account_idx" ON "account_health_scope" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "cs_pulse_account_idx" ON "cs_pulse_reviews" USING btree ("account_id","reviewed_at");
--> statement-breakpoint
CREATE INDEX "health_audit_entity_idx" ON "health_audit_logs" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX "component_results_snapshot_idx" ON "health_component_results" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE INDEX "health_components_version_idx" ON "health_components" USING btree ("model_version_id");
--> statement-breakpoint
CREATE INDEX "health_components_parent_idx" ON "health_components" USING btree ("parent_component_id");
--> statement-breakpoint
CREATE INDEX "metric_results_snapshot_idx" ON "health_metric_results" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE INDEX "health_assignments_account_idx" ON "health_model_assignments" USING btree ("account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "health_model_version_ux" ON "health_model_versions" USING btree ("model_id","version");
--> statement-breakpoint
CREATE INDEX "snapshots_account_date_idx" ON "health_score_snapshots" USING btree ("account_id","calculation_date");
--> statement-breakpoint
CREATE INDEX "snapshots_status_idx" ON "health_score_snapshots" USING btree ("applied_status");
--> statement-breakpoint
CREATE INDEX "snapshots_band_idx" ON "health_score_snapshots" USING btree ("calculated_band");
--> statement-breakpoint
CREATE INDEX "snapshots_version_idx" ON "health_score_snapshots" USING btree ("model_version_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_idempotency_ux" ON "health_score_snapshots" USING btree ("account_id","model_version_id","calculation_date","run_id");
--> statement-breakpoint
CREATE INDEX "health_status_rules_version_idx" ON "health_status_rules" USING btree ("model_version_id");
--> statement-breakpoint
CREATE INDEX "target_cohorts_account_idx" ON "target_cohorts" USING btree ("account_id");
