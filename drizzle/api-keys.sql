-- API keys — named bearer tokens that let internal tools read Signal over
-- /api/v1/*.
--
-- Paste-and-run in the Supabase SQL editor of the target project (production
-- migrations run from the dashboard; credentials never reach a laptop). The
-- same DDL is applied to the test database by scripts/add-api-keys-table.mjs.
--
-- Strictly additive and idempotent: re-running it changes nothing, and nothing
-- here reads or changes existing tables.
--
-- The key itself is never stored. key_hash is the SHA-256 of the full key;
-- key_prefix is its first 12 characters, kept so Settings can tell keys apart.

CREATE TABLE IF NOT EXISTS api_keys (
  id text PRIMARY KEY,                       -- key-{uuid}
  name text NOT NULL,                        -- what it's for, e.g. "n8n renewals workflow"
  key_prefix text NOT NULL,                  -- "sig_" + first 8 secret chars, for display
  key_hash text NOT NULL,                    -- hex SHA-256 of the full key
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,                    -- null = active
  revoked_by_email text
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);

-- RLS on with no policies (as on clients, app_users, …), so the Supabase
-- anon/authenticated roles can't read key hashes through PostgREST. The app
-- connects as postgres, the table owner, and is unaffected.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
