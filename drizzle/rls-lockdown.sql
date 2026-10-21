-- Turn on row level security for the 11 public tables that were created
-- without it (Supabase advisor: rls_disabled_in_public, 2026-10-18).
--
-- Without RLS, anyone holding the anon key — which ships in the browser bundle
-- for Supabase Storage — could read and write these tables through PostgREST,
-- user_account_grants included.
--
-- No policies are added, on purpose. The app reaches Postgres through Drizzle
-- as `postgres`, the owner of every table here, and RLS does not apply to a
-- table's owner (no FORCE). That matches the other 30 public tables, which
-- already have RLS on with no policies. So: the app is unaffected, and anon /
-- authenticated get nothing.
--
-- Paste-and-run in the Supabase SQL editor, or psql "$DATABASE_URL" -f.
-- Idempotent: re-running it changes nothing.
--
-- Any new public table needs the same line — see the advisor before shipping.

ALTER TABLE public.client_note_mentions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_usage_monthly    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_next_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_update_mentions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_updates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_account_grants     ENABLE ROW LEVEL SECURITY;
