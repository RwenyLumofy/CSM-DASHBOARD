# Today

**Status:** Partially verified

## Summary

The CSM's daily operating homepage: a permission-scoped snapshot of what needs attention
across their accounts — portfolio pulse, ranked priorities, focus-area lanes, personal
tasks and a change feed.

## Purpose

Answers "what should I do today, and which accounts should I be worried about" without
opening a single profile. It is the one page that ranks work rather than listing records.

## Intended users

Operators (CSM and Implementation) primarily. Admins and Super Admins see the whole book,
which makes it a management overview. Guests see it read-only.

## Entry points

- **Route:** `/today`
- **Navigation path:** Sidebar → Today (first item)
- **Links out to:** account drawers, the Client Profile, the Action list.

Note: Today is the first sidebar item but **not** the home route — `/` goes to `/clients`.

## Information architecture

1. **Header** — viewer, date, portfolio framing.
2. **Portfolio pulse** — summary metrics for the accounts in scope.
3. **Pulse-due banner** — accounts whose CS Pulse is missing or lapsed.
4. **Top priorities** — ranked, derived items with triage controls.
5. **Focus-area lanes** — de-risking · projects · escalations · expansion · stakeholders.
6. **Tasks** — personal tasks (`today_tasks`).
7. **Change feed** — recent changes across accounts in scope.

Lane keys are fixed in [`lib/today/types.ts`](../../../lib/today/types.ts) and labelled in
`lib/today/format.ts`.

## Primary workflows

### Open Today
1. **Trigger** — Sidebar → Today.
2. **Preconditions** — signed in; role resolves.
3. **System behaviour** — `buildTodaySnapshot()` assembles the snapshot server-side from
   `getClients()`, `getAppUsers()`, notifications, client actions, usage history and
   project boards. Because `getClients()` is already role-scoped, the whole snapshot
   inherits the viewer's scope. `getPulseQueue()` is scoped the same way.
4. **Result** — `TodayWorkspace` renders from the snapshot; the client repo reads only
   from it.
5. **Failure** — with no database configured, `build.ts` falls back to the illustrative
   mock snapshot in `lib/today/mock.ts`.

### Triage a priority
1. **Trigger** — "Mark reviewed" or "Snooze" on a priority.
2. **Preconditions** — the priority is rendered; the user is not a Guest.
3. **System behaviour** — a priority is **derived per render** (`pri_{clientId}`) from
   health, renewal dates and usage. There is no row to update, so the *decision* is stored
   instead, keyed by the person who made it, in `workspace_config` under
   `today_triage:{email}`.
4. **Result** — "reviewed" dims the item but keeps it visible; "snoozed" hides it until
   the stored `until` date.
5. **Exception** — "reviewed" **clears automatically when the underlying priority changes
   shape** (a stored fingerprint no longer matches), and a snooze simply expires. This is
   deliberate: the older `client_actions` dismissal is sticky forever, which buries a
   signal that recurs next quarter.
   ([`lib/today/triage.ts`](../../../lib/today/triage.ts))

### Manage a task
1. **Trigger** — "Add task", or acting on an existing one.
2. **System behaviour** — writes `today_tasks` via `app/(app)/today/task-actions.ts`.
3. **Result** — the task persists across sessions, unlike triage-era state.
4. **Note** — these are **personal** tasks. They are unrelated to `project_tasks` and to
   the unwritten `playbook_tasks` table.

## Fields and data

| Concept | Meaning | Persisted? | Where |
|---|---|---|---|
| Signal | Something that may need attention | No — derived | `lib/today/build.ts` |
| Priority | Ranked account-level attention item | No — derived per render | id `pri_{clientId}` |
| Triage decision | reviewed / snoozed + expiry | **Yes** | `workspace_config.today_triage:{email}` |
| Today task | Personal work item | **Yes** | `today_tasks` |
| Commitment | Something promised, with a due date | Mock path only | `lib/today/mock.ts` |
| Change feed item | Recent account change | No — derived | `lib/today/build.ts` |

## States and statuses

- **Triage state:** `reviewed` (visible, dimmed) · `snoozed` (hidden until `until`).
- **Commitment status** (`lib/today/types.ts:39`): `on_track` · `at_risk` · `overdue` ·
  `escalation_required`. An escalation is surfaced **only** when a real commitment is
  overdue or explicitly needs escalation — never invented
  ([`lib/today/repo.ts:143-149`](../../../lib/today/repo.ts)).
