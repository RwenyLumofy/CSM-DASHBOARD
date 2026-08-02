# Specification — a task can be discussed, and being named on one reaches you

> **Level 3.** Written by `signal-product-manager`. Describes **intended** behaviour.
> It is not product documentation and must never be cited as evidence of what Signal
> does today. Level 3 because it adds two database entities, changes the notifications
> entity and its only surface, introduces a new permission question (does naming someone
> grant them access), affects the Client Profile, the Today board and the app shell, and
> behaves differently for all four permission tiers.

**Status:** Proposed
**Date:** 2026-08-02
**Product areas affected:** Client Profile → Tasks sidebar · Today board · Notifications ·
Users and permissions
**Author:** `signal-product-manager`
**Verified against commit:** `7b0fa94`

---

## 1. Executive decision

**Product judgement: Proceed with changes.**

Signal has tasks that two people can see and only one person can act on, and it has no way
for either of them to say anything about one. The request — better @mentions and shared
updates in the account Tasks sidebar, plus better notifications — is one feature, not three,
because a mention that reaches nobody is decoration and a notification system with nothing
to notify about stays empty. Build **an update thread on a task, with mentions of people
only, and route both into the existing notification bell.**

Three things in the request must change on the way in.

**The existing @mention system cannot be reused as-is, because it does not persist
anything.** `MentionInput` in [`components/today/mentions.tsx`](../../../components/today/mentions.tsx)
collects structured `MentionEntity` chips, and
[`components/today/AddTaskModal.tsx`](../../../components/today/AddTaskModal.tsx) throws them
away at submit — `createTaskAction` receives only `notes: details.trim()`. The `@Name` the
user typed survives as literal characters in a `text` column; the reference does not survive
at all. The comment on `today_tasks.notes` in [`lib/db/schema.ts`](../../../lib/db/schema.ts)
— *"optional description, supports @mentions"* — is **aspirational, and currently false**.
Reuse the interaction and the "id, never display name" principle; replace the resolution and
storage.

**Mentions are of people. Not accounts, not pages.** An account mention on a task duplicates
the task's own `account_id` link with a weaker, unqueried association. Page mentions target
`SignalPage`, which does not exist in real data at all —
[`lib/today/build.ts`](../../../lib/today/build.ts) sets `pages: []` in the real-data
snapshot and only the mock path populates them.

**A mention does not grant access.** Naming a colleague must never widen what they can see,
or a text field becomes a permission bypass around
[`lib/auth.ts`](../../../lib/auth.ts)'s scope model. The picker offers only people who can
already see the account, so the question of a mention granting access never arises.

The whole of this is too large for one change. Section 6 splits it, and **Step 1 alone is a
coherent product** — it is the thing the user asked for.

## 2. Problem

**User problem.** A CSM opens an account, sees a task that belongs to a teammate — the
sidebar deliberately lists tasks across owners — and has something to say about it. Today
there is nowhere to say it and no way to reach the person. They leave Signal, say it in
Slack or in a meeting, and the account record ends the week no better informed than it
started.

**Current behaviour, verified.**

| Claim | Evidence |
|---|---|
| The sidebar lists this account's tasks across all owners | `getTodayTasksVisibleDb(email, [id])` returns `owner_email = me OR account_id IN (ids)` — [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) line 1716; called from [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/%5Bid%5D/page.tsx) line 62 |
| A task row in the sidebar cannot be opened | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) renders a `<li>` with a complete-checkbox and static text; there is no click target |
| Completing someone else's task is refused server-side | `toggleTaskAction` → `setTodayTaskStatusDb(id, email, …)`; returns `NOT_YOURS` — [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 166 |
| A per-task detail view exists, but only on the Today board | [`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx); it depends on `useToday()` and the client-side `lib/today` store, neither of which the Client Profile has |
| There is no comment, update, activity or history entity anywhere | No `comment` table in [`lib/db/schema.ts`](../../../lib/db/schema.ts); `today_tasks` has no history |
| Mentions are captured and discarded | [`components/today/AddTaskModal.tsx`](../../../components/today/AddTaskModal.tsx) lines 174-180 vs. line 234 |
| Mention search is client-side over an in-memory store | `searchMentions` in [`lib/today/repo.ts`](../../../lib/today/repo.ts) line 380, over the injected `TodaySnapshot`; the Client Profile never initialises that store |
| The staff directory feeding it is unscoped | `getAppUsers()` — recorded as a live contradiction in [contradictions](../../known-limitations/contradictions.md) |
| Notifications already have five writers, not one | [`lib/assignment/run.ts`](../../../lib/assignment/run.ts) · [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 133 · [`app/(app)/clients/[id]/owner-actions.ts`](../../../app/%28app%29/clients/%5Bid%5D/owner-actions.ts) line 64 · [`lib/notifications/profile-completeness-sync.ts`](../../../lib/notifications/profile-completeness-sync.ts) · [`lib/notifications/project-deadline-sync.ts`](../../../lib/notifications/project-deadline-sync.ts) |
| A notification can only point at a client | `notifications` has `client_id` and no other target — [`lib/db/schema.ts`](../../../lib/db/schema.ts) line 362 |
| There is no full notification list | The bell renders `initialItems.slice(0, 12)` and "View all" links to `/inbox`, which is the AI **Action list** — a different object ([`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx) lines 118, 142; [`app/(app)/inbox/page.tsx`](../../../app/%28app%29/inbox/page.tsx)) |

