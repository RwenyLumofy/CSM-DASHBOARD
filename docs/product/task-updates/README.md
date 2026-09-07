# Task updates and mentions

**Status:** Partially verified — the mention parser is tested (six tests); no server action,
permission gate or surface is covered by a test.

## Summary

An append-only, attributed conversation on a single task, with `@` mentions of people who can
already see the account. It appears in two places — the account Tasks sidebar and the Today
board's task drawer — and both show the same thread, because a task has one conversation
rather than one per surface it can be opened from.

## Purpose

The account Tasks sidebar deliberately lists tasks **across owners**, so two people routinely
see a task only one of them can act on. Before this shipped there was nowhere to say anything
about one and no way to reach the other: that conversation happened in Slack, and the account
record never learned from it. This puts the sentence on the task.

It is also the first thing in Signal that gives the notification bell something worth
notifying about — see [notifications](../notifications/README.md).

## Intended users

CSM (Operator) · CS Manager · Administrator · Super Admin. Implementation and Support staff
participate **only if they can already see the account** — that is the whole shape of the
permission rule below, and its stated cost.

Guests are excluded entirely — they can neither post **nor read** a thread. This differs from
what was specified; see [Known limitations](#known-limitations).

## Entry points

- **Route:** `/clients/[id]` — Client Profile → **Tasks** button → sidebar → the speech-bubble
  button on a task row.
- **Route:** `/today` — Today board → open a task → **Updates**, below Details.
- **Links in from:** the notification bell. A task notification routes to
  `/clients/{id}?task={id}` or `/today?task={id}`, and both surfaces open that task's thread
  on arrival — [notifications](../notifications/README.md).
- **Contextual actions:** the completed-tasks disclosure in the sidebar, so finishing a task
  does not take its thread out of reach.

## Information architecture

No new page and no new tab. The thread is a **nested panel inside the task row**, not a second
drawer — a drawer inside a drawer is a dead end on a narrow viewport, and the Tasks sidebar is
a 540px drawer that goes full width below the `sm` breakpoint.

Inside a row, in order: the task title on its own full-width line, its metadata beneath
(category, due label, owner), then — when expanded — the thread and the composer, inset and
tinted so it is obvious the conversation hangs off *that* task.

**One task expanded at a time.** Expansion state is not persisted.

Below the open list sits a collapsed **"N completed"** disclosure, added with this feature:
the sidebar previously listed open tasks only, which was fine when a task was a checkbox, but
completing one now takes a whole conversation out of view.

## Primary workflows

### Post an update

1. **Trigger** — the user opens a task's thread in either surface.
2. **Preconditions** — signed in; not a Guest; and write access to the task (see
   [Permissions](#permissions)).
3. **User actions** — type in the composer; optionally press `@` and choose a person; submit
   with the **Post update** button or `Enter` (`Shift+Enter` inserts a newline).
4. **System behaviour** — the client converts each chosen display name back into an
   `@[<email>]` token, longest name first so `@Qais Malallah` is not half-consumed by a
   shorter `@Qais`. The server then trims, length-checks, re-runs the permission gate,
   **re-parses the mention tokens out of the body itself** and intersects them with the
   audience allowed for that task. One `task_updates` row and one `task_update_mentions` row
   per distinct mentioned person are written in a single transaction, then notifications are
   written. `/clients/{accountId}` and `/today` are revalidated.
5. **Result** — the update appears at the bottom of the thread, attributed, with mentions
   drawn as chips.
6. **Failure** — the composer keeps its text and shows the error inline. Nothing is notified.

### Mention a person

1. **Trigger** — typing `@` in the composer, with the caret inside the word that follows.
2. **Preconditions** — the task has a linked account. A task with **no** account offers
   nobody: `listMentionableForTaskAction` returns `[]` for it.
3. **User actions** — filter by typing, click a person.
4. **System behaviour** — the picker inserts the person's **display name** into the textarea
   (the raw email is unreadable while typing) and remembers the name → email pair; the
   conversion back to a token happens at submit. The picker is headed *"People who can see
   this account"* and lists at most six matches.
5. **Result** — the stored body carries the email, never the name, so renaming a person in
   Settings changes how existing updates render and rewrites nothing.
6. **Failure** — an unresolvable token renders as the raw email rather than vanishing; a
   mention that disappears would rewrite what somebody said.

### Remove an update

1. **Trigger** — the trash control, offered only on updates the viewer authored.
2. **Preconditions** — a browser `confirm()`; then the server gate.
3. **System behaviour** — a **soft** delete: `deleted_at` is stamped, the row survives, and
   the body is blanked on read.
4. **Result** — the row renders *"Update removed"* in place. A thread with a hole in it reads
   as data loss, and an update someone has replied to is part of a conversation rather than
   one person's property.
5. **Failure** — inline error. **See [Known limitations](#known-limitations) #1: the write
   happens before the authorship check, so the error can be shown after the row has already
   been deleted.**

### Arrive from a notification

1. **Trigger** — clicking a task notification in the bell.
2. **System behaviour** — the surface reads `?task=<id>` and opens that task's thread, **only
   if the id is present in the already-permission-scoped list it rendered**. A stale or
   foreign id leaves the page alone rather than opening an empty drawer that implies the task
   exists. Handled once per id, so navigating away and back does not re-open it.

## Fields and data

| Label | Meaning | Type | Required | Default | Editable by | Source | Validation | Downstream effects |
|---|---|---|---|---|---|---|---|---|
| Update body | The sentence | text | yes | — | **nobody** (no edit path exists) | user | trimmed; non-empty; ≤ 4000 chars | rendered; first 140 chars become the notification body |
| Mention | A named person | row in `task_update_mentions` | no | — | nobody | picker, re-derived server-side from the body | must be in the task's permitted audience at post time | notification recipient |
| Author | Who wrote it | text (lower-cased email) | yes | session | nobody | session | — | attribution; the delete check |
| Posted at | When | timestamptz | yes | `now()` | nobody | server | — | thread ordering, oldest first |
| Edited at | Last edit | timestamptz | no | null | — | — | — | renders an "edited" marker — **never written today** |
| Removed at | Soft delete | timestamptz | no | null | server | server | — | renders "Update removed" |
| Kind | Row type | text | yes | `comment` | nobody | server | only `comment` is written | reserved for task activity later |

**Nobody maintains an update.** It is written once by a human and read. The feature adds no
field anyone has to keep current — deliberately, which is why there is no "participants" or
"watchers" list.

## States and statuses

| State | Meaning | Entered by | Exited by | Who can change it | What it affects |
|---|---|---|---|---|---|
| Posted | Visible in the thread | a successful write | removal | author | notifications fire once, at entry |
| Removed | Renders "Update removed" | `deleted_at` set | terminal | see limitation #1 | the row stays; the mention rows stay |

The `edited` state described in the specification **does not exist** — no edit action was
implemented. The task's own `open`/`done` states are untouched, and **an update may be posted
on a completed task**: closing work often produces the last useful sentence about it.

## Business rules

Enforced **server-side**, in
[`app/(app)/today/task-update-actions.ts`](../../../app/%28app%29/today/task-update-actions.ts)
unless stated otherwise.

1. **A mention grants nothing.** Being named adds no read or write access to the task or the
   account. Held by construction: no code path reads a mention row for authorisation, and the
   picker only ever offers people who could already see the account. Decision
   [0012](../../decisions/0012-a-mention-is-a-reference-not-a-grant.md).
2. **The audience is the people who can already see the account.** `getUsersWhoCanSeeClientDb`
   ([`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts):1774) mirrors `scopeAdmits` in
   `lib/auth.ts`: scope `all` sees every account, `assigned` sees the account's CSM and
   implementation owner, `selected` needs an explicit `user_account_grants` row, `none` sees
   nothing. A null scope falls back to the role default. **On any error it returns nobody, not
   everybody.**
3. **It does not call `getAppUsers()`.** That read is unscoped and is already recorded as
   leaking the staff directory
   ([contradictions](../../known-limitations/contradictions.md)); this feature deliberately
   does not become another consumer of it.
4. **The server re-parses the body; it never trusts a client-supplied mention list.**
   `parseMentions()` extracts every `@[<email>]` token, lower-cases and de-duplicates, and the
   result is intersected with rule 2's audience before anything is written. Without this, a
   hand-crafted request would notify anyone in the company — the exact widening rule 1
   forbids. This is the tested part of the feature
   ([`lib/task-updates.test.ts`](../../../lib/task-updates.test.ts), six tests).
5. **Mentions are stored by email, never by display name.**
6. **Nobody is notified about their own writing.**
7. **A mention beats ownership.** Someone who is both mentioned and the task's owner receives
   the mention notification only, never both.
8. **Ordering is `created_at` ascending** — a conversation reads downward.
9. **Deletion is soft, and the intent is "your own, or an admin with unrestricted scope"** —
   the same `editsAllClients(role) && scope.mode === "all"` predicate used for editing anyone's
   task. **The implementation applies this check after the write; see limitation #1.**

Cross-product permission rules:
[permissions-and-scoping](../../business-rules/permissions-and-scoping.md) R12–R14.

## Permissions

- **View a thread:** signed in, not a Guest, **and** write access to the task. Read is gated on
  the same predicate as write, deliberately and by an explicit comment — which means a Guest
  sees no thread at all.
- **Post:** same gate.
- **Edit:** nobody. No edit action exists.
- **Delete:** the author, or an admin with scope `all` — intended. See limitation #1.
- **Be mentioned:** anyone in the account's permitted audience.

**Server-side enforcement.** One helper, `loadWritableTask()`
([`app/(app)/today/task-update-actions.ts`](../../../app/%28app%29/today/task-update-actions.ts):34),
so read and write can never disagree about who may touch a thread:

| Task shape | Gate |
|---|---|
| Any | `getCurrentUserRole()` must exist and must not be `guest` (line 39) |
| Linked to an account | `denyClientWrite(task.accountId)` — the standard client write gate in `lib/auth.ts` (line 49) |
| No account (personal) | the caller owns it, **or** `editsAllClients(role) && scope.mode === "all"` (lines 52–56) |

`getTaskUpdatesAction` returns `[]` rather than throwing when the gate refuses (line 84) — a
thread that fails to load must not blank the task list around it. The consequence is that "no
permission" and "no updates yet" are indistinguishable to the reader.

**UI affordances are not the permission.** The Today drawer passes `canPost={viewer.role !==
"guest"}` and the sidebar passes the profile's `canEdit`; an operator outside their scope is
shown a composer and refused by the server. That is the correct place for the gate, but it is
a poor error experience.

## Automations and side effects

Two notification triggers, written in the same action as the post, after the update row
succeeds:

| Trigger | Recipient | Type | Body |
|---|---|---|---|
| You were named in an update | each mentioned person except the author | `task_mentioned` | task title + first 140 characters |
| An update was posted on a task you own | the owner, unless they are the author or were mentioned | `task_update` | task title + first 140 characters |

Both carry `entity_type = "task"` and `entity_id = <task id>` so the bell can deep-link, plus
`client_id` when the task has an account.

**Notification ids are deterministic per (update, recipient)** — `nt-{updateId}-{email}` — so
a retried post cannot notify twice. Note that this is **per update, not per task**: three
updates on the same task produce three notification rows, not one refreshed in place. The
specification called for coalescing; it was not implemented.

A failed notification write does **not** fail the post — the update stands, matching the
pattern `createTaskAction` already uses.

**Not automated:** no email, no digests, no overdue-task notifications, no real-time delivery.
A mention creates no task and no commitment for the person mentioned — if somebody must do
something, assign them the task.

## Empty, loading and error states

| State | What is shown |
|---|---|
| Loading | *"Loading updates…"* inside the expanded region; the task list stays interactive |
| No updates | *"No updates yet. Post one to tell whoever else is watching this account where it stands."* plus the composer |
| Post failed | Inline error band; the composer keeps its text |
| Removed update | *"Update removed"*, italic, in place |
| Mention unresolvable | The raw email, chipped |
| Picker has nobody | The picker simply does not open — there is **no** "no one else can see this account" message |
| Not permitted to read | Indistinguishable from "no updates yet" — the action returns `[]` |
| Thread failed to load | Also indistinguishable — `getTaskUpdatesDb` catches and returns `[]` |
| No database configured | Every action returns empty or *"No database configured."* |

## Data model

Two new tables, added by
[`drizzle/0005_add_task_updates.sql`](../../../drizzle/0005_add_task_updates.sql) (applied to
production 2026-08-03). Additive and idempotent — no existing row is touched.

**`task_updates`** — one row per posted update. `id` (`tup-{uuid}`), `task_id`
(`today_tasks.id`), `kind` (`comment`; `status_changed` / `reassigned` / `due_date_changed`
reserved), `author_email`, `body`, `created_at`, `edited_at`, `deleted_at`. Indexed on
`(task_id, created_at)`.

**`task_update_mentions`** — one row per distinct person named in an update. `id`
(`tum-{uuid}`), `update_id`, `task_id` (denormalised, so "tasks I was mentioned in" needs no
join), `mentioned_email`, `created_at`. **Unique on `(update_id, mentioned_email)`** — naming
someone twice in a sentence must not notify them twice — and indexed on
`(mentioned_email, created_at)`.

**`notifications`** gains nullable `entity_type` and `entity_id`. Existing rows stay null and
keep routing on `client_id`.

**No foreign keys are declared** on either table, matching the rest of this schema.

**Body format.** Plain text carrying the stable token `@[<email>]` at each mention position.
Not HTML — that would drag in the sanitisation boundary and `dangerouslySetInnerHTML` for what
is a sentence. Not character offsets — those break on edit. `task_update_mentions` is the
authoritative index; the token exists only so the renderer can place the chip.

**Corrected while here:** the schema comment on `today_tasks.notes` said *"supports
@mentions"* and did not — `AddTaskModal` collected mention chips into local state and dropped
them at submit, so only the literal `@Name` characters were ever stored.

See [data-model](../../data-model/README.md).

## Technical implementation

| Concern | File |
|---|---|
| Server actions (list, post, delete, mention search) | [`app/(app)/today/task-update-actions.ts`](../../../app/%28app%29/today/task-update-actions.ts) |
| Mention token parser | [`lib/task-updates.ts`](../../../lib/task-updates.ts) |
| Thread, picker, renderer, composer | [`components/clients/TaskUpdates.tsx`](../../../components/clients/TaskUpdates.tsx) |
| Sidebar: row expansion, completed disclosure, `?task=` handling | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) |
| Today drawer: the same thread | [`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx) |
| Today board: `?task=` handling | [`components/today/TodayWorkspace.tsx`](../../../components/today/TodayWorkspace.tsx) |
| Readers and writers | [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) — `getTodayTaskDb`:1742, `getUsersWhoCanSeeClientDb`:1774, `getTaskUpdatesDb`:1831, `createTaskUpdateDb`:1867, `deleteTaskUpdateDb`:1898, `taskIdForUpdateDb`:1910 |
| Schema | [`lib/db/schema.ts`](../../../lib/db/schema.ts) — `taskUpdates`, `taskUpdateMentions` |
| Migration | [`drizzle/0005_add_task_updates.sql`](../../../drizzle/0005_add_task_updates.sql), applied by [`scripts/apply-task-updates-migration.mjs`](../../../scripts/apply-task-updates-migration.mjs) |
| Tests | [`lib/task-updates.test.ts`](../../../lib/task-updates.test.ts) — the parser only |

**Why the parser lives in its own module.** A `"use server"` module may export only async
functions; a synchronous export from one is a **build** error that `tsc` does not catch. That
constraint is also the reason the parser is unit-testable at all.

`createTaskUpdateDb` writes the update and its mention rows in **one transaction** — a mention
row without its update, or an update whose mentions never landed, would mean somebody was
notified about something unreadable, or not notified at all.

## Analytics and observability

**None.** Signal has no product analytics transport — `track()` in `lib/today/analytics.ts`
writes a development-mode console breadcrumb and nothing else. No event is emitted for posting
an update or selecting a mention, and none was added.

Adoption can only be measured by direct query: rows in `task_updates` per week, distinct
authors, and the share of tasks with at least one update.

There is no server log of who read a thread.

## Dependencies

[Client Profile](../client-profile/README.md) (Tasks sidebar) ·
[Today](../today/README.md) (task drawer) ·
[Notifications](../notifications/README.md) ·
[Users and permissions](../users-and-permissions/README.md) — the audience rule is a direct
consumer of `app_users.scope` and `user_account_grants`.

No dependency on any external system.

## Known limitations

1. **The delete write happens before the authorship check.** In `deleteTaskUpdateAction`,
   `deleteTaskUpdateDb(updateId)` stamps `deleted_at` (line 187,
   [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts):1902) and the "your own, or scope
   `all`" check runs on the value it returns (lines 189–191). A permitted account writer who
   is **not** the author therefore removes the update **and** receives *"You can only remove
   your own updates."* The refusal message is accurate about intent and wrong about outcome.
   The UI offers the control only on `mine` updates, so this needs a direct action call to
   reach — but the server gate is the permission, and it does not hold. **Needs an
   engineering fix; not something documentation can resolve.**
2. **Guests cannot read a thread.** `loadWritableTask` refuses `role === "guest"` and
   `getTaskUpdatesAction` uses it unchanged, so a Guest sees an empty thread on every task.
   The specification called for read-only visibility. The code states the read-equals-write
   choice deliberately, so this is a design divergence rather than an oversight — but the
   effect on Guests was probably not the intent.
3. **No edit path.** `edited_at` exists in the table and the UI renders an "edited" marker,
   and nothing ever writes it.
4. **No update count on a task row.** A user cannot tell which tasks have conversations
   without opening each one.
5. **"You may not read this" and "there is nothing here" look identical.** Both produce an
   empty thread.
6. **Notifications do not coalesce per task.** Three updates on one task produce three
   notification rows for the owner.
7. **A notification pointing at a *completed* task does not fully land.** The sidebar sets the
   task expanded, but the completed list lives inside a `<details>` element that is not opened
   programmatically, so the reader arrives with the thread expanded inside a collapsed
   disclosure.
8. **Deleting a task does not clean up.** Its `task_updates`, `task_update_mentions` and
   outstanding notifications are not removed — there are no foreign keys and no cascade in
   `deleteTaskAction`. The specification required this.
9. **Two surfaces render the same thread** and must change together.
10. **A person with no grant on the account cannot be reached here at all.** This is the stated
    cost of rule 1, not a bug — the answer is for an admin to grant them the account.
11. **Two people with identical display names** resolve to one of them at submit. Bounded by
    rule 4: the worst case notifies a colleague who can already see the account.
12. **Never exercised with a real session.** Posting, the picker's contents and the
    notification fan-out all require a signed-in Clerk user, and the local environment has
    none. `app/scratch-tasks` is a development-only preview against sample data — not product,
    404 outside development — see [known-limitations](../../known-limitations/README.md).

## Open questions

- Should a Guest be able to read a task thread? The specification said yes; the code says no.
  A product decision, not a code question.
- Should deleting a task purge its updates, mentions and notifications, or is retaining them
  the intent?
- Is the scoped picker (rule 2) sufficient in practice, or are task conversations commonly
  between people who cannot both see the account? Four weeks of `task_updates` rows answer it.
- Should the `kind` column's reserved values (`status_changed`, `reassigned`,
  `due_date_changed`) be filled in, putting task activity into the same stream?

## Source references

`app/(app)/today/task-update-actions.ts` · `lib/task-updates.ts` · `lib/task-updates.test.ts` ·
`components/clients/TaskUpdates.tsx` · `components/clients/AccountTasks.tsx` ·
`components/today/TaskDrawer.tsx` · `components/today/TodayWorkspace.tsx` ·
`lib/repo/drizzle.ts` · `lib/db/schema.ts` · `lib/types.ts` ·
`drizzle/0005_add_task_updates.sql` · `scripts/apply-task-updates-migration.mjs` ·
`lib/auth.ts` · `lib/roles.ts`

The pre-implementation specification is
[`docs/specs/tasks/task-updates-mentions-and-notifications.md`](../../specs/tasks/task-updates-mentions-and-notifications.md).
It describes **intended** behaviour and several parts of it did not ship — it is cited here as
the origin of the design, never as evidence of what the product does.

---

**Documentation status:** Partially verified
**Last verified:** 2026-08-03
**Verified against commit:** `6660fe8`
**Documentation owner:** Unassigned
