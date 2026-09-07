# Notifications

**Status:** Partially verified — the routing function is tested (six tests); the bell, the
polling and every writer are not.

## Summary

An in-app bell in the sidebar showing the signed-in user's most recent notifications, with an
unread badge. Each notification can name **what it is about**, so clicking one lands the reader
on the thing rather than near it. The bell catches up on a 60-second timer and whenever the tab
comes back to the front.

## Purpose

Signal writes notifications from six modules and had nowhere useful to send the reader. A
notification is only worth anything if it can put you in front of what it is about.

## Intended users

Everyone. Every role receives notifications; the bell is in the app shell on every page.

## Entry points

- **Bell:** sidebar, on every authenticated page.
- **"View all in Action list"** at the foot of the panel links to `/inbox` — which is the **AI
  Action list, a different object**. There is still no full notification list; see
  [Known limitations](#known-limitations).

## Information architecture

A bell button with an unread count badge (capped at "9+"), opening a fixed-position 320px
panel: a header with **Mark all read**, up to **12** rows, and the Action list link.

Each row shows a per-type icon, the title, up to two lines of body, a relative timestamp, and —
when unread — both a row tint and a dot. The dot exists because the tint alone carried the
meaning in colour only.

## Primary workflows

### Receive and open a notification

1. **Trigger** — a writer inserts a row (see [Automations](#automations-and-side-effects)).
2. **System behaviour** — the bell is server-rendered on navigation, and additionally polls.
3. **User actions** — open the bell, click a row.
4. **System behaviour** — `notificationHref()` resolves the destination; the panel closes and
   the router pushes. Marking read is a **background** write, deliberately not awaited: doing so
   would block the navigation so the page appears to load and never moves. The unread count and
   the row are updated optimistically.
5. **Result** — the reader lands on the target, with a task's thread already open where the
   notification was about a task.
6. **Failure** — a notification with nowhere to go renders as a non-navigating row that still
   marks itself read. A row that looks clickable and does nothing reads as a broken app.

### Catch up without navigating

- **Trigger** — a 60-second interval, a `visibilitychange` back to visible, or opening the bell
  (the strongest signal that the user wants current data).
- **System behaviour** — `pollNotificationsAction()` returns the 20 most recent items and the
  unread count **from the same call**, so the count and the list cannot disagree. It is already
  scoped to the signed-in user inside `lib/data`; there is no caller-supplied email to spoof.
  Polling is skipped when the tab is not visible.
- **Failure** — the action returns `unread: -1` as an explicit "the read failed" signal and the
  bell **keeps what is already on screen**. Blanking to an empty list would say "you're all
  caught up", which is a lie the reader would act on.

### Mark all read

Optimistic locally, then the server action, then `router.refresh()` **inside a
`startTransition`** — outside one, the Server Action's revalidation is never applied and the
rest of the page keeps rendering the old unread state.

## Fields and data

| Field | Meaning | Notes |
|---|---|---|
| `recipient_email` | Who it is for | Every read is scoped to the signed-in user |
| `type` | One of the declared `NotificationType` values | Drives the icon and label |
| `title`, `body` | What happened | `body` is truncated by the writer, not the renderer |
| `client_id` | The account, when there is one | The fallback route |
| `entity_type` / `entity_id` | **What the notification is about**, when narrower than an account | Nullable; added 2026-08-03 |
| `read_at` | null = unread | Drives the badge |
| `status` | `open` / `done` | Used by the Action list, not the bell |
| `due_date`, `created_by_email`, `created_at` | | |

## States and statuses

| State | Meaning | Entered by | Exited by |
|---|---|---|---|
| Unread | `read_at` is null | insertion | clicking the row, or Mark all read |
| Read | `read_at` set | either of the above | terminal |

## Business rules

1. **Every read is scoped to the signed-in user** server-side, in `lib/data`. There is no
   caller-supplied recipient on any action.
2. **One function decides where a notification goes.** `notificationHref()` in
   [`lib/notifications/link.ts`](../../../lib/notifications/link.ts) is pure and is the only
   router, so the bell and any other consumer cannot disagree about the same notification.
3. **Routing precedence**, in order:

   | Condition | Destination |
   |---|---|
   | `entity_type === "task"` and `entity_id` present, with a `client_id` | `/clients/{clientId}?task={entityId}` |
   | `entity_type === "task"` and `entity_id` present, no `client_id` | `/today?task={entityId}` |
   | any other or absent `entity_type`, with a `client_id` | `/clients/{clientId}` |
   | neither | `null` |

   An **unknown** entity type falls back to the account rather than inventing a route, and a
   `task` type with a null `entity_id` also falls back. Ids are placed through
   `URLSearchParams`, so a value containing URL-significant characters is encoded rather than
   concatenated. All six of these are pinned by
   [`lib/notifications/link.test.ts`](../../../lib/notifications/link.test.ts).
4. **`null` means "nowhere to go", never `/`.** The bell renders a non-navigating row for it.
5. **A deep-linked task is only opened if the viewer can already see it.** Both surfaces check
   the id against the permission-scoped list they already rendered before acting on `?task=`.
   The URL parameter is not itself an authorisation.
6. **A failed poll preserves the last known state** (rule stated in the code, and the reason).

## Permissions

- **View:** your own notifications only. Enforced server-side in `lib/data`
  (`getMyNotifications`, `getMyUnreadCount`), reached through
  [`app/(app)/inbox/actions.ts`](../../../app/%28app%29/inbox/actions.ts).
- **Mark read / mark all read:** your own only, same scoping.
- **Create:** no user-facing creation. Every notification is written by product code.
- **Delete:** no path exists.

Deep-linking cannot widen access: arriving at `/clients/{id}?task=…` for an account you cannot
see returns the standard "not found, or you don't have access" from `lib/auth.ts`, and the task
parameter is ignored because the id will not be in the rendered list.

## Automations and side effects

Writers of `notifications` rows, verified present:

| Type | Written by | Recipient |
|---|---|---|
| ~~`assignment_review`~~ | **No writer.** The assignment engine was removed 2026-08-03 (`07db772`). Historical rows survive and still render | Super Admin |
| ~~`assignment_needs_admin`~~ | **No writer**, same removal | Super Admin |
| `client_assigned` | `app/(app)/clients/[id]/owner-actions.ts` | the new owner |
| `profile_incomplete_red` | `lib/notifications/profile-completeness-sync.ts` | CSM + Super Admins |
| `profile_incomplete_yellow` | `lib/notifications/profile-completeness-sync.ts` | CSM |
| `task_assigned` | `app/(app)/today/task-actions.ts` | the assignee |
| `task_mentioned` | `app/(app)/today/task-update-actions.ts` | each person named |
| `task_update` | `app/(app)/today/task-update-actions.ts` | the task owner |
| — | `lib/notifications/project-deadline-sync.ts` | project owners |

`task_assigned` was **being written while absent** from the `NotificationType` union, from the
schema comment and from the bell's icon map. It is now declared in all three.

Every type has its own icon and accessible label in `TYPE_META`
([`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx)),
with an `Info` fallback for an unrecognised value. Before this, four types — the three task
types and the yellow profile nudge — fell through to the same grey dot as `system`, so being
named in an update looked identical to a housekeeping notice.

**No email, no push, no digest, no real-time transport.** There is no mail provider in the
repository.

## Empty, loading and error states

| State | What is shown |
|---|---|
| No notifications | *"You're all caught up."* |
| Poll failed | The previous list and count, unchanged |
| Nothing to open | A non-navigating row that still marks itself read |
| Target account no longer visible | The standard not-found page; the notification is still marked read |
| Unrecognised type | The `Info` icon and the label "Notification" |

There is no loading state — the bell renders server-side data and swaps it in place.

## Data model

One table, `notifications`, serving **both** the bell feed and the Action list — the `status`
column belongs to the latter. `entity_type` and `entity_id` were added by
[`drizzle/0005_add_task_updates.sql`](../../../drizzle/0005_add_task_updates.sql) as nullable
columns; nothing was backfilled, and every pre-existing row keeps routing on `client_id`
exactly as before.

`entity_type` is typed `string | null` on the `Notification` interface and documented as
`'task' | 'client' | null` in the schema comment; only `task` is written today, and
`notificationHref()` treats anything else as "no entity".

See [data-model](../../data-model/README.md).

## Technical implementation

| Concern | File |
|---|---|
| Destination resolution | [`lib/notifications/link.ts`](../../../lib/notifications/link.ts) |
| Bell UI, polling, icons | [`components/layout/NotificationsBell.tsx`](../../../components/layout/NotificationsBell.tsx) |
| Poll / mark-read actions | [`app/(app)/inbox/actions.ts`](../../../app/%28app%29/inbox/actions.ts) |
| Row → domain object | `notificationRowTo` in [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) |
| Writer helpers | `insertNotificationsDb`, `upsertOpenNotificationsDb` in [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) |
| Type union | [`lib/types.ts`](../../../lib/types.ts) |
| Schema | [`lib/db/schema.ts`](../../../lib/db/schema.ts) |
| Tests | [`lib/notifications/link.test.ts`](../../../lib/notifications/link.test.ts) |

The panel is `position: fixed` with coordinates taken from the button's own bounding rect,
because every ancestor between the button and the page root passes through an
`overflow-hidden` container and an absolutely-positioned panel was clipped to a sliver.

`entity_type` / `entity_id` were written by the task-update action from `a9b0382` but stopped
at `notificationRowTo`, so the deep-link data sat in the database for a commit with nothing
able to see it. Mapping them through is what made the feature real.

**Test discovery was broken and is fixed.** `npm test` globbed a hand-maintained list of `lib`
subdirectories, so `lib/notifications/*.test.ts` silently did not run. The script is now
`lib/**/*.test.ts`.

## Analytics and observability

**None.** No analytics event is emitted for receiving, opening or dismissing a notification.
There is no delivery log and no way to tell whether a notification was ever seen beyond
`read_at`. Polling failures are swallowed silently by design — the user sees stale data rather
than an error.

## Dependencies

[Task updates and mentions](../task-updates/README.md) — the largest producer ·
[Today](../today/README.md) and [Client Profile](../client-profile/README.md) — the deep-link
targets · [Action list](../action-list/README.md) — shares the table · assignment, profile
completeness and project deadline jobs.

## Known limitations

1. **There is still no notification list.** The bell renders 12 of the 20 it fetches, and "View
   all" goes to `/inbox`, which is the AI Action list — a different object. Notification 13 is
   unreachable.
2. **No preferences.** No per-type mute, no unsubscribe, no frequency control.
3. **Polling is a 60-second interval per open tab**, not a subscription. There is no
   server-push and no cross-tab coordination.
4. **No delete or archive path.** Notifications accumulate.
5. **`entity_type` is an untyped string in the database** and is cast straight to the union on
   read. An unexpected value degrades gracefully in routing and shows the fallback icon, but
   nothing validates it on write.
6. **`task_update` notifications do not coalesce** — see
   [task updates](../task-updates/README.md), limitation 6.
7. **No notification is written when a task is reassigned** through `updateTaskAction`, while
   `createTaskAction` doing the same thing does write one. Same act, two behaviours. The
   specification required closing this; it was not closed.
8. **Nothing cleans up notifications pointing at deleted objects.**
9. **Never exercised with a real session** — polling, routing and read-marking all require a
   signed-in Clerk user, which the local environment does not have. `notificationHref()` is
   the exception: it is pure and tested.

## Open questions

- Should "View all" build a real notification list, or should notifications and the Action list
  converge into one surface? They already share a table.
- Should reassignment notify, matching creation?
- Is 60 seconds the right poll interval, and should it back off on an inactive tab?

## Source references

`lib/notifications/link.ts` · `lib/notifications/link.test.ts` ·
`components/layout/NotificationsBell.tsx` · `app/(app)/inbox/actions.ts` ·
`lib/repo/drizzle.ts` · `lib/db/schema.ts` · `lib/types.ts` ·
`drizzle/0005_add_task_updates.sql` · `app/(app)/today/task-update-actions.ts` ·
`app/(app)/today/task-actions.ts` · lib/assignment/run.ts *(deleted `07db772`)* ·
`lib/notifications/profile-completeness-sync.ts` · `lib/notifications/project-deadline-sync.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-08-03
**Verified against commit:** `6660fe8`
**Documentation owner:** Unassigned
