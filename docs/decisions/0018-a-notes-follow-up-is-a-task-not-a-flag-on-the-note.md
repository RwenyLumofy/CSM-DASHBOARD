# 0018. A note's follow-up is a task, not a flag on the note

**Status:** Accepted
**Date:** 2026-09-02
**Affected product areas:** Client Profile → Notes · Today board · Client Profile → account
Tasks sidebar

## Context

The Notes tab (`client_notes`) records free-text account and call write-ups and has **no
downstream consumer at all** — it feeds no health input, no signal, no priority, no report,
and no other page except a read-only mirror in the Today drawer
(`components/today/AccountSignalDrawer.tsx:226`). Nothing that a note says ever becomes work,
and nobody reading a note can tell whether anything came of it.

A proposal was raised to add a **"needs follow-up" state to a note** — a flag someone would
raise and someone would later clear.

What already existed when the proposal was made:

- `today_tasks` carries `owner_email`, `due_date`, `priority`, a board lane (`category`), an
  `account_id` link and an `open`/`done` status (`lib/db/schema.ts:316`).
- A task appears on the owner's Today board on its due date, in the account's Tasks sidebar,
  in the overdue count, and — when assigned to someone else — in that person's notification
  bell (`app/(app)/today/task-actions.ts:133`).
- The account Tasks sidebar exists specifically for putting work against an account from the
  profile, and its module header names *"renewal conversation, QBR, exec follow-up"* as the
  purpose of its "Reminder" lane (`components/clients/AccountTasks.tsx:14-17`).
- `today_tasks.source_type` / `source_id` is an existing provenance pair, already used by
  four surfaces to turn something into a task.

What a note carries by contrast: `created_by_email` and `created_by_name` — denormalised
display strings, not a resolvable actor, and the author may have left the company.

## Decision

**A note carries no follow-up state.** There is no `needs_follow_up` column, no
resolved/unresolved status, and no surfacing of an unactioned note in Today, the account
header, or a manager's portfolio view.

**The follow-up on a note is a `today_tasks` row**, created from the note by an explicit human
act, carrying `source_type = 'note'` and `source_id = <note id>`.

**The note surfaces the state of the tasks created from it, derived at read time and never
stored.** That link is the only thing in Signal that expresses "this note needs something to
happen", and it is a query, not a field.

**Converting a note never modifies the note**, and completing or deleting the resulting task
never writes back to it.

## Alternatives considered

- **A boolean `needs_follow_up` on `client_notes`.** Rejected. It is a task with no owner, no
  due date, no notification and nowhere to surface. A flag nobody owns is a flag nobody
  clears, and the question "what happens if nobody clears it" has no answer that does not
  reintroduce a due date and an owner — at which point it is a task.
- **A follow-up flag that surfaces on Today.** Rejected more firmly. Today's outstanding work
  is `today_tasks` plus derived priorities; a third source of "things you owe" gives Today two
  competing definitions of outstanding work. This is the same class of problem already
  recorded in `docs/known-limitations/contradictions.md` under *"Two opposite dismissal
  semantics"*.
- **A follow-up flag that surfaces nowhere but the note.** Rejected as decoration.
- **A `note_tasks` join table.** Rejected — `source_type` / `source_id` is Signal's existing
  provenance model for this exact gesture, and a second one would be a duplicate concept.

## Consequences

- **The note→task link becomes load-bearing.** With no flag, it is the sole expression of
  "this note produced work". The relationship must therefore be reliable: the task stores the
  pointer, the note stores nothing, and both ends display it.
- **A note's id must survive its deletion.** A task pointing at a hard-deleted note has
  provenance that silently becomes a lie. `client_notes` currently hard-deletes
  (`lib/repo/notes.ts:77`). **Soft delete becomes a precondition** for the convert flow, not
  a nicety — the same rule `task_updates` already adopted for the same reason.
- **`source_type` becomes a mixed-cardinality mechanism.** It has meant "a computed thing with
  no row" (a signal, a priority); a note is the first source that is a durable, deletable row.
  The one-open-task-per-source dedupe in `findOpenTodayTaskBySourceDb` is correct for a signal
  and **wrong for a note** — one meeting write-up legitimately produces several tasks — so the
  dedupe must be scoped to `signal` and `commitment`.
- **A converted note's work is visible to a manager for free**, because it is an ordinary task
  in the ordinary places, rather than a note-local state nothing else reads.
- **Nothing new requires maintenance.** No field introduced by this decision needs anyone to
  return later and update it. That was the decisive objection to the flag.
- **What this makes harder:** marking "come back to this" without committing anyone to
  anything. A task demands a lane and, optionally, an owner and a due date. If that proves too
  heavy in practice, the fix is a lighter entry into the Reminder lane — a task problem,
  solved in tasks — and **not** a return of this flag.

## Implementation references

Not yet implemented. Intended behaviour is specified in
[notes-record-when-and-how-it-happened-and-become-tasks](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md).

Current-state evidence: `lib/db/schema.ts:202` (`client_notes`), `:316` (`today_tasks`,
including `source_type` / `source_id` at `:330-331`) · `lib/repo/notes.ts:77` (hard delete) ·
`app/(app)/today/task-actions.ts` (creation gates, third-person assignment rule, notification)
· `lib/repo/drizzle.ts:2071` (`findOpenTodayTaskBySourceDb`) ·
`components/clients/AccountTasks.tsx:14-17` · `components/today/AccountSignalDrawer.tsx:165`
(the existing "Add as task" gesture this reuses).

## Superseded decisions

None. Consistent with [0004](0004-four-flat-permission-tiers-with-server-side-write-gates.md)
(the write gate is the server gate) and with the product principle that a signal may matter
while a task is a commitment — no note becomes work without a human act.

---

**Rationale evidence:** product-owner decision, 2026-09-02, taken on a specification review.
The supporting facts about `today_tasks`, `client_notes` and the provenance pair are read
directly from the files cited above.
