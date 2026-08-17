-- Expansion CRM — the four tables behind /expansion.
--
-- Paste-and-run in the Supabase SQL editor of the target project. This is the
-- same DDL as scripts/add-expansion-tables.mjs and exists so the PRODUCTION
-- migration can be run from the dashboard, without production credentials
-- needing to reach a laptop.
--
-- Strictly additive and idempotent: re-running it changes nothing. Nothing here
-- touches arr_events — closing an opportunity never writes to the ARR ledger.
--
-- Spec: docs/specs/revenue/expansion-opportunities-specification.md

CREATE TABLE IF NOT EXISTS expansion_opportunities (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  stage text NOT NULL DEFAULT 'identified',
  outcome text,
  expected_arr double precision,
  currency text NOT NULL DEFAULT 'USD',
  expansion_type text NOT NULL DEFAULT 'module',
  product text,
  owner_email text,
  expected_close_date date,
  confidence text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  proposal_date date,
  outcome_date date,
  final_arr double precision,
  agreement_type text,
  confirmed_by text,
  arr_recorded boolean NOT NULL DEFAULT false,
  close_reason text,
  close_note text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- An outcome is what CLOSED means. Enforced in the database, not only in the
-- server action, because "stage = closed with no outcome" and "outcome set on a
-- live opportunity" both make the board lie about the pipeline.
DO $$ BEGIN
  ALTER TABLE expansion_opportunities
    ADD CONSTRAINT expansion_outcome_iff_closed
    CHECK ((stage = 'closed') = (outcome IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS expansion_next_steps (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
  text text NOT NULL,
  due_date date NOT NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expansion_notes (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expansion_activity (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
  what text NOT NULL,
  actor_email text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expansion_opportunities_client_id_idx ON expansion_opportunities (client_id);
CREATE INDEX IF NOT EXISTS expansion_opportunities_stage_idx ON expansion_opportunities (stage);
CREATE INDEX IF NOT EXISTS expansion_next_steps_opportunity_idx ON expansion_next_steps (opportunity_id, due_date);
CREATE INDEX IF NOT EXISTS expansion_notes_opportunity_idx ON expansion_notes (opportunity_id, created_at);
CREATE INDEX IF NOT EXISTS expansion_activity_opportunity_idx ON expansion_activity (opportunity_id, at);

-- Verify: expects 4.
SELECT count(*) AS expansion_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'expansion_%';
