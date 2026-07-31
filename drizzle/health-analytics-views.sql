-- =============================================================================
-- Client Health — Metabase-facing analytics views (§26).
-- Run AFTER the health tables migration. These views consume FINALIZED snapshot
-- results (the engine + tables are the source of truth); no business logic lives
-- here. Adjust the `clients` column names if your instance differs.
-- Run: psql "$DATABASE_URL" -f drizzle/health-analytics-views.sql
-- =============================================================================

create schema if not exists analytics;

-- One row per account: its most recent calculation snapshot.
create or replace view analytics.account_health_current as
select distinct on (s.account_id)
  s.account_id,
  c.name                                   as account_name,
  (c.csm ->> 'id')                         as account_owner_id,
  (c.csm ->> 'name')                       as account_owner_name,
  c.arr,
  c.renewal_date,
  (c.renewal_date::date - now()::date)     as days_to_renewal,
  s.model_version_id,
  s.calculated_score,
  s.calculated_band,
  s.applied_status,
  s.momentum,
  s.score_delta,
  s.data_coverage,
  s.data_confidence,
  (s.result -> 'components' -> 0 ->> 'score')::numeric as product_adoption_score,
  (s.result #>> '{components,1,score}')::numeric       as cs_pulse_score,
  (s.result #>> '{components,2,score}')::numeric       as support_reliability_score,
  (s.result #>> '{components,3,score}')::numeric       as client_sentiment_score,
  (s.result -> 'positiveDrivers' ->> 0)    as primary_positive_driver,
  (s.result -> 'negativeDrivers' ->> 0)    as primary_negative_driver,
  s.primary_risk,
  s.next_action,
  s.action_owner,
  s.action_due_date,
  jsonb_array_length(coalesce(s.result -> 'activeOverrides', '[]'::jsonb))  as active_override_count,
  jsonb_array_length(coalesce(s.result -> 'activeStatusRules', '[]'::jsonb)) as triggered_rule_count,
  s.calculation_date                       as last_calculated_at,
  (now() - s.calculation_date) > interval '45 days' as is_assessment_stale
from health_score_snapshots s
join clients c on c.id = s.account_id
order by s.account_id, s.calculation_date desc;

-- One row per account per calculation (full history).
create or replace view analytics.account_health_history as
select s.account_id, c.name as account_name, s.calculation_date, s.model_version_id,
       s.calculated_score, s.calculated_band, s.applied_status, s.momentum, s.score_delta,
       s.data_coverage, s.data_confidence, s.not_assessed
from health_score_snapshots s
join clients c on c.id = s.account_id;

-- Component-level breakdown for the latest snapshot per account.
create or replace view analytics.account_health_component_breakdown as
select s.account_id, s.calculation_date, r.code, r.score, r.original_weight,
       r.effective_weight, r.weighted_contribution, r.is_missing, r.missing_reason, r.fallback_used
from health_component_results r
join health_score_snapshots s on s.id = r.snapshot_id;

-- Triggered applied-status rules per snapshot (explainability).
create or replace view analytics.account_health_triggered_rules as
select s.account_id, s.calculation_date,
       rule ->> 'ruleName' as rule_name, rule ->> 'action' as action, rule ->> 'reason' as reason
from health_score_snapshots s,
     lateral jsonb_array_elements(coalesce(s.result -> 'activeStatusRules', '[]'::jsonb)) as rule;

-- Model version registry.
create or replace view analytics.account_health_model_versions as
select v.id, m.name as model_name, v.version, v.status, v.effective_from, v.published_at, v.published_by
from health_model_versions v join health_models m on m.id = v.model_id;

-- =============================================================================
-- Example validation queries (§26 / §29 stage 6)
-- =============================================================================
-- Accounts that churned while marked Healthy (calibration signal):
--   select * from analytics.account_health_history
--   where applied_status = 'Churned' and calculated_band = 'Healthy';
--
-- Distribution of applied status by CSM:
--   select account_owner_name, applied_status, count(*)
--   from analytics.account_health_current group by 1,2 order by 1;
--
-- Calculated-band vs applied-status divergence (rules doing work):
--   select calculated_band, applied_status, count(*)
--   from analytics.account_health_current group by 1,2;
--
-- Stale assessments needing a fresh Pulse:
--   select account_id, account_name, last_calculated_at
--   from analytics.account_health_current where is_assessment_stale;
