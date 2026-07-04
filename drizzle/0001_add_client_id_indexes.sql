-- Performance: index every per-client read by client_id.
--
-- Before this, tables like client_emails / client_meetings had ONLY a primary
-- key on `id`, so every "WHERE client_id = ?" on the client-profile page did a
-- full sequential scan. After the sync change that ingests emails/meetings from
-- ALL deals (not just closed-won), those tables grew large and the scans became
-- the dominant cost of the profile load ("keeps loading on refresh").
--
-- Run this ONCE against the Supabase database (SQL editor or psql). CONCURRENTLY
-- builds the index without locking the table for writes, so it is safe on the
-- live DB — but it CANNOT run inside a transaction block, so run each statement
-- on its own (the Supabase SQL editor does this; do not wrap in BEGIN/COMMIT).
--
-- IF NOT EXISTS makes this safe to re-run. These index names match the ones
-- declared in lib/db/schema.ts so a future `drizzle-kit push` sees them as
-- already-present and does not try to recreate them.

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_emails_client_id_sent_at_idx
  ON client_emails (client_id, sent_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_meetings_client_id_start_time_idx
  ON client_meetings (client_id, start_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_deals_client_id_idx
  ON client_deals (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_contacts_client_id_idx
  ON client_contacts (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS client_attachments_client_id_idx
  ON client_attachments (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS arr_events_client_id_idx
  ON arr_events (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS arr_snapshots_client_id_idx
  ON arr_snapshots (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS timeline_events_client_id_idx
  ON timeline_events (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS playbook_tasks_client_id_idx
  ON playbook_tasks (client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_recipient_email_idx
  ON notifications (recipient_email);
