-- AI action feed (the revamped Action List). One row per (client, category,
-- signal); see lib/db/schema.ts `clientActions` and lib/actions/*.
--
-- Additive and safe: a brand-new empty table, no change to existing data.
-- IF NOT EXISTS makes it safe to re-run. Run against the Supabase database
-- (SQL editor or psql). The CREATE INDEX statements use CONCURRENTLY so they
-- never lock the table — but that cannot run inside a transaction block, so
-- run each statement on its own (the Supabase SQL editor does this; do not
-- wrap in BEGIN/COMMIT). Index names match lib/db/schema.ts so a future
-- `drizzle-kit push` sees them as already-present.

CREATE TABLE IF NOT EXISTS client_actions (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  category text NOT NULL,
  signal_key text NOT NULL,
  priority text NOT NULL,
  title text NOT NULL,
  insight text,
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'template',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_actions_client_id_idx
  ON client_actions (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_actions_status_idx
  ON client_actions (status);
