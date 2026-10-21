-- Turn on row level security for the 21 public tables that still had it off
-- after drizzle/rls-lockdown.sql (PR #30; checked on the test database, 2026-10-18).
--
-- They come from three hand-maintained DDL files that never enable RLS:
--   drizzle/contract-records.sql  contract_records, client_status_overrides,
--                                 contract_audit
--   drizzle/health-tables.sql     the 18 health-engine tables below
-- (drizzle/expansion-tables.sql has the same gap, but its four tables were
-- already covered by rls-lockdown.sql.)
--
-- Without RLS, anyone holding the anon key — which ships in the browser bundle
-- for Supabase Storage — can read and write these tables through PostgREST.
-- On the test project the anon key returned real contract_records and
-- contract_audit rows before this ran.
--
-- No policies are added, on purpose. The app reaches Postgres through Drizzle
-- as `postgres`, the owner of every table here, and RLS does not apply to a
-- table's owner (no FORCE). That matches every other public table, which has
-- RLS on with no policies. So: the app is unaffected, and anon / authenticated
-- get nothing.
--
-- Paste-and-run in the Supabase SQL editor, or node scripts/rls-enable-missing.mjs
-- for the test database. Idempotent: re-running it changes nothing, and a table
-- that does not exist in the target database is skipped rather than failing.
-- The closing SELECT lists any public table that still has RLS off — it should
-- return no rows.
--
-- Any new public table needs ENABLE ROW LEVEL SECURITY in the DDL that creates it.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- contract-records.sql
    'contract_records',
    'client_status_overrides',
    'contract_audit',
    -- health-tables.sql
    'account_health_overrides',
    'account_health_scope',
    'cs_pulse_reviews',
    'health_audit_logs',
    'health_calculation_runs',
    'health_component_metric_bindings',
    'health_component_results',
    'health_components',
    'health_metric_definitions',
    'health_metric_results',
    'health_model_assignments',
    'health_model_versions',
    'health_models',
    'health_score_snapshots',
    'health_status_bands',
    'health_status_rules',
    'target_cohort_members',
    'target_cohorts'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

SELECT c.relname AS table_still_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY 1;
