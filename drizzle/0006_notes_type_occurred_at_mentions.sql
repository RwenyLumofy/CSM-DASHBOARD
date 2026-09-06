-- Notes: a channel, a date of its own, a soft delete, and mentions.
--
-- WHY. The Notes tab is in active use (66 notes, 31 accounts, 6 authors as of
-- 2026-09-06) and two things it cannot express are being worked around in the
-- prose: 14 of those 66 notes OPEN WITH A HAND-TYPED DATE ("02 August 2026:",
-- "28 Jul 2026:") because a note is filed on the day it was typed, and the
-- channel is written into the sentence ("Spoke with Neena", "Contacted Haneen
-- by phone", "raised via Whatsapp"). This migration gives the note somewhere
-- to put both. See docs/specs/notes/.
--
-- ENTIRELY ADDITIVE AND IDEMPOTENT. Every statement is ADD COLUMN IF NOT
-- EXISTS or CREATE TABLE IF NOT EXISTS. No DROP, no DELETE, no UPDATE: not one
-- existing row is read or rewritten. All 66 existing notes keep their body,
-- their created_by_* strings, their deal_id and their timestamps. After this
-- runs an existing note has type='note', occurred_at NULL and deleted_at NULL,
-- which is exactly how it behaves today — the feed orders on
-- coalesce(occurred_at, created_at), so a null sorts by created_at as before.

-- ── client_notes ──────────────────────────────────────────────────────────

-- How the thing happened: meeting | call | message | note. A CHANNEL, not a
-- category — it changes what the composer asks for (only `meeting` can link a
-- synced client_meetings row; `note` has no event, so it needs no date) rather
-- than just colouring a badge. Defaults to 'note', which is what every
-- existing row is: something written down, with no event modelled behind it.
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note';

-- When it happened, as distinct from when it was typed. NULL means "no event,
-- or not stated" and the reader falls back to created_at. A linked meeting
-- fills this from client_meetings.start_time; otherwise the author sets it.
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- Optional link to the meeting the note is about. Optional is the point: the
-- meeting is context, not the subject. Signal already knows the meeting
-- happened; what it has never held is what was said in it.
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS meeting_id text;

-- Soft delete. Today a note delete is a real DELETE (lib/repo/notes.ts) on the
-- record CSMs cite in renewal conversations, and task_updates already settled
-- the opposite rule for Signal in its own schema header. It also becomes a
-- correctness requirement the moment a task carries source_id = <note id>: a
-- hard-deleted note makes that task's provenance silently a lie.
ALTER TABLE client_notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The feed reads newest-first by when the thing happened, per client.
CREATE INDEX IF NOT EXISTS client_notes_client_occurred_idx
  ON client_notes (client_id, coalesce(occurred_at, created_at) DESC);
CREATE INDEX IF NOT EXISTS client_notes_meeting_id_idx ON client_notes (meeting_id);

-- ── mentions ──────────────────────────────────────────────────────────────

-- One row per person named in a note, mirroring task_update_mentions exactly.
-- The `@[email]` token in the body exists only so the renderer can place the
-- chip; THIS is the authority for who was named (decision 0012). A mention
-- grants NO access — the picker only offers people who can already see the
-- account, and the server re-checks on write.
--
-- Nothing reads this table yet: notifying a mentioned person needs a
-- `note_mentioned` NotificationType that does not exist. The table is created
-- now because the write path already fills it correctly.
CREATE TABLE IF NOT EXISTS client_note_mentions (
  id text PRIMARY KEY,
  note_id text NOT NULL,
  client_id text NOT NULL,
  mentioned_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_note_mentions_unique
  ON client_note_mentions (note_id, mentioned_email);
CREATE INDEX IF NOT EXISTS client_note_mentions_email_idx
  ON client_note_mentions (mentioned_email, created_at);

-- ── client_meetings ───────────────────────────────────────────────────────

-- Who authored the meeting row. Every existing row is HubSpot's, hence the
-- default. This exists so clearHubspotData can be given the WHERE it is
-- missing (lib/repo/drizzle.ts runs an unfiltered delete on this table, unlike
-- its siblings) BEFORE Signal is ever able to author a meeting of its own.
-- Without that scoping, one admin action would destroy Signal-authored rows
-- and orphan the notes attached to them.
ALTER TABLE client_meetings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hubspot';