**Three live defects this specification must fix on the way past, because they will
otherwise defeat it.**

1. `createTaskAction` already writes a notification of type `task_assigned`
   ([`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 136).
   That type is **absent from the `NotificationType` union**
   ([`lib/types.ts`](../../../lib/types.ts) line 483), **absent from the schema comment**
   ([`lib/db/schema.ts`](../../../lib/db/schema.ts) line 365), and **absent from `TYPE_DOT`**
   ([`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx) line 12).
   `getNotificationsForUserDb` casts the column straight to the union, so the value flows
   through untyped.
2. Because a notification carries no task target, a `task_assigned` notification on a task
   with **no account** falls to `router.refresh()` — a click that does nothing
   ([`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx) line 60).
3. `updateTaskAction` can reassign a task to someone else and **notifies nobody**, while
   `createTaskAction` doing the same thing does. Same act, two behaviours.

**Consequence.** Coordination happens outside the account record, so the record does not
hold why a task moved, what the customer said, or who was waiting on whom. For an
operating system whose stated purpose is *understanding → prioritisation → coordinated
action*, the coordination step is currently missing from the object where work lives.

**Evidence.** Repository inspection only. There is no usage data — Signal has no analytics
transport ([`lib/today/analytics.ts`](../../../lib/today/analytics.ts) `track()` is a dev
console breadcrumb).

**Assumptions.** That tasks are genuinely shared work rather than private to-do lists. The
sidebar's cross-owner listing and the admin-only reassignment rule both say they are, but
nobody has measured how often a second person actually looks at a task they do not own.

## 3. Product outcome

Anyone who can see an account can read what has been said about a task on it, add to it,
and name a colleague in a way that reliably reaches that colleague — without leaving Signal
and without anyone gaining access they were not granted.

## 4. Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround | Desired result |
|---|---|---|---|---|---|
| CSM (Operator) | Owns the task | Record what happened; ask a named colleague for something | Do I have what I need to finish this? | Slack; nothing lands on the record | The exchange is on the task, and the person answered |
| CSM (Operator) | Sees a teammate's task on their account | Add context they alone have | Should I flag something? | Nothing; the row is inert | Posts an update; the owner is notified |
| Implementation / Support | Named on delivery work | Answer without owning the task | What is being asked of me? | Verbal | The mention reaches them; they reply in place |
| CS Manager / Admin | Reassigning work | Make sure the new owner knows | Did they see it? | Tells them separately | Reassignment notifies, like creation already does |
| Guest | Read-only tier | Understand account activity | — | — | Reads the thread; can post nothing |

## 5. Recommendation

Build **one update stream per task**, stored in one new entity, ordered oldest-first,
readable by exactly whoever can already read the task, writable by anyone who can write to
the account. Mentions inside an update are **people only**, stored as structured rows keyed
on email, resolved for display and never stored by name. Two notification triggers in the
foundation — *you were mentioned* and *there is an update on a task you own* — plus the
reassignment notification that is currently missing. In-app only.

**Why this and not the alternatives.**

*Why not extend `notes`?* `notes` is a mutable description a single writer owns. A thread is
append-only and multi-author. Putting both in one column means an edit silently rewrites
what someone else said, and there is no way to know who wrote which sentence or when.

*Why not reuse `timeline_events`?* That entity is per-client
([`lib/db/schema.ts`](../../../lib/db/schema.ts) line 85) and already serves a different
job — account history. Hanging task conversation off it produces the coherence failure
"another timeline" and makes every account timeline noisy with task chatter.

*Why not reuse `client_notes`?* Also account-scoped, and it is a TipTap/HTML document with
its own sanitisation boundary ([`lib/notes/sanitize.ts`](../../../lib/notes/sanitize.ts)).
A task update is a sentence, not a document.

*Why people-only mentions?* Because the other two types have no downstream action. Account
mentions duplicate `today_tasks.account_id`; page mentions point at an entity that is
`[]` in production. Adding either would be a field nobody maintains.

*Why not grant visibility on mention?* Because it hands every operator the ability to widen
another user's account access from inside a textarea, invisible to the admin who set
`app_users.scope`. Decision [0004](../../decisions/0004-four-flat-permission-tiers-with-server-side-write-gates.md)
puts the gate on the server for exactly this reason.

**What would change this recommendation.** If task updates turn out to be predominantly
between people who cannot both see the account — a delivery engineer with no account grant,
say — then a scoped-picker-only design fails, and the answer is per-task participants with
an explicit, audited grant. That is a bigger feature and should not be assumed now.

## 6. Scope

### Foundation — Step 1

The smallest coherent version: a task can be discussed and a mention arrives.

1. `task_updates` and `task_update_mentions` entities (§11).
2. A per-task expansion in the account Tasks sidebar showing notes and the update thread.
3. Posting an update, with a `@` picker offering **people who can see this account**.
4. Editing and deleting your own update; admin delete of any update.
5. Notification on being mentioned; notification on an update to a task you own.
6. Notification on reassignment (closes the `updateTaskAction` gap).
7. `notifications` gains a generic target (`entity_type`, `entity_id`) so a task
   notification can deep-link to the task.
8. `task_assigned` added to the `NotificationType` union, the schema comment and the bell's
   dot map. The schema comment on `today_tasks.notes` corrected — mentions live on updates,
   not on notes.
9. The sidebar gains a **completed tasks** disclosure, because it currently filters
   `status !== "done"` and a completed task would take its whole thread out of view.

### Later — Step 2 (notification surface)

10. A real notification list. The bell shows 12 and its "View all" goes to the Action list,
    a different object; notification 13 is currently unreachable.
11. Notification preferences (per-type mute).
12. Subscription/follow: *an update on a task you were mentioned in but do not own*.

### Later — Step 3 (activity in the stream)

13. Task activity rows — status change, reassignment, due-date change — written into
    `task_updates` under the reserved `kind` values. Additive by design (§11).

### Later — unsequenced

14. Mentions inside `today_tasks.notes`, once the edit/re-notify rule below is settled.
15. Converging [`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx)
    and the sidebar expansion onto one task-detail component.

### Non-goals

- **Email delivery.** There is no mail provider in the repository — no `nodemailer`,
  `resend`, `sendgrid` or equivalent, and no sending module. Specifying email would specify
  infrastructure that does not exist. See §21.
- **Overdue-task notifications.** Overdue is already surfaced in three places: the sidebar
  trigger badge in [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx),
  the Today board, and `WorkCounts`. A recurring "you have overdue tasks" notification adds
  no information and is the fastest route to a bell nobody reads. **Recommend not building
  it at all**, not deferring it.
- **Account and page mentions.** §5.
- **Reactions, attachments on updates, threaded replies to an update, rich text, @-here /
  @-channel.**
- **Mentions granting access.** §5.
- **Real-time delivery.** Notifications appear on the next server render, as today.

## 7. Information architecture

No new page, no new tab. The Client Profile already has ten tabs.

**Account Tasks sidebar** — [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx),
the drawer opened from the profile's action row.

- A task row becomes **expandable in place** (disclosure triangle / click on the row body;
  the complete-checkbox keeps its own hit area). Expanded, it reveals, in order: notes ·
  update thread, oldest first · composer.
- One task expanded at a time. Expansion state is not persisted.
- **Not a second drawer.** A drawer inside a drawer is a dead end on a narrow viewport, and
  the sidebar is already `w-full` below `sm`.
- Below the open list: a collapsed **"Completed (n)"** disclosure.

**Today board** — the same thread is added to the body of
[`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx), below
Details. One task, one thread, two views — the same relationship `today_tasks` already has
with these two surfaces.

**Notification bell** — [`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx).
Unchanged in shape; the click target learns to route on the new entity fields.

## 8. End-to-end flows

**Flow A — post an update mentioning someone.**
Trigger: user expands a task in the sidebar. Precondition: they may write to the account.
They type in the composer, press `@`, the picker queries the server for permitted people,
they choose one, submit. System writes one `task_updates` row and one
`task_update_mentions` row per distinct mentioned person, then writes notifications per
§16. Result: the update appears at the bottom of the thread attributed to them, mentions
rendered as chips. Failure: the write fails → the composer keeps its text and shows the
error inline; nothing is notified.

**Flow B — receive a mention.**
Trigger: the notification write in Flow A. The recipient's bell shows an unread count on
their next page load. Opening the item navigates to the account profile with the tasks
sidebar open and that task expanded, and marks the notification read. Failure: they have
since lost access to the account → the profile returns the standard
*"Not found, or you don't have access to this account."* from
[`lib/auth.ts`](../../../lib/auth.ts) line 215, and the notification is marked read.

**Flow C — update on a task you own.**
Trigger: someone else posts on your task. If you already have an **unread** update
notification for that task, it is refreshed in place — its body becomes the newest update
and its timestamp moves — rather than a second row appearing. If you were also mentioned,
you get the mention notification only.

**Flow D — reassign.**
Trigger: an admin changes the assignee in the task drawer. The new owner is notified, the
same way `createTaskAction` already notifies. The previous owner is **not** notified in the
foundation — see §21.

**Flow E — edit or delete your own update.**
Editing rewrites the body and stamps `edited_at`; the thread shows "edited". Deleting is
soft: the row stays, the body is cleared and `deleted_at` set, and it renders as
*"Update removed"*. Re-notification rules in `BR-007`.

**Flow F — read as a Guest.**
The thread renders. The composer does not. No edit or delete controls.

## 9. Functional requirements

| ID | Requirement | Observable behaviour |
|---|---|---|
| `FR-001` | A task row in the account Tasks sidebar expands in place | Clicking the row body reveals notes, thread and composer; clicking again collapses it |
| `FR-002` | The thread lists updates oldest first | Two updates posted in order appear in that order, top to bottom |
| `FR-003` | Each update shows author display name, relative time, and body | An update by a person not in `app_users` shows their email |
| `FR-004` | The composer accepts an update of 1–4000 characters | Empty or whitespace-only submit is refused with an inline message; over-length is refused before the write |
| `FR-005` | Typing `@` opens a people picker | The picker lists only people permitted per `BR-002`; keyboard up/down/enter/escape work as in the existing `MentionInput` |
| `FR-006` | A chosen mention is stored as a reference, not a name | Renaming the person in Settings changes how existing updates render; nothing is rewritten in storage |
| `FR-007` | An unresolvable mention renders as the stored email | A mentioned person removed from `app_users` still renders, never as blank or `@unknown` |
| `FR-008` | The author may edit their own update | The body changes; "edited" appears; `created_at` does not move |
| `FR-009` | The author may delete their own update; an admin with unrestricted scope may delete any | The row renders "Update removed"; the count of visible updates decreases |
| `FR-010` | Nobody may edit an update they did not write | The server refuses; no control is offered |
| `FR-011` | A Guest sees the thread and no composer | Read-only in every task, on every account |
| `FR-012` | The sidebar discloses completed tasks | A completed task and its thread remain reachable |
| `FR-013` | The task's update count is visible without expanding | Each row shows a count when > 0 |
| `FR-014` | The same thread appears in the Today board task drawer | An update posted from the profile is visible there, and the reverse |
| `FR-015` | A notification can target a task | The bell routes a task notification to the task, not merely to the account |
| `FR-016` | Reassigning a task notifies the new owner | Changing the assignee produces one `task_assigned` notification |
| `FR-017` | `task_assigned` is a declared notification type | It appears in the type union, the schema comment and the bell's dot map |
| `FR-018` | Deleting a task removes its updates, mentions and outstanding notifications | No notification survives pointing at a deleted task |

## 10. Business rules

| ID | Rule | Inputs | Exceptions | Enforced where |
|---|---|---|---|---|
| `BR-001` | **Reading an update requires exactly the access that reading its task requires.** For an account-linked task: `canSeeClient` on the account. For a task with no account: you own it. | task, viewer | none | Server. Same predicate as `getTodayTasksVisibleDb` |
| `BR-002` | **The mention picker offers only people who can see this account.** Union of: users with scope `all`; the account's owners; users with a grant for it. For a task with no account, the staff directory. | account, `app_users`, `user_account_grants` | none | Server action; never a client-side filter |
| `BR-003` | **A mention grants nothing.** Being mentioned adds no read or write access to the task or the account. | — | none | By construction — no code path reads mentions for authorisation |
| `BR-004` | **Posting requires write access to the account.** Reuse `denyClientWrite`; for an account-less task, ownership. Guests are refused by `denyTaskWrite`. | viewer role, scope | none | Server, in the new action, before any write |
| `BR-005` | **Only the author may edit an update.** | author email, viewer | none | Server, owner-scoped update |
| `BR-006` | **Deletion is soft, and it is the author's, or an admin's with unrestricted scope.** Mirrors `mayEditAnyTask` in [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 60. | author, role, scope | none | Server |
| `BR-007` | **Editing does not re-notify. A mention added by an edit notifies that person once. A mention removed by an edit does not un-notify.** | previous mention set, new mention set | none | Server, on the edit path |
| `BR-008` | **Never notify the actor for their own action.** | actor, recipient | none | Server, at the notification write |
| `BR-009` | **A mention beats ownership.** A recipient who is both mentioned and the task owner receives one notification, the mention. | recipient set | none | Server |
| `BR-010` | **At most one unread "update on your task" notification per task per recipient.** Refreshed in place using a deterministic id, via `upsertOpenNotificationsDb`. Mentions never coalesce. | task, recipient, read state | mention notifications | Server |
| `BR-011` | **An update is immutable in authorship and time.** Author and `created_at` never change. | — | none | Server; not exposed in any patch |
| `BR-012` | **Mentions are stored by email, never by display name.** | — | none | Data model |
| `BR-013` | **History is not rewritten when access changes.** Losing access to an account never deletes or edits an existing update or mention row. | — | none | By construction |

`BR-001`–`BR-004` belong in `docs/business-rules/permissions-and-scoping.md` once implemented.

## 11. Data requirements

**New entity — `task_updates`.** One row per posted update.

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|
| `id` | `tup-{uuid}` | text PK | yes | generated | server | nobody | — | mention + notification targets |
| `task_id` | `today_tasks.id` | text | yes | — | server | nobody | task must exist and be writable at post time | thread read; cascade on task delete |
| `kind` | `comment` in v1; `status_changed`, `reassigned`, `due_date_changed` **reserved** for Step 3 | text | yes | `comment` | server | nobody | v1 accepts only `comment` | one stream, two row types later |
| `author_email` | lower-cased login email | text | yes | — | session | nobody | — | attribution; `BR-005` |
| `body` | update text, with mention tokens (below) | text | yes for `comment` | — | user | author | 1–4000 chars after trim | display |
| `created_at` | when posted | timestamptz | yes | now | server | nobody | — | ordering |
| `edited_at` | last edit, null if never | timestamptz | no | null | server | server | — | "edited" marker |
| `deleted_at` | soft delete | timestamptz | no | null | server | server | — | renders "Update removed" |

Index on `(task_id, created_at)`.

**New entity — `task_update_mentions`.** One row per distinct person mentioned in an update.

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|
| `id` | `tum-{uuid}` | text PK | yes | generated | server | nobody | — | — |
| `update_id` | `task_updates.id` | text | yes | — | server | nobody | — | render |
| `task_id` | denormalised `today_tasks.id` | text | yes | — | server | nobody | must match the update's task | "tasks I am mentioned in" without a join |
| `mentioned_email` | lower-cased email | text | yes | — | picker | nobody | must have been offered by `BR-002` at post time | notification recipient |
| `created_at` | | timestamptz | yes | now | server | nobody | — | — |

Unique on `(update_id, mentioned_email)`. Index on `(mentioned_email, created_at)`.

**Body format.** Plain text containing the stable token `@[<email>]` at each mention
position. The renderer resolves each token against `app_users` and draws the existing
`EntityMention` chip; an unresolvable token renders the raw email (`FR-007`). Not HTML —
HTML would drag in the sanitisation boundary and `dangerouslySetInnerHTML` for what is a
sentence. Not character offsets — those break on edit. `task_update_mentions` remains the
authoritative index for notification and querying; the token exists only for rendering.
This preserves the principle already stated in
[`components/today/mentions.tsx`](../../../components/today/mentions.tsx): *IDs are always
preserved; names are display-only.*

**Changed entity — `notifications`** ([`lib/db/schema.ts`](../../../lib/db/schema.ts) line 362).

| Field | Meaning | Type | Required | Default | Notes |
|---|---|---|---|---|---|
| `entity_type` | `task` \| `client` \| null | text | no | null | Generic target. Existing rows stay null and keep routing on `client_id` |
| `entity_id` | id of that entity | text | no | null | Nullable so nothing needs backfilling |

`NotificationType` gains `task_assigned` (already written, undeclared), `task_mentioned`,
`task_update`. The schema comment listing four types is corrected to list all of them.

**Changed comment — `today_tasks.notes`.** *"optional description, supports @mentions"* is
false and becomes *"optional plain-text description. Mentions live on task_updates, not
here."*

**Who maintains this, and will they?** Nobody maintains an update — it is written once and
read. That is the point: this specification adds no field anyone must keep current, which
is why it does not add "participants", "watchers" or a per-task status beyond what exists.

## 12. States and transitions

**An update.**

| State | Meaning | Entry | Exit | Allowed actors | Side effects |
|---|---|---|---|---|---|
| Posted | Visible in the thread | Successful write | Edited or deleted | Author | Notifications per §16 |
| Edited | Body changed | Author saves an edit | Deleted | Author | Notifies only newly-added mentions (`BR-007`) |
| Removed | Renders "Update removed" | `deleted_at` set | terminal | Author; admin with unrestricted scope | Outstanding unread notifications for it are resolved |
| Purged | Row gone | Its task is deleted | terminal | Anyone permitted to delete the task | Mentions and notifications for the task go too (`FR-018`) |

The task's own `open`/`done` states are unchanged. **An update may be posted on a completed
task** — closing work often produces the last useful sentence about it.

## 13. Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|
| Read the thread on a task they can see | yes | yes | yes | yes |
| Post an update | yes | yes | in scope | **no** |
| Mention a person | yes | yes | in scope | no |
| Edit own update | yes | yes | yes | n/a |
| Delete own update | yes | yes | yes | n/a |
| Delete anyone's update | yes | only with scope `all` | no | no |
| Be mentioned | yes | yes | yes | yes |
| Receive notifications | yes | yes | yes | yes |

**Server-side gates.**

- Read: the task must be in the set `getTodayTasksVisibleDb` returns for the caller
  ([`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) line 1716), which the profile page
  reaches only after `canSeeClient` has admitted the account.
- Write: `denyTaskWrite` then `denyClientWrite(task.accountId)` —
  [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) lines 17
  and 27, [`lib/auth.ts`](../../../lib/auth.ts) line 210. Guest is refused by the first;
  out-of-scope operators by the second.
- Delete-any: `editsAllClients(role) && scope.mode === "all"`, the existing `mayEditAnyTask`
  predicate ([`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 60).
- Mention picker: a server action applying `BR-002`. It must **not** call the unscoped
  `getAppUsers()` — that read is already recorded as leaking the staff directory to Guests
  in [contradictions](../../known-limitations/contradictions.md), and this feature must not
  add a sixth consumer of it.

**Scope interaction.** `assigned` sees threads on accounts they own. `selected` sees threads
on granted accounts. `all` sees everything. A user whose scope narrows keeps their authored
updates (`BR-013`) and simply stops being able to open them.

## 14. Time behaviour

Every timestamp is `timestamptz`, stored UTC, rendered relative in the thread using the
existing `relativeTime` / `formatDistanceToNow` conventions. Ordering is by `created_at`
ascending, tie-broken by `id`, so two updates written in the same millisecond order
deterministically. No period selection, no comparison period, no forecast — a thread is a
log, not a metric. Task due-date semantics are untouched: `daysUntil` in
[`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx)
already compares date strings so a task due today does not flip overdue on the viewer's
clock, and nothing here changes that.

## 15. Empty, loading and error states

| State | What is shown | Recovery |
|---|---|---|
| Task expanded, no updates | *"No updates yet."* plus the composer, or nothing but the line for a Guest | Post one |
| Thread loading | Skeleton rows in the expanded region only; the task list stays interactive | — |
| Thread failed to load | *"Couldn't load updates."* with a retry; the task row still completes | Retry |
| Post failed | Inline error; the composer keeps its text | Retry |
| Mention picker returns nobody | *"No one else can see this account."* | — |
| Mention search failed | Picker closes; the `@` stays as literal text; posting still works | Retry |
| Notification write failed after a successful post | The update stands; the failure is logged, never surfaced as a failed post — the pattern `createTaskAction` already uses ([`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) line 143) | — |
| Mentioned person later unresolvable | Renders the email | — |
| Notification points at a deleted task | Cannot occur — `FR-018` | — |
| Notification points at an account the recipient lost | Standard not-found from [`lib/auth.ts`](../../../lib/auth.ts) line 215; still marked read | — |

## 16. Notifications and automations

| Trigger | Recipient | Channel | Timing | Deduplication | User control | Audit record |
|---|---|---|---|---|---|---|
| You are mentioned in an update | each mentioned person except the author | in-app bell | immediate | one per (update, person) — the unique index | none in Step 1 | the `task_update_mentions` row |
| An update posted on a task you own | task owner, unless author or already mentioned (`BR-008`, `BR-009`) | in-app bell | immediate | one **unread** per (task, recipient); refreshed in place, `BR-010` | none in Step 1 | the `task_updates` row |
| A task is assigned or reassigned to you | new owner, unless self | in-app bell | immediate | one per assignment event | none | the task row |

Deterministic ids make `BR-010` free using the existing insert-or-refresh helper: the
update notification uses an id derived from task and recipient so a second write refreshes
the first; the mention notification uses an id derived from the update and recipient so
every mention survives.

**Explicitly not automated.** Nothing here changes a commercial outcome, a financial value,
ownership, a canonical definition, or another person's commitments. A mention creates no
task and no commitment for the mentioned person — §4.6 of the operating principles: a
signal is not a commitment. If someone must do something, assign them the task.

**Not built:** overdue-task notifications (§6, with reasoning), digests, email.

## 17. Analytics

**Signal has no product analytics transport.** `track()` in
[`lib/today/analytics.ts`](../../../lib/today/analytics.ts) writes a dev-mode console
breadcrumb and nothing else, so the three existing mention events —
`account_mention_selected`, `user_mention_selected`, `page_mention_selected` — record
nothing anywhere. **Do not specify events that cannot be emitted.**

Two events belong in the typed union so they are ready when a transport exists:
`task_update_posted` (properties: has mentions, mention count, surface) and
`task_mention_selected`. Until then, adoption is measured by direct query:
rows in `task_updates` per week, distinct authors, and share of tasks with at least one
update. That is a manual read, and this specification says so rather than pretending
otherwise.

## 18. Dependencies and impacts

**Pages** — the Client Profile (`/clients/[id]`); the Today board (`/today`); every page,
via the bell in the app shell.

**Components** — [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx)
(expansion, thread, composer, completed disclosure); [`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx)
(thread); [`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx)
(entity routing, `task_assigned` dot); [`components/today/mentions.tsx`](../../../components/today/mentions.tsx)
(a people-only, server-resolved variant of `MentionInput` — the existing component keeps
its current callers unchanged).

**Server actions** — a new module beside
[`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) for post,
edit, delete, list and mention-search; `updateTaskAction` gains the reassignment
notification; `deleteTaskAction` gains the cascade.

**Database** — two new tables; two new nullable columns on `notifications`; new Drizzle
readers and writers.

**Existing records** — none change. Every existing task acquires an empty thread. Every
existing notification keeps `entity_type` null and routes as it does today.

**Documentation** — §"Documenter handoff".

**What this does *not* touch** — health, ARR, renewal, churn, use cases, the priority
ranking. Deliberately: this is coordination on existing work objects, not a new kind of
work object.

## 19. Migration and compatibility

Additive only. Two `CREATE TABLE`s and two nullable `ADD COLUMN`s; no backfill, no
rewrite, no default that changes an existing read. Rollback is dropping the two tables and
ignoring the two columns — the notification bell falls back to `client_id` routing, which
is what it does today.

Records that will never have the new data: every task created before this ships has no
updates, and the empty state is the correct rendering — it is not a gap to fill.

The one **non-additive** change is `today_tasks.notes`'s comment, which is corrected from a
false claim to a true one. That is a comment, not data, and this repository treats module
and schema headers as decision evidence, so leaving it would keep a documented intention
that the code contradicts.

## 20. Acceptance criteria

- [ ] `AC-001` — Given an operator viewing an account they own, when they expand a task in
      the Tasks sidebar, then notes and an update thread appear inline without navigating
      away and without opening a second drawer.
- [ ] `AC-002` — Given an empty thread, when it renders, then it reads "No updates yet" and
      shows a composer to a non-Guest.
- [ ] `AC-003` — Given a Guest on any account, when they expand any task, then the thread
      renders and no composer, edit or delete control is present, and a direct call to the
      post action is refused server-side.
- [ ] `AC-004` — Given two updates posted in sequence, when the thread renders, then the
      earlier appears above the later.
- [ ] `AC-005` — Given a user typing `@` in the composer on an account-linked task, when
      the picker opens, then it lists only people who can see that account, and a person
      with scope `selected` and no grant for it is absent.
- [ ] `AC-006` — Given an update mentioning person B, when it is posted, then B has exactly
      one unread notification whose click opens that account's Tasks sidebar with that task
      expanded.
- [ ] `AC-007` — Given B is mentioned, when B opens the task, then B gains no ability to
      complete, edit or delete it that they did not already have, and no additional account
      access.
- [ ] `AC-008` — Given a task owned by A, when B posts three updates on it in a row without
      A reading any, then A has exactly one unread update notification for that task and it
      reflects the newest update.
- [ ] `AC-009` — Given A owns a task and is also mentioned in an update on it, when the
      update is posted, then A receives exactly one notification, the mention.
- [ ] `AC-010` — Given A posts an update on a task A owns, then A receives no notification.
- [ ] `AC-011` — Given an author edits their own update, when it saves, then the body
      changes, "edited" is shown, `created_at` is unchanged, and nobody is re-notified —
      except a person newly added as a mention by that edit, who is notified once.
- [ ] `AC-012` — Given a user attempts to edit an update they did not write, then the
      server refuses, whatever their role.
- [ ] `AC-013` — Given an admin whose scope is `selected`, when they attempt to delete
      another person's update, then the server refuses; given an admin with scope `all`,
      it succeeds and the row renders "Update removed".
- [ ] `AC-014` — Given a task with updates is deleted, then its updates and mentions are
      removed and no notification remains that points at it.
- [ ] `AC-015` — Given a mentioned person is removed from `app_users`, when the update
      renders, then their email is shown and no update is blank or errored.
- [ ] `AC-016` — Given a task is completed, when the sidebar renders, then the task and its
      thread remain reachable through the completed disclosure.
- [ ] `AC-017` — Given an update posted from the Client Profile, when the same task is
      opened in the Today board task drawer, then the same thread is shown, and the reverse.
- [ ] `AC-018` — Given an admin reassigns a task to another person, then that person
      receives one `task_assigned` notification.
- [ ] `AC-019` — Given a `task_assigned` notification on a task with no linked account,
      when it is clicked, then it navigates to that task rather than doing nothing.
- [ ] `AC-020` — Given the notification write fails after a successful post, then the
      update is still shown and the user sees no error.

## 21. Open decisions

| Decision | Options | Recommendation | Consequence of delaying |
|---|---|---|---|
| **Does a mention grant visibility of a task or account the person cannot otherwise see?** | (a) No — picker is scoped to people who already have access; (b) yes — mentioning grants read access to that one task; (c) yes — grants read access to the account | **(a).** Anything else lets an operator widen another user's access from a textarea, invisible to the admin who set `app_users.scope` | Blocks `BR-002` and the picker's server action. Cannot start Step 1 without it |
| **Is email delivery in scope?** | (a) In-app only; (b) email for mentions only; (c) email for everything | **(a).** There is no mail provider, no template layer and no unsubscribe handling in the repository; (b) is a project of its own, not a line item | Not blocking. Deferring costs nothing; the notification writes are channel-agnostic |
| **Do task activity events and human updates share one stream?** | (a) One table, `kind` discriminator, activity added in Step 3; (b) two tables, two lists; (c) never record activity | **(a).** One thread is what a reader wants; two lists force them to interleave manually. Reserving `kind` now makes Step 3 additive | Low. Reserve the column now; the decision on *which* activity to record can wait |
| **Is the previous owner notified on reassignment?** | (a) No; (b) yes | **(a) for the foundation.** Reassignment is admin-initiated and usually discussed; a "this was taken from you" notification is noise more often than news | Low. Additive later |
| **Should mentions eventually work inside `today_tasks.notes`?** | (a) Updates only; (b) notes too | **(a) now.** Notes are mutable and single-author; a mention there has no moment attached to it, which makes "did this notify?" unanswerable | Low. Item 14 in Later |

## 22. Risks and trade-offs

**The strongest argument against building this at all** is that these people already talk
to each other, in Slack, all day. Signal will not win the conversation; it will win a thin
slice of it — the sentence someone happens to type while looking at the task. If that slice
is thin enough, `task_updates` becomes a table with a few hundred rows and a feature nobody
opens. The honest mitigation is the sequencing: Step 1 is small, and the row count after
four weeks answers the question cheaply. If it is near zero, do not build Steps 2 and 3.

**The scoped picker is a real constraint, not just a safe default.** An implementation
engineer with no account grant genuinely cannot be reached from a task on that account. The
answer today is "grant them the account", which is an admin action. If that turns out to be
the common case rather than the edge case, `BR-002` is wrong and the feature needs explicit
per-task participants with an audited grant. Watch for it.

**Coalescing hides things.** `BR-010` means a busy task produces one notification, so a
recipient who never opens it never learns there were five updates. That is the correct
trade against a bell that gets muted, but it is a trade.

**This adds a second place task information lives.** The sidebar and the Today board task
drawer will both render a thread. They already both render a task, so this is not a new
divergence — but it doubles the surface that must change together, which is why item 15
proposes converging them.

**Notifications remain structurally weak after this.** Step 1 makes the bell correct for
task notifications; it does not give Signal a notification *list*, preferences, or a
delivery channel that reaches anyone not currently looking at the app. If task
notifications matter, Step 2 stops being optional.

---

## Coherence check

| Risk | Verdict |
|---|---|
| Duplicate concept | No. There is no existing comment, update or task-activity concept |
| Duplicate status | No new status. Update states are row lifecycle, not workflow |
| Second source of truth | No. `today_tasks` remains the only task record |
| Conflicting calculation | None introduced |
| Permission bypass | **Actively closed** — `BR-003` exists because a mention is the obvious place one would appear |
| Another action-management system | No. An update is explicitly not a task and creates no commitment (§16) |
| **Another timeline** | **The one genuine risk.** Signal already has `timeline_events` per client and a derived account timeline in [`lib/today/repo.ts`](../../../lib/today/repo.ts). This adds a third, scoped to a single task. Accepted because the scope is different — an account history and a conversation about one task answer different questions — but Step 3 must not start replicating account-level events into task threads |
| Another definition of risk / health / renewal | None |
| Canonical field stored per-client, or the reverse | No |
| A metric with no owner | No metric added |
| **A field users will not maintain** | None. Every field is written once by a human and never needs curating — which is why no "participants" or "watchers" field is proposed |
| Unexplained AI recommendation | No AI |
| An output with no downstream action | This is the reason account and page mentions are excluded |
| A page mixing unrelated jobs | No new page |

## Evidence

Read to establish current behaviour, at commit `7b0fa94`:

[`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) ·
[`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/%5Bid%5D/page.tsx) ·
[`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) ·
[`components/today/TaskDrawer.tsx`](../../../components/today/TaskDrawer.tsx) ·
[`components/today/AddTaskModal.tsx`](../../../components/today/AddTaskModal.tsx) ·
[`components/today/mentions.tsx`](../../../components/today/mentions.tsx) ·
[`lib/today/repo.ts`](../../../lib/today/repo.ts) ·
[`lib/today/types.ts`](../../../lib/today/types.ts) ·
[`lib/today/build.ts`](../../../lib/today/build.ts) ·
[`lib/today/analytics.ts`](../../../lib/today/analytics.ts) ·
[`lib/db/schema.ts`](../../../lib/db/schema.ts) ·
[`lib/types.ts`](../../../lib/types.ts) ·
[`lib/auth.ts`](../../../lib/auth.ts) ·
[`lib/roles.ts`](../../../lib/roles.ts) ·
[`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) ·
[`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx) ·
[`app/(app)/inbox/page.tsx`](../../../app/%28app%29/inbox/page.tsx) ·
[`app/(app)/inbox/actions.ts`](../../../app/%28app%29/inbox/actions.ts) ·
[`lib/notes/sanitize.ts`](../../../lib/notes/sanitize.ts) ·
[`components/clients/notes/RichTextEditor.tsx`](../../../components/clients/notes/RichTextEditor.tsx) ·
[`docs/known-limitations/contradictions.md`](../../known-limitations/contradictions.md) ·
[`docs/PRODUCT_MAP.md`](../../PRODUCT_MAP.md) ·
[`docs/BACKLOG.md`](../../BACKLOG.md)

**Could not verify:** whether anyone other than the owner currently reads a task they do not
own — there is no analytics transport and no server log of task reads. A four-week row count
on `task_updates` after Step 1 settles it. Also unverified: whether the health-engine and
staff-directory contradictions recorded in
[contradictions](../../known-limitations/contradictions.md) have moved since
2026-07-31; this specification depends on the unscoped-`getAppUsers()` finding still being
true, and §13 assumes it is.

## Documenter handoff

Once **implemented** — not before:

- **Feature documents:** `docs/product/client-profile/` (Tasks sidebar gains a thread and a
  completed disclosure) · `docs/product/today/` (task drawer gains a thread) · a new
  notifications document, which [`docs/BACKLOG.md`](../../BACKLOG.md) already lists as **P1
  item 3** — this change is the moment to write it.
- **Business rules:** `docs/business-rules/permissions-and-scoping.md` gains `BR-001`–`BR-004`
  and the statement that a mention grants nothing.
- **Data model:** `docs/data-model/README.md` gains `task_updates` and
  `task_update_mentions`, and the changed `notifications` shape.
- **Glossary:** add **task update** (an append-only, attributed comment on a task —
  distinct from a **note**, which is a mutable account document) and **mention** (a stored
  reference to a person, which confers no access).
- **Decision records to write:** *"A mention is a reference, not a grant"* — this is a
  permission rule that will be re-litigated every time someone asks why they cannot mention
  a colleague, and it should exist as a numbered decision alongside
  [0004](../../decisions/0004-four-flat-permission-tiers-with-server-side-write-gates.md).
- **Changelog:** a release note covering the thread, the mention picker's scoping, and the
  three notification triggers.
- **Corrections that are not new documentation:** the `notifications` type list in
  [`lib/db/schema.ts`](../../../lib/db/schema.ts) and the `today_tasks.notes` comment are
  both wrong **today**. Correcting them is part of implementing this, not part of
  documenting it.
- **Must not be documented until it ships:** all of the above. In particular, nothing in
  `docs/product/` may state that mentions work on tasks, because today they are captured
  and discarded.