- **Operational state / confidence / data freshness** are carried on the snapshot so the
  page can say how current its inputs are.

## Business rules

- **Scope inheritance** — the snapshot cannot show an account the viewer cannot see,
  because it is built from already-scoped reads.
- **A signal is not a task.** Signals and priorities are derived; tasks are explicit. The
  page deliberately does not blur them
  ([`lib/today/repo.ts:143`](../../../lib/today/repo.ts) names this as a design rule).
- **Escalations are evidenced, not generated.** No "plan" is invented.
- **Snooze is dated, not permanent.**

## Permissions

- **View:** everyone signed in. Content differs by scope.
- **Create/complete tasks, triage:** not Guests (Guests create no actions —
  `permissionCapabilities` in `lib/roles.ts`).
- **Server-side enforcement:** inherited from `getClients()` / `getCurrentUserRole()` in
  [`lib/auth.ts`](../../../lib/auth.ts). `buildTodaySnapshot` also calls `getAppUsers()`,
  which has **no role or scope check of its own** — see Known limitations.

## Automations and side effects

- The pulse-due banner is driven by `getPulseQueue()` / `toPulseDueSummary()`
  ([`lib/health/pulse-queue.ts`](../../../lib/health/pulse-queue.ts)).
- Notifications surface here and in the sidebar bell.
- Today does **not** generate `client_actions`; that is the daily
  `/api/cron/client-actions` job. See [action-list](../action-list/README.md).

## Empty, loading and error states

`dynamic = "force-dynamic"` — no static cache. With no DB, the mock snapshot renders,
which means **an unconfigured environment shows illustrative data on this page while other
pages show empty states**. That inconsistency is real; see Known limitations.

## Data model

Reads: `clients`, `app_users`, `notifications`, `client_actions`, `client_usage_*`,
`client_projects`/`project_tasks`. Writes: `today_tasks`, `workspace_config`
(`today_triage:{email}`), `client_notes`.

## Technical implementation

| Concern | File |
|---|---|
| Page | [`app/(app)/today/page.tsx`](../../../app/%28app%29/today/page.tsx) |
| Snapshot builder | [`lib/today/build.ts`](../../../lib/today/build.ts) (476 lines) |
| Types | `lib/today/types.ts` |
| Client-side repo | `lib/today/repo.ts` |
| Triage | `lib/today/triage.ts`, `app/(app)/today/triage-actions.ts` |
| Tasks | `app/(app)/today/task-actions.ts` |
| Mock fallback | `lib/today/mock.ts` |
| UI | `components/today/` (20 files; `TodayWorkspace.tsx` is the root) |

## Analytics and observability

`lib/today/analytics.ts` exists — **verify what it does before citing it**; it is not an
external analytics integration (no SDK is installed). No events are emitted off-platform.

## Dependencies

Health · CS Pulse · usage · projects · notifications · client actions · permissions.

## Known limitations

1. **`getAppUsers()` is unscoped.** It returns the whole staff directory — emails, names,
   permission tiers, departments — with no role, session or scope check, and
   `TodayWorkspace` is a client component, so that list is serialized into the RSC
   payload. This is exactly the bug that made `/scratch-wf` a data leak (commit `8f00fed`,
   documented in [`middleware.ts:23-31`](../../../middleware.ts)). Behind auth it is an
   internal-directory exposure to every signed-in user, including Guests, rather than an
   anonymous leak — but it has not been narrowed.
2. **Commitments are mock-backed** in the non-DB path; there is no commitments table.
3. **Priorities have no history.** Only the triage decision persists.
4. **The mock fallback** makes Today behave differently from every other page when the DB
   is absent.

## Open questions

- Is the mock fallback intended to survive, now that `lib/data.ts` removed sample mode
  everywhere else?
- Should `getAppUsers()` be scoped, or is the full directory intended to be visible to all
  members? Needs a product decision.

## Source references

`app/(app)/today/page.tsx` · `lib/today/build.ts` · `lib/today/triage.ts` ·
`lib/today/repo.ts` · `lib/today/types.ts` · `lib/health/pulse-queue.ts` ·
`middleware.ts` · `components/today/*`

---

**Documentation status:** Partially verified — no tests cover Today
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
