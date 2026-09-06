# 0020. A note is dated by when it happened, not when it was typed — and the meeting is optional context

**Status:** Accepted
**Date:** 2026-09-06
**Affected product areas:** Client Profile → Notes · Client Profile → Communication →
Meetings · Today account drawer

## Context

`client_notes` records free-text account write-ups. It has one timestamp that matters for
display — `created_at`, when the row was written — and the Notes tab orders on it
(`lib/repo/notes.ts:30`, `orderBy(desc(createdAt))`). A conversation that happened on Tuesday
and was written up on Thursday is filed under Thursday.

**The authors have already noticed.** Read-only production data, 2026-09-06:

- `client_notes` holds **66 notes across 31 accounts by 6 authors**, and is growing —
  **19 in July 2026, 45 in August, 2 in early September**.
- **14 of the 66 begin with a hand-typed date** — `"02 August 2026:"`, `"28 Jul 2026:"`,
  `"31-Aug-2026"` — and **5 more carry a date in parentheses**. Roughly one note in three is
  stamping a date into prose because the record has nowhere to put one.
- Of the clearest dozen hand-dated notes, **only about four are about a meeting**. The rest are
  **calls, emails and WhatsApp**: *"Spoke with Neena"*, *"Contacted Haneen"*, *"Attempted to
  contact Shatha by phone"*, *"Reema called"*, *"raised via Whatsapp"*.

An earlier revision of the notes specification proposed solving the date problem by **attaching
a note to a synced `client_meetings` row**, so the note would inherit the meeting's
`start_time`. Meeting coverage was measured before building it: **37 of 53 live CSM-owned
accounts (70%) had a `COMPLETED` meeting in the last 90 days**, above the ~60% bar the
specification set itself. Coverage is not the problem.

Two further facts bear on what a meeting record is worth here:

- `client_meetings` holds **2,283 meetings**, 2,148 with a non-empty `notes` body — but
  **1,334 of those bodies are HTML email bodies and 339 are bare attendee lists**. The column
  is `hs_meeting_body`: **invitations, not write-ups**.
- **483 meetings across 60 accounts are titled by an AI notetaker (`read.ai`).** A meeting
  write-up workflow already exists outside Signal.

The product owner stated the goal directly: *"not to record or show that we met this client,
but rather add what you agreed on or discussed as a summary or FYI."*

## Decision

**A note carries `occurred_at`** — a nullable timestamp meaning **when the thing the note
recounts happened**, distinct from `created_at`, which continues to mean when the row was
written and is never overwritten.

**Every list, sort and heading uses `coalesce(occurred_at, created_at)`.** A note written
before this field existed has `occurred_at` null and therefore orders exactly as it does
today. There is no backfill and none is attempted: nothing parses the 19 hand-typed dates out
of existing bodies.

**The meeting link is demoted to optional context.** A note may link one synced meeting; a
linked meeting fills `occurred_at` from its `start_time`. **Declining the link costs nothing**
and is never flagged.

**Signal creates no meeting-coverage measure of any kind.** Specifically rejected, and not
deferred:

- a "0 of 12 meetings written up" counter, anywhere;
- a write-up queue or worklist of meetings awaiting notes;
- a filter whose purpose is to advertise unwritten meetings;
- any surfacing of write-up coverage in Today, the account header, Insights or a manager view;
- any signal, health input, action-list item or notification derived from a meeting having no
  note.

## Alternatives considered

- **Attach-to-meeting as the primary mechanism, with the date inherited.** Rejected as the
  *primary* mechanism, kept as optional context. It is a good answer for meetings and reaches
  roughly a third of the hand-dated cases. It does nothing for *"Reema called"* or *"raised via
  Whatsapp"*, which is most of what is being written.
- **File everything by write time and accept the drift.** Rejected. It preserves ordering
  simplicity and keeps the exact defect 19 notes are working around by hand.
- **Parse the hand-typed dates out of existing bodies and backfill `occurred_at`.** Rejected
  outright. The product owner's constraint is that **no existing note may be deleted, rewritten
  or backfilled**, and a parse over 19 inconsistent formats would silently mis-date the
  record it was meant to fix.
- **A meeting-coverage view, so managers can see which meetings lack notes.** Rejected. It
  converts an optional aid into a chore that will be ignored, it measures the thing the owner
  said is not the point, and it would score CSMs against a write-up job partly done by
  `read.ai` already.
- **Overwrite `created_at` with the occurrence date.** Rejected. Two facts — when it happened
  and when it was recorded — are both worth keeping, and destroying the second removes the only
  audit trail the row has.

## Consequences

- **The Notes feed is no longer strictly ordered by `created_at`.** A note can appear above one
  written before it. The effective date is shown primarily and the authored date secondarily,
  both labelled.
- **Every existing note is untouched and unmoved.** Null `occurred_at` collapses
  `coalesce(occurred_at, created_at)` to today's behaviour exactly. This is what makes the
  change additive.
- **`occurred_at` is an unverifiable human assertion** everywhere except a linked meeting. It
  is worth more than `created_at` as a record and is softer as evidence — which is precisely
  why decision [0013](0013-record-keeping-alone-is-not-a-health-score.md) continues to bar a
  note from feeding any score. A CSM logging five WhatsApp contacts will still read as
  under-engaged to CS Pulse, and that gap is recorded rather than closed.
- **Signal gains a second, better chronology inside one tab**, and the absence of an
  account-wide one becomes conspicuous. That is left open deliberately rather than half-built
  inside the Notes tab.
- **`clearHubspotData` becomes a hazard to watch.** `lib/repo/drizzle.ts:2665` deletes every
  `client_meetings` row with no `WHERE`. Today the damage is recoverable because meeting ids
  are deterministic (`hsm-{hubspotMeetingId}`) and a re-sync restores them. **If Signal ever
  authors its own meeting rows, one admin action destroys them and orphans every note attached
  to them** — so the delete must be scoped before that day.
- **What this makes harder:** answering "which meetings have we written up?" Deliberately. If
  that question is ever genuinely needed, it needs its own decision and a stated owner, not a
  counter added to a tab.

## Implementation references

Not yet implemented. Intended behaviour is specified in
[notes-record-when-and-how-it-happened-and-become-tasks](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md)
(§5.1, §5.3, `BR-002`–`BR-007`, `FR-008`, `FR-012`, `AC-038`).

Current-state evidence: `lib/db/schema.ts:202` (`client_notes`), `:235` (`client_meetings`,
id shape and `notes` column) · `lib/repo/notes.ts:30` (the `created_at DESC` read) ·
`app/(app)/clients/[id]/note-actions.ts` (`resolveDealId`, the pattern `resolveMeetingId`
follows) · `components/clients/ClientProfileTabs.tsx:1239` (*"No meeting notes available."*) ·
`lib/repo/drizzle.ts:2665` (`clearHubspotData`).

## Superseded decisions

None. It **revises the notes specification's revision 1**, which named the meeting link as the
substantive change and gated it on a meeting-coverage query. That query has been run and
cleared; the gate is removed. Consistent with
[0013](0013-record-keeping-alone-is-not-a-health-score.md) and with
[0018](0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md).

---

**Rationale evidence:** product-owner decision, 2026-09-06, taken on a specification review,
supported by read-only production data (`CLONE_SOURCE_URL`, 2026-09-06) and by the files cited
above.
