# Account Tasks

**Status:** Partially verified

Part of the [Client Profile](README.md), above the tabs.

## Summary

A **Tasks** button on the client profile that opens a sidebar listing the account's tasks —
open ones first, missed ones at the top, completed ones behind a disclosure. From it a user
can add a task, mark one done or reopen it, edit it in place, move its due date on by a
week, and read or post updates on it. Every due-date move, completion, reopening and
hand-off is written into the task's update thread as a line of history that nobody can
remove. The rows are `today_tasks`: the same records the Today board reads.

## Purpose

Lets a CSM put work against an account without leaving the account, and keep that work
honest once it exists. A task that slipped can be re-dated or corrected in place, instead
of being left overdue or marked done when it was not — both of which misreport the Today
board. Before 2026-09-13 an existing task could only be marked done or discussed, and
closing and recreating it lost its update thread
([`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx)
module header). Because moving a date became one click, the thread also records the move:
without that, a task pushed three times looks exactly like one that was always due on its
current date ([`lib/task-activity.ts`](../../../lib/task-activity.ts) module header).

## Intended users

- **CSM (operator)** — adds and maintains tasks on accounts in their scope; changes their
  own tasks.
- **Admin / Super Admin** — additionally assign tasks to other people, and, with an
  unrestricted scope, change anyone's task.
- **Guest** — reads the list; no controls. **Does not see threads or task history** — the
  thread read is gated like a write and returns nothing to a Guest (see Permissions).
  Corrected 2026-09-13; this line previously said Guests read the threads.

## Entry points

- **Route:** `/clients/[id]`
- **Navigation path:** Sidebar → Clients → account row → **Tasks** button (above the tabs)
- **Links in from:** a notification whose target is a task on this account links to
  `/clients/[id]?task=<id>`; the sidebar opens on that task's thread, but only if the id is
  in this account's list ([`lib/notifications/link.ts`](../../../lib/notifications/link.ts)).
- **Contextual actions:** the sidebar's **Open Today board** link goes to `/today`.

## Information architecture

1. **Closed trigger** — "Tasks", a pill reading **"N open"**, and, when any open task is
   overdue, a separate **"M overdue"** count in red.
2. **Sidebar header** — explanation that these are the Today board's rows, **Add task**
   (write access only), close.
3. **Add form** — shown after Add task.
4. **Error line** — outside the forms, so a refused done, push or edit is always visible.
5. **Open tasks** — sorted overdue → due today → due within 7 days → later → undated. Each
   row: priority dot (non-normal only), title, notes, focus-area pill, due label, **Push a
   week** / **Due in a week**, owner email, edit (pencil), updates (speech bubble). The
   done checkbox sits left of the title.
6. **"N completed"** disclosure — title struck through, **Reopen** (only on tasks the viewer
   may change, since 2026-09-13), and the updates button.

## Primary workflows

### Add a task
1. **Trigger** — Add task.
2. **Preconditions** — the viewer can write this account (`canEdit`, see Permissions).
3. **User actions** — task title, focus area (or Custom… with a name), due date, priority,
   assignee (Admin / Super Admin only), notes.
4. **System behaviour** — `createTaskAction` with `accountId` set to this account. Unchanged
   by the 2026-09-13 change; see
   [permissions R6a](../../business-rules/permissions-and-scoping.md#r6a--assigning-a-task-to-someone-else-is-admin-only-and-refused-rather-than-downgraded).
5. **Result** — the task is appended to the list and appears on the Today board.
6. **Failure** — an empty title or focus-area name is refused in the form; a server refusal
   is shown in the error line.

### Edit a task — `Partially verified`
1. **Trigger** — the pencil on an open task row.
2. **Preconditions** — the row offers controls (see *Who sees the controls*). One task is
   edited at a time; opening Edit closes any open thread.
3. **User actions** — the same fields as Add (shared `TaskFields` component). A focus area
   outside the preset list opens as Custom with its name filled in. For an Admin editing a
   teammate's task, the assignee picker opens on the current owner, even when that owner
   is not in the assignable list, so opening Edit does not propose a reassignment.
4. **System behaviour** — only fields that differ from the stored task are sent to
   `updateTaskAction`. If nothing changed, the form closes with no request. Sending only
   the changes means renaming an overdue task does not re-submit its past due date, which
   the server would refuse.
5. **Result** — the row updates in place. A changed due date or owner is also recorded in
   the task's thread (see *Task history*); a changed title, notes, priority or focus area is
   not.
6. **Failure** — the form stays open and the server's message is shown: *"That due date is
   in the past."*, *"Only an admin can reassign a task to someone else."*, the account write
   gate's message (*"You don't have permission to edit this account."* or *"Not found, or
   you don't have access to this account."*), or *"That task isn't on your board. Ask its
   owner, or an admin, to change it."* when the owner-scoped write matched nothing.

### Push a week — `Verified` (date arithmetic) / `Partially verified` (write)
1. **Trigger** — **Push a week** on a dated task, **Due in a week** on an undated one. The
   button's tooltip names the date it will move to.
2. **System behaviour** — computes the new date with `pushedAWeek` and sends only
   `dueDate` to `updateTaskAction`. The row moves optimistically and reverts on refusal.
3. **Rule** — a week from the **later** of the current due date and today. A task due in the
   future moves a week past its own date; an overdue, due-today or undated task lands a
   week from today. Pinned by
   [`lib/task-due.test.ts`](../../../lib/task-due.test.ts).
4. **Failure** — the date reverts and *"Couldn't move the date."* or the server message is
   shown.
5. **History** — each push that lands on a different calendar day writes one
   *"moved the due date from … to …"* line into the thread.

### Mark done
Checkbox on a row that offers controls → `toggleTaskAction(id, "done")`, optimistic, reverted
with the server message on refusal. The task moves to the completed disclosure and the
thread gains *"marked this done"*. There is no edit or push on a completed task in this
sidebar.

### Reopen a completed task — `Partially verified`
1. **Trigger** — **Reopen** on a task in the completed disclosure (since 2026-09-13).
   Before this, a completed task could be reopened only from the Today board.
2. **Preconditions** — the same `mayChange` rule as done, edit and push (see *Who sees the
   controls*).
3. **System behaviour** — `toggleTaskAction(id, "open")`. The task moves back to the open
   list optimistically; the thread gains *"reopened this"*.
4. **Failure** — the task returns to the completed disclosure and *"Couldn't reopen the
   task."* or the server message is shown.

### Read and post updates
The speech-bubble button expands the task's thread (`TaskUpdates`), one at a time. Available
on open and completed tasks. Reading needs the same permission as posting — see
Permissions — so a Guest sees *"No updates yet…"* rather than the thread. Comments are not
described further here; task updates have no feature document yet.

### Task history — `Verified` (derivation, wording) / `Partially verified` (writes, rendering)
Added 2026-09-13; Step 3 of the
[task updates spec](../../specs/tasks/task-updates-mentions-and-notifications.md).

1. **Trigger** — any successful change to a task's **due date**, **owner** or **status**
   through `updateTaskAction` or `toggleTaskAction`. The trigger is the write, not the
   surface: edit, Push a week, done and Reopen here, and the same actions from the Today
   board (its task drawer and its completion checkboxes), all record history.
2. **System behaviour** — the repository write (`updateTodayTaskDb`,
   `setTodayTaskStatusDb` in `lib/repo/drizzle.ts`) runs in one database transaction: it
   reads the task row with a row lock (`SELECT … FOR UPDATE`), applies the change, and
   inserts one `task_updates` row per changed field in the **same transaction**. Either
   the change and its history both land, or neither does. The lock means two
   simultaneous pushes each record the date they actually moved from.
3. **What is recorded** — exactly three kinds (`activityFor` in
   [`lib/task-activity.ts`](../../../lib/task-activity.ts)):

   | `kind` | Written when | Stored `from` / `to` |
   |---|---|---|
   | `due_date_changed` | the due date's **calendar day** changes (set, moved or cleared) | `YYYY-MM-DD` or null |
   | `reassigned` | the owner changes, compared **case-insensitively** | lower-cased emails |
   | `status_changed` | status changes (`open` ↔ `done`) | the status values |

   One edit can write several rows (for example a new date and a new owner). The author
   is the signed-in user who made the change. The body is JSON `{from, to}`, not prose:
   names are resolved when the thread is read, so renaming a person never rewrites
   history.
4. **What is not recorded** — changes to **title, notes, priority or focus area**, a
   change of linked account, task **creation**, and task **deletion**. Per the module
   header these describe the work rather than whether it is on track. Setting a field to
   the value it already has writes nothing: re-saving the same day at a different time,
   the same owner in different letter case, or completing an already-completed task.
5. **How it reads** — a one-line entry among the comments, in time order, with a history
   icon: *"{name} moved the due date from 4 Sep to 20 Sep"*, *"set the due date to 20
   Sep"*, *"removed the due date (was 4 Sep)"*, *"marked this done"*, *"reopened this"*,
   *"handed this from {name} to {name}"*. Dates are formatted from the stored day string,
   so no time zone can shift them. A name falls back to the email when the person is not
   in the account's visible audience. A row whose body cannot be decoded reads *"changed
   this task"*.
6. **Removal** — none. History lines have no remove control, and
   `deleteTaskUpdateDb` refuses any non-comment row for everyone, admins included
   (*"You can only remove your own updates, and task history can't be removed."*).
7. **Side effects** — history rows send **no notifications** and carry no mentions.

## Fields and data

| Label | Meaning | Type | Required | Default | Editable by | Validation (server) | Downstream effects |
|---|---|---|---|---|---|---|---|
| Task | Title | text | yes | — | row with controls | trimmed, non-empty | Today board title |
| Focus area | Board lane / category | text | yes | Reminder | row with controls | trimmed, non-empty, cut to 60 chars | Today board lane |
| When | Due date | date (stored as `timestamptz` at UTC midnight) | no | none | row with controls | `YYYY-MM-DD`; refused if before **yesterday in UTC** | overdue count, sort order, Today board |
| Priority | Urgent / High / Normal / Low | enum | no | Normal | row with controls | an unknown value is ignored, not refused | priority dot |
| Assignee | Owner | email | — | the creator | Admin / Super Admin only | a different owner requires `editsAllClients(role)` | which board the task is on; notification (below) |
| Notes | Free text | text | no | none | row with controls | trimmed, cut to 2,000 chars; blank clears | shown under the title |

## States and statuses

| State | Meaning | Entered by | Exited by | Who can change it |
|---|---|---|---|---|
| Open | Work outstanding | creation, Reopen | Mark done | row with controls |
| Done | Completed | Mark done | Reopen (since 2026-09-13) | row with controls |

Every transition between the two writes a `status_changed` history row.

Due labels on open tasks (`daysUntil` against `today`): **Overdue by N days** (due strictly
before today) · **Due today** · **Due tomorrow** · **Due in N days** (2–7) · a short calendar
date (8+ days, formatted in UTC since 2026-09-13) · **No date**.

## Business rules

- **Overdue means due strictly before today.** A task due today is not overdue. Compared as
  whole calendar days from date strings, so the time of day never tips a task into overdue
  (`isOverdue`, `daysUntil` in [`lib/task-due.ts`](../../../lib/task-due.ts), tested).
  **"Today" is the server's UTC date at render** (`app/(app)/clients/[id]/page.tsx`, prop
  `today`), not the viewer's local date.
- **The trigger counts open and overdue separately.** "N open" is every open task; "M
  overdue" is the subset with `isOverdue`. Interface rule.
- **Push a week** — see the workflow above. Tested.
- **Edit sends only what changed.** Interface rule (`saveEdit`).
- **Reassigning to yourself is written.** Server rule, see
  [permissions R6a](../../business-rules/permissions-and-scoping.md#r6a--assigning-a-task-to-someone-else-is-admin-only-and-refused-rather-than-downgraded).
- **A change to due date, owner or status leaves a history row; nothing else does.** Only
  a real change counts — same calendar day, same owner ignoring case, same status write
  nothing. The derivation is tested (`lib/task-activity.test.ts`, 9 tests); that the
  writers call it is read, not tested.
- **History is written with the change or not at all.** Same transaction, row locked.
  Server rule, not tested.
- **History cannot be removed by anyone.** Server rule (`deleteTaskUpdateDb`), not tested.

## Permissions

- **View:** anyone who can open the profile. The list is every task linked to the account,
  whoever owns it (`getTodayTasksVisibleDb` filtered to the account).
- **Create:** `createTaskAction` — refused for Guests (`denyTaskWrite`) and for anyone who
  cannot write the account (`denyClientWrite`).
- **Change (done, reopen, edit, push) and delete:** the server gate is in
  [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts), applied
  in order:
  1. `denyTaskWrite` — no Guests.
  2. `denyExistingTask` (since 2026-09-13) — `denyClientWrite` on the account the task is
     **currently** linked to, so the caller must be able to write that account. A task
     with no account skips this step. Applies to `toggleTaskAction`, `updateTaskAction`
     and `deleteTaskAction`, whichever surface calls them.
  3. For `updateTaskAction` only: `denyTaskTarget` on a **new** account link, if one is
     being set.
  4. An **owner-scoped** write (`todayTaskScope` in `lib/repo/drizzle.ts`) that matches
     only the caller's own task unless `mayEditAnyTask()` (role `editsAllClients` **and**
     scope mode `all`). A zero-row write returns the "isn't on your board" refusal.

  Before 2026-09-13 step 2 did not exist: someone whose scope was narrowed off an account
  could keep completing, pushing, editing and deleting their own old tasks on it, although
  posting an update on the same task was already refused.
- **Reassign:** to someone else requires `editsAllClients(role)`; an Admin with a
  narrowed scope can hand off their **own** tasks only, because the owner-scoped write
  still applies.
- **Read the thread (including history):** `getTaskUpdatesAction` applies the same gate
  as posting (`loadWritableTask` in `app/(app)/today/task-update-actions.ts`) — no Guests,
  and write access to the task's account (or, for a task with no account, its owner or an
  unrestricted admin). A caller who fails it gets an empty thread, not an error.
- **Remove a thread entry:** a comment by its author, or any comment by an unrestricted
  admin. A history entry by nobody.
- **Who sees the controls (interface).** Done, reopen, edit and push appear on a row only when
  `canEdit` (the page's `canEditClient` result) **and** either the viewer owns the task or
  `canEditAnyTask` — which the page computes with the same predicate as `mayEditAnyTask`.
  Before 2026-09-13 the done checkbox appeared on every row for anyone with `canEdit`, and
  a teammate's task was refused after the click. The assignee picker is shown when
  `canAssignOthers` (`editsAllClients(role)`).
- **Interface and server now agree.** Until 2026-09-13 the interface was stricter than
  the server: the sidebar required `canEdit` on the account, while the actions re-checked
  the account only when the account link was changing. Step 2 above closed that gap.

## Automations and side effects

- **Reassignment notifies both owners** (both since 2026-09-13). When `updateTaskAction` actually changes the owner (compared
  against the stored owner, lower-cased), it writes up to two notifications in one insert,
  each with the task title as body, the task's account, and a task target
  (`entityType: "task"`, `entityId`):
  - to the **new owner**, unless they are the actor: `task_assigned`, *"Task handed to you
    by {actor email}"*;
  - to the **previous owner**, unless they are the actor: `task_update`, *"{actor email}
    handed your task to {new owner email}"*.

  Re-saving the same owner notifies nobody; handing a task back a second time notifies
  again (the ids carry a timestamp). **Best-effort** — a failed insert is logged
  (`[task-actions] task reassigned but owners not notified`) and the edit still succeeds.
- **Creation** of a task for someone else notifies them with `task_assigned`, *"New task
  from {actor email}"*. Since 2026-09-13 it carries a task target (`entityType: "task"`,
  `entityId`), so it opens the task — the account's Tasks sidebar for an account task,
  `/today?task=<id>` for a task with no account. Before, it carried only the account and
  opened the profile without selecting the task.
- **History is written into the task's thread** for due-date, owner and status changes —
  see *Task history* under Primary workflows. History rows notify nobody.

## Empty, loading and error states

- No open tasks: *"No open tasks on this account."*, plus a suggestion to add one for users
  who can.
- A failed task read on the server renders an empty list rather than failing the profile.
- Saving shows a spinner on Save changes or the push button; the push button is disabled
  while that row saves.
- Errors: one line above the list, cleared on the next action.

## Data model

`today_tasks` — `id`, `owner_email`, `category`, `title`, `account_id`, `due_date`,
`priority`, `notes`, `status`, `created_by_email`, `updated_at`, and more
([`lib/db/schema.ts`](../../../lib/db/schema.ts)). Threads are `task_updates`: comments
(`kind = 'comment'`, plain text with mention tokens) and, since 2026-09-13, history rows
(`kind` = `due_date_changed`, `reassigned` or `status_changed`, body JSON `{from, to}`,
`author_email` = the actor). The three history kinds were reserved in the table's
migration (`drizzle/0005_add_task_updates.sql`) and are now written. `task_updates.task_id`
has no foreign key, so deleting a task does not remove its thread rows. Notifications are
`notifications` with `entity_type` / `entity_id`. **No schema change or migration** in
either 2026-09-13 change. See [data-model](../../data-model/README.md).

## Technical implementation

| Concern | File |
|---|---|
| Sidebar, add/edit form, push, done, reopen | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) |
| Due-date arithmetic | [`lib/task-due.ts`](../../../lib/task-due.ts) — `daysUntil`, `isOverdue`, `pushedAWeek` |
| History rules and wording | [`lib/task-activity.ts`](../../../lib/task-activity.ts) — `activityFor`, `encodeActivity`, `decodeActivity`, `describeActivity` |
| Tests | [`lib/task-due.test.ts`](../../../lib/task-due.test.ts) — 6 tests · [`lib/task-activity.test.ts`](../../../lib/task-activity.test.ts) — 9 tests |
| Server actions | [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) — `createTaskAction`, `toggleTaskAction`, `updateTaskAction`, `deleteTaskAction`, `denyExistingTask`, `mayEditAnyTask` · [`app/(app)/today/task-update-actions.ts`](../../../app/%28app%29/today/task-update-actions.ts) — `getTaskUpdatesAction` (returns `kind`), `deleteTaskUpdateAction` |
| Writes | `lib/repo/drizzle.ts` — `updateTodayTaskDb` (returns `{count, before}`), `setTodayTaskStatusDb`, both via `lockTaskForWrite` + `recordTaskActivity` in one transaction; `deleteTaskUpdateDb`; `getTodayTaskDb`; `insertNotificationsDb` |
| Page wiring | [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/[id]/page.tsx) — passes `canEdit`, `canAssignOthers`, `viewerEmail`, `canEditAnyTask`, `today` |
| Thread, including history lines | `components/clients/TaskUpdates.tsx` |
| Notification link | `lib/notifications/link.ts` |

`updateTaskAction`, `toggleTaskAction` and `deleteTaskAction` are shared with the Today
board (`components/today/TaskDrawer.tsx`, `TodayBoard.tsx`, `FocusAreaBoxes.tsx`), and the
drawer renders the same `TaskUpdates` thread — so the account gate, the history rows and the
reassignment notifications apply there too.

## Analytics and observability

No product analytics events. One server log line when a reassignment notification fails.
The `task_updates` history rows are a product-visible record, not telemetry.

## Dependencies

Today board (same rows) · notifications · task updates · users and permissions (role and
scope) · the CSM and implementation team directories that feed the assignee picker.

## Known limitations

- **Only due date, owner and status leave history.** Title, notes, priority, focus-area
  and account-link edits still overwrite the row with no trace beyond
  `today_tasks.updated_at` — a task can be rewritten into different work without the
  thread showing it. Deliberate, per the `lib/task-activity.ts` header.
- **History starts when this change is deployed.** Changes made before it were never
  recorded and cannot be reconstructed; an older task's thread shows no history for them.
- **Deleting a task is not recorded, and takes its history out of reach.** The thread rows
  remain in `task_updates` (no foreign key, no cascade) but nothing can open them.
- **Guests cannot see history.** The thread read is gated like a write, so the audience
  that can only watch an account is the one that cannot see how its tasks slipped.
- **A completed task cannot be edited or re-dated from this sidebar** — reopen it first.
- **"Today" is the UTC date** at server render, so near midnight a viewer far from UTC can
  see "Due today" / "overdue" a day early or late relative to their own calendar.
- **Notifications name people by email**, not display name, in both reassignment titles.
- **The previous-owner notification for a task with no account may be a dead click.** It
  links to `/today?task=<id>`, and the Today board opens a task only if it is in the
  viewer's scoped snapshot — which a task just handed away usually is not
  (`components/today/TodayWorkspace.tsx`). Read, not run: `Partially verified`.
- **No test covers the server actions, the permission gates, the transactional write or
  the component.** Only the date arithmetic and the history derivation and wording are
  tested. The repository writers were exercised by hand against the test database (see
  Verification metadata); the actions and UI were not run with a signed-in session.

## Open questions

- Should Guests (and other read-only viewers) be able to read a task's thread and history?
  Today the read gate equals the write gate by design (`getTaskUpdatesAction` header).
  *Product.*
- Should title and notes changes be recorded too, at least when a task's meaning changes?
  The module header says no; confirm that is the product decision. *Product.*
- Should deleting a task leave a trace, or be replaced by an archive? *Product /
  Engineering.*

## Source references

`components/clients/AccountTasks.tsx` · `components/clients/TaskUpdates.tsx` ·
`lib/task-due.ts` · `lib/task-due.test.ts` · `lib/task-activity.ts` ·
`lib/task-activity.test.ts` · `app/(app)/today/task-actions.ts` ·
`app/(app)/today/task-update-actions.ts` · `app/(app)/clients/[id]/page.tsx` ·
`lib/repo/drizzle.ts` · `lib/notifications/link.ts` · `lib/db/schema.ts` ·
`drizzle/0005_add_task_updates.sql` · `components/today/TaskDrawer.tsx` ·
`components/today/TodayWorkspace.tsx`

---

**Documentation status:** Partially verified — sidebar component, thread component, page
wiring, server actions and repository writes read end to end. Passing tests: 6 for the
due-date helpers, 9 for history derivation, encoding and wording (15 run 2026-09-13). The
repository writers `updateTodayTaskDb`, `setTodayTaskStatusDb` and `deleteTaskUpdateDb`
were exercised manually against the **test** database on 2026-09-13 with a throwaway task —
a push, a same-day re-save, done then open, an admin reassignment, and removal attempts on
history rows — and behaved as documented (reported by the engineer who ran it; not
repo-reproducible). The server actions, permission gates and components were not run with
a signed-in session.
**Last verified:** 2026-09-13
**Verified against commit:** `4621fc8` (branch `feat/task-edit-history`) plus the
uncommitted working-tree change adding task history, the existing-task account gate, the
creation notification target, the previous-owner notification and Reopen. Earlier
2026-09-13 content (edit, push a week, overdue count) was verified at `7c2e39f` plus its
working-tree change, which has since landed as `12b7ce7`.
**Documentation owner:** Unassigned
