# Account Tasks

**Status:** Partially verified

Part of the [Client Profile](README.md), above the tabs.

## Summary

A **Tasks** button on the client profile that opens a sidebar listing the account's tasks —
open ones first, missed ones at the top, completed ones behind a disclosure. From it a user
can add a task, mark one done, edit it in place, move its due date on by a week, and read or
post updates on it. The rows are `today_tasks`: the same records the Today board reads.

## Purpose

Lets a CSM put work against an account without leaving the account, and keep that work
honest once it exists. A task that slipped can be re-dated or corrected in place, instead
of being left overdue or marked done when it was not — both of which misreport the Today
board. Before 2026-09-13 an existing task could only be marked done or discussed, and
closing and recreating it lost its update thread
([`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx)
module header).

## Intended users

- **CSM (operator)** — adds and maintains tasks on accounts in their scope; changes their
  own tasks.
- **Admin / Super Admin** — additionally assign tasks to other people, and, with an
  unrestricted scope, change anyone's task.
- **Guest** — reads the list and the threads; no controls.

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
6. **"N completed"** disclosure — title struck through and the updates button only.

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
5. **Result** — the row updates in place.
6. **Failure** — the form stays open and the server's message is shown: *"That due date is
   in the past."*, *"Only an admin can reassign a task to someone else."*, or *"That task
   isn't on your board. Ask its owner, or an admin, to change it."* when the owner-scoped
   write matched nothing.

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

### Mark done
Checkbox on a row that offers controls → `toggleTaskAction(id, "done")`, optimistic, reverted
with the server message on refusal. The task moves to the completed disclosure. There is no
reopen, edit or push on a completed task in this sidebar.

### Read and post updates
The speech-bubble button expands the task's thread (`TaskUpdates`), one at a time. Available
on open and completed tasks and to every viewer; posting requires `canEdit`. The thread is
not described further here — task updates have no feature document yet.

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
| Open | Work outstanding | creation | Mark done | row with controls |
| Done | Completed | Mark done | not from this sidebar | — |

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

## Permissions

- **View:** anyone who can open the profile. The list is every task linked to the account,
  whoever owns it (`getTodayTasksVisibleDb` filtered to the account).
- **Create:** `createTaskAction` — refused for Guests (`denyTaskWrite`) and for anyone who
  cannot write the account (`denyClientWrite`).
- **Change (done, edit, push):** the server gate is in
  [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) —
  `denyTaskWrite` (no Guests), then an **owner-scoped** write (`todayTaskScope` in
  `lib/repo/drizzle.ts`) that matches only the caller's own task unless `mayEditAnyTask()`
  (role `editsAllClients` **and** scope mode `all`). A zero-row write returns the
  "isn't on your board" refusal.
- **Reassign:** to someone else requires `editsAllClients(role)`; an Admin with a
  narrowed scope can hand off their **own** tasks only, because the owner-scoped write
  still applies.
- **Who sees the controls (interface).** Done, edit and push appear on a row only when
  `canEdit` (the page's `canEditClient` result) **and** either the viewer owns the task or
  `canEditAnyTask` — which the page computes with the same predicate as `mayEditAnyTask`.
  Before 2026-09-13 the done checkbox appeared on every row for anyone with `canEdit`, and
  a teammate's task was refused after the click. The assignee picker is shown when
  `canAssignOthers` (`editsAllClients(role)`).
- **Note — the interface is stricter than the server here.** `updateTaskAction` and
  `toggleTaskAction` re-apply the account write gate only when the account link itself is
  being changed, which this sidebar never sends. The owner-scoped write is the effective
  server gate for changing an existing task.

## Automations and side effects

- **Reassignment notifies the new owner** (since 2026-09-13). When `updateTaskAction`
  changes the owner to someone other than the actor **and** other than the previous owner,
  it writes one `task_assigned` notification: title *"Task handed to you by
  {actor email}"*, body the task title, the task's account, and a task target
  (`entityType: "task"`), so it deep-links to the task. Re-saving the same owner does not
  notify; handing a task back to someone a second time does (the id carries a timestamp).
  **Best-effort** — a failed insert is logged (`[task-actions] task reassigned but new
  owner not notified`) and the edit still succeeds. The previous owner is not notified.
- **Creation** of a task for someone else notifies them (unchanged).
- **No history is written.** Edits, due-date moves, reassignment and completion are not
  recorded in the task's update thread or anywhere else; `today_tasks.updated_at` is the
  only trace. See Known limitations.

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
([`lib/db/schema.ts`](../../../lib/db/schema.ts)). Threads are `task_updates`. Notifications
are `notifications` with `entity_type` / `entity_id`. No change to any table in the
2026-09-13 change. See [data-model](../../data-model/README.md).

## Technical implementation

| Concern | File |
|---|---|
| Sidebar, add/edit form, push, done | [`components/clients/AccountTasks.tsx`](../../../components/clients/AccountTasks.tsx) |
| Due-date arithmetic | [`lib/task-due.ts`](../../../lib/task-due.ts) — `daysUntil`, `isOverdue`, `pushedAWeek` |
| Tests | [`lib/task-due.test.ts`](../../../lib/task-due.test.ts) — 6 tests |
| Server actions | [`app/(app)/today/task-actions.ts`](../../../app/%28app%29/today/task-actions.ts) — `createTaskAction`, `toggleTaskAction`, `updateTaskAction`, `mayEditAnyTask` |
| Writes | `lib/repo/drizzle.ts` — `updateTodayTaskDb`, `setTodayTaskStatusDb`, `getTodayTaskDb`, `insertNotificationsDb` |
| Page wiring | [`app/(app)/clients/[id]/page.tsx`](../../../app/%28app%29/clients/[id]/page.tsx) — passes `canEdit`, `canAssignOthers`, `viewerEmail`, `canEditAnyTask`, `today` |
| Thread | `components/clients/TaskUpdates.tsx` |
| Notification link | `lib/notifications/link.ts` |

`updateTaskAction` is also used by the Today board's task drawer
(`components/today/TaskDrawer.tsx`), so the reassignment fixes apply there too.

## Analytics and observability

No product analytics events. One server log line when a reassignment notification fails.

## Dependencies

Today board (same rows) · notifications · task updates · users and permissions (role and
scope) · the CSM and implementation team directories that feed the assignee picker.

## Known limitations

- **Edits leave no history.** Changing a task — including pushing its due date — is not
  recorded in its update thread or in any audit table. A pushed date overwrites the old
  one, so a task that slipped three times looks exactly like one that was always due
  then. `task_updates.kind` reserves `due_date_changed`, `reassigned` and `status_changed`,
  but nothing writes them (reserved as Step 3 of the
  [task updates spec](../../specs/tasks/task-updates-mentions-and-notifications.md), which
  is `Proposed`).
- **A completed task cannot be reopened, edited or re-dated from this sidebar.**
- **The previous owner is not told** when their task is handed to someone else.
- **"Today" is the UTC date** at server render, so near midnight a viewer far from UTC can
  see "Due today" / "overdue" a day early or late relative to their own calendar.
- **The two `task_assigned` notifications route differently.** A reassignment carries a task
  target and opens the task's thread; a creation notification carries only the account, so
  it opens the profile without selecting the task (`createTaskAction` sets no
  `entityType`).
- **No test covers the server actions, the permission gate or the component.** Only the
  date arithmetic is tested.

## Open questions

- Should due-date changes be recorded in the thread, so slips are visible? *Product.*
- Should a creation notification deep-link to the task the way a reassignment now does?
  *Product / Engineering.*
- Should the account write gate be re-applied on every task change, not only when the
  account link changes? *Engineering.*

## Source references

`components/clients/AccountTasks.tsx` · `lib/task-due.ts` · `lib/task-due.test.ts` ·
`app/(app)/today/task-actions.ts` · `app/(app)/clients/[id]/page.tsx` ·
`lib/repo/drizzle.ts` · `lib/notifications/link.ts` · `lib/db/schema.ts` ·
`components/today/TaskDrawer.tsx`

---

**Documentation status:** Partially verified — sidebar component, page wiring, server
actions and repository writes read end to end; the due-date helpers are covered by 6 passing
tests; nothing else is tested and the flows were not run against a signed-in session.
**Last verified:** 2026-09-13
**Verified against commit:** `7c2e39f` plus the uncommitted working-tree change adding edit,
push a week, the separate overdue count and the reassignment notification.
**Documentation owner:** Unassigned
