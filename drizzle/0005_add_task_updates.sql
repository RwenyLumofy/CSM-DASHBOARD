-- Task updates: the conversation about a task, and who was named in it.
--
-- The account Tasks sidebar lists tasks across owners, so two people routinely
-- see a task only one of them can act on — with no way to say anything about it
-- or reach the other. That conversation currently happens in Slack and the
-- account record never learns from it.
--
-- Additive and idempotent. No existing row is touched, and the two new
-- notifications columns are nullable so nothing needs backfilling: existing
-- rows keep routing on client_id.

CREATE TABLE IF NOT EXISTS task_updates (
  id           text PRIMARY KEY,
  task_id      text NOT NULL,
  -- 'comment' in v1. 'status_changed' | 'reassigned' | 'due_date_changed' are
  -- reserved so task activity can join this same stream later rather than
  -- needing a second table and a merge at read time.
  kind         text NOT NULL DEFAULT 'comment',
  author_email text NOT NULL,
  -- Plain text carrying `@[<email>]` tokens at each mention position. Not HTML
  -- (sanitisation boundary), not offsets (they break on edit).
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  edited_at    timestamptz,
  -- Soft delete only. A thread with a hole in it reads as data loss, and an
  -- update someone has replied to is part of a conversation rather than one
  -- person's property.
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS task_updates_task_idx ON task_updates (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_update_mentions (
  id              text PRIMARY KEY,
  update_id       text NOT NULL,
  -- Denormalised so "tasks I was mentioned in" needs no join.
  task_id         text NOT NULL,
  mentioned_email text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per person per update: mentioning someone twice in a sentence must
-- not notify them twice.
CREATE UNIQUE INDEX IF NOT EXISTS task_update_mentions_unique
  ON task_update_mentions (update_id, mentioned_email);
CREATE INDEX IF NOT EXISTS task_update_mentions_email_idx
  ON task_update_mentions (mentioned_email, created_at);

-- A notification could only ever address an account, which is why a
-- task_assigned notification on a task with no account was a dead click.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id   text;
