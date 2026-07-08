-- Client notes — the CSM-authored rich-text notes on each account's "Notes"
-- tab, optionally tagged to one of the account's deals for filtering. See
-- lib/db/schema.ts (clientNotes) and lib/notes/*.
--
-- Additive and safe: one brand-new empty table, no change to existing data.
-- IF NOT EXISTS makes it safe to re-run.

CREATE TABLE IF NOT EXISTS client_notes (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  deal_id text,
  body text NOT NULL,
  created_by_email text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes (client_id);
CREATE INDEX IF NOT EXISTS client_notes_deal_id_idx ON client_notes (deal_id);
