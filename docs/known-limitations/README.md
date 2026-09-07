# Known limitations

Honest list of what Signal does not do, does badly, or does inconsistently — including
things nobody has filed.

**Last verified:** 2026-08-05 · **Commit:** `9d83a22`
(Re-read in full at this commit after the health-engine switch, the assignment-engine removal
and the stakeholder cutover. Entries carrying an earlier date were re-checked, not re-written.)

Contradictions have their own file: [contradictions.md](contradictions.md).

---

## Defects found while documenting — 2026-08-03

Each was found by reading the implementation, not by a report. **None can be fixed by
documentation.**

| Defect | Detail |
|---|---|
| ~~**A task update is soft-deleted before the authorship check runs**~~ **— FIXED `4ed593d`.** The predicate is now passed down and gates the write. Original report: | `deleteTaskUpdateAction` calls `deleteTaskUpdateDb(updateId)` — which stamps `deleted_at` ([`lib/repo/drizzle.ts`](../../lib/repo/drizzle.ts):1902) — and only then compares the returned author against the caller ([`app/(app)/today/task-update-actions.ts`](../../app/%28app%29/today/task-update-actions.ts) lines 187–191). A caller with write access to the account who is neither the author nor an unrestricted admin therefore **removes the update and receives *"You can only remove your own updates."*** The refusal is accurate about intent and wrong about outcome. The UI offers the control only on the viewer's own updates, so reaching it needs a direct action call — but a UI affordance is not a permission. [permissions-and-scoping R14](../business-rules/permissions-and-scoping.md#r14--removing-an-update-your-own-or-an-admin-with-unrestricted-scope). **No test pins the ordering** — the one worth adding |
| **Deleting a task orphans its thread** | `task_updates`, `task_update_mentions` and any notifications pointing at the task survive it. Neither table declares a foreign key and `deleteTaskAction` has no cascade. The specification required the cleanup |
| **Reassigning a task notifies nobody** | `updateTaskAction` can change the assignee silently, while `createTaskAction` doing the same thing writes a `task_assigned` notification. Same act, two behaviours. Known before this work and still open |
| **"Not assessed" is applied on three surfaces, not everywhere** | `HealthPill`, the CS Pulse panel and the `/clients` at-risk count consult `isAssessed`; `lib/metrics/portfolio.ts`, `lib/metrics/movement.ts` and `lib/today/build.ts` do not. An unassessed account is excluded from one at-risk count and still reachable through the others |
| **Any consumer that re-bands `health.score` disagrees with the status on screen** | **Widened 2026-08-05.** The engine's gates and status rules mean score and status routinely differ. `lib/actions/signals.ts` and the clients list were fixed (`31777c2`); `lib/metrics/portfolio.ts`, `lib/metrics/movement.ts` and `lib/today/build.ts` still band the raw score on **75/55** while the model uses **65/50/25**. [contradictions](contradictions.md#at-risk-still-has-two-definitions--narrowed-2026-08-05-not-closed) |
| **Status changes wait for the nightly recompute** | Rating an account Critical does not move its status until `/api/cron/client-health` runs at 09:00, or an admin re-saves the health configuration. Unlike "Not assessed", the applied status is computed at recompute time and persisted |
| **A notification pointing at a completed task does not fully land** | The account Tasks sidebar sets the task expanded, but the completed list lives in a `<details>` element that is never opened programmatically, so the reader arrives with a thread expanded inside a collapsed disclosure |
| **No edit path for a task update** | `task_updates.edited_at` exists and `TaskUpdates` renders an "edited" marker; nothing writes it |

---

## Gaps that are design choices, stated plainly — 2026-08-03

| Gap | Why it is here |
|---|---|
| **A Guest can read no task thread** | Read is gated on the write predicate deliberately and by an explicit comment, and that predicate refuses Guests. The specification for the feature called for read-only visibility. Whether the exclusion was intended is an **open product question**, not a code defect |
| **A colleague with no grant on an account cannot be mentioned on its tasks** | The stated cost of decision [0012](../decisions/0012-a-mention-is-a-reference-not-a-grant.md). The answer is an admin granting them the account |
| **"You may not read this" and "there are no updates yet" look identical** | `getTaskUpdatesAction` returns `[]` on a refused gate so a failed thread cannot blank the task list around it |
| **`task_update` notifications do not coalesce** | Three updates on one task produce three notification rows for the owner. The specification called for one, refreshed in place |
| **There is still no notification list** | The bell renders 12 of the 20 it fetches; "View all" goes to `/inbox`, which is the AI Action list — a different object. Notification 13 is unreachable |
| **The unassessed score still exists in the database** | `clients.health` holds a number and tier for an account the product declines to score. Exports, SQL and Metabase questions still see it |

---

## Outstanding work that has landed in code but not in production

| Item | Detail |
|---|---|
| **The use-case adoption backfill has not been run against production** | [`scripts/backfill-use-case-implementations.mjs`](../../scripts/backfill-use-case-implementations.mjs) has been applied to the **clone database only** — 85 associations across 38 accounts, covering 19 of 29 use cases. Until it runs against production, the Use Case Universe there reads "No clients yet" for most of the library while the workspace has known the answer for months. The script is dry-run by default (`--yes` to write), idempotent, and never modifies an existing record, so a production run is repeatable and cannot overwrite a CSM's own objective. Landed in `7f731b7` |
| **Ten use cases can have no adoption data at all** | GDP, IDPs, PIPs, AI Readiness, 360° Feedback, Career Coaching & Development Conversations, Career Transition Readiness, Employee Engagement & Feedback Measurement, Digital Transformation, and Hiring & Role-Based Assessments are absent from HubSpot's `use_cases` picklist, so no deal can declare them and the backfill has nothing to draw on. They will read "No clients yet" until a CSM records one on an account. This is a gap in the source system, not in the Universe — [`lib/use-cases.ts`](../../lib/use-cases.ts) documents the same drift |
| **A key removed from a data model is not a compile error** | The taxonomy was once a delta on the code-shipped list, and `overlay.renamed[id]` was how a shipped entry's label, category or summary was overridden. `7f731b7` rewrote the overlay as a flat database and removed `renamed`, so `normalizeOverlay` silently drops it. Everything the Use Case Definition Library had recorded there — 11 renames and category moves, 25 summaries — went with it, and the app fell back to the original shipped wording without anything failing. Repaired by [`scripts/reconcile-taxonomy-with-definition-library.mjs`](../../scripts/reconcile-taxonomy-with-definition-library.mjs). The general risk stands: `workspace_config` values are schemaless JSONB, so a key that stops being read produces stale output rather than an error. Any future change to a normalizer should ask what already-stored data it stops honouring |
| **`scripts/restore-orphaned-use-cases.mjs` is a one-off repair, not a migration** | It exists to rescue environments damaged by the pre-`7f731b7` orphaning bug. Whether any environment other than the clone still needs it has not been established |
| **The health engine runs; its 19 tables still do not** | The engine became the live scorer on 2026-08-03 (`9a8ea59`), but it writes to `clients.health` JSONB. `lib/db/health-schema.ts`, the `drizzle/health-*.sql` files, `health_score_snapshots` and `health_audit_logs` remain unwritten — so there is still no health history and the Metabase views are unfed. See [health](../product/health/README.md) §7 |

## Verified by reading and unit test, never exercised in a browser

These behaviours are covered by tests over their pure functions and by reading the server
actions end to end. **Nobody has run them against a real workspace through the UI**, and the
guards, transactions and cache revalidation around them have no test at all.

| Flow | Code |
|---|---|
| Use Case Universe `replace` import, including the account-cost preview and the typed confirmation | `app/(app)/use-cases/transfer-actions.ts` → `previewImportAction`, `applyImportAction` |
| Apply-time re-validation of the previewed removal list | `applyImportAction` |
| Reset the use-case database (retained retired rows for referenced ids) | `app/(app)/use-cases/taxonomy-actions.ts` → `resetTaxonomyAction` |
| Linking an account to a use case from the directory's link dialog | `components/reports/UseCaseDirectory.tsx` → `LinkDialog` |
| **Posting a task update, the mention picker's real contents, and the notification fan-out** (2026-08-03) | `app/(app)/today/task-update-actions.ts`. All three need a signed-in Clerk user and the local environment has none. `app/scratch-tasks` previews the components against sample data — it skips the server round-trip entirely |
| **Notification polling, deep-link routing on arrival, and read-marking** (2026-08-03) | `components/layout/NotificationsBell.tsx`, `app/(app)/inbox/actions.ts`. `notificationHref()` is the exception: pure, and covered by six tests |

The invariants underneath them **are** tested — see
[use-case-associations R2 / R2a](../business-rules/use-case-associations.md#r2--retire-never-orphan)
and [decision 0008](../decisions/0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md).
What is untested is everything between the button and the pure function.

---

## Features that do not work

| Limitation | Detail |
|---|---|
| **Playbooks is non-functional** | `/playbooks` is in the sidebar and permanently empty. `getPlaybooks()` returns `[]`. No trigger is ever evaluated. [Details](../product/playbooks/README.md) |
| **`timeline_events` is unwritten** | The table exists; `getTimelineForClient()` and `getRecentActivity()` return `[]`. There is no activity timeline |
| **The health engine does not run** | 13 modules, 19 tables, 25 tests, its own design document — invoked by nothing except CS Pulse capture |
| **Sentiment signals never fire** | `csat` and `nps` are null for every client, so the Action list's sentiment scaffolding is inert while the metrics still hold health weight |
| **Projects signal (#3) and stakeholder-engagement signal (#6b) are unimplemented** | Project deadlines are computed and passed into the signal engine, and no rule consumes them |

## Security and privacy

| Limitation | Detail |
|---|---|
| **`getAppUsers()` is unscoped** | The whole staff directory reaches every signed-in user, including Guests, via the Today RSC payload. See [contradictions](contradictions.md#getappusers-is-unscoped) |
| **Auth-disabled mode grants everyone Super Admin** | Correct locally; catastrophic if a deployment loses its Clerk keys. Nothing prevents that configuration booting |
| **`SUPER_ADMIN_EMAILS` has a hardcoded default** | `lib/config.ts` — an environment that does not set it grants a permanent super-admin |
| **No permission tests** | Every gate is verified by reading only |
| **`app/scratch-*` prototypes ship** | Seven routes outside the app shell in the production build. `/scratch-wf` was one of them, and it was a data leak |
| **Env files in the working tree** | `.env.clone`, `.env.local`, `.env.local.bak` sit in the working directory. **Verified 2026-07-31: all three are gitignored** (`.gitignore:24,86,87`), so this is a local-machine concern, not a repository leak |

## Auditability

| Limitation | Detail |
|---|---|
| **No configuration audit trail** | Changing the health formula silently rescores every account. No record of who, when, or from what |
| **No audit on role, scope or owner changes** | Nothing is kept. (Automated assignment used to emit a notification; that engine was removed 2026-08-03.) |
| **`health_audit_logs` is defined and unwritten** | |
| **The ARR ledger is the only reconstructible history** | Because it is modelled as events. Nothing else is |
| **No import audit and no undo** | A bad import is corrected by hand or by script |

## Data quality and modelling

| Limitation | Detail |
|---|---|
| **Historical churn has no structured reason** | 56 of 76 events carry only free text; 20 carry nothing. The taxonomy only applies going forward |
| **One churn reason per account** | Real churn usually has several causes. The reason is on the client, not the event, so a re-churned account cannot carry two |
| **No health history** | `/reports/health` is explicitly "as of today". `health_score_snapshots` exists and is unused |
| **Health score 0 is ambiguous** | Genuinely bad, or no metrics available at all |
| **`clients.properties` is untyped JSONB** | Malformed data is caught only by each module's own normaliser. Not queryable across accounts |
| **Three task tables, two used** | `today_tasks`, `project_tasks`, and the unwritten `playbook_tasks` |
| **No timezone model** | Period membership compares `YYYY-MM-DD` prefixes; time of day and timezone are ignored |
| **NRR is meaningless early** | On first sync `previousArr = arr`. Structurally, not just imprecisely |
| **Unresolved use-case values** | Qiwa Disclosure (8 deals) and others have no canonical home — correctly surfaced, still unresolved |
| **`delivers` holds content that is never rendered** | Imported from the written Notion pages; kept so a layout change does not destroy real content |
| **`previousArr` is a legacy field** superseded by the ledger and still on the row |

## Observability

| Limitation | Detail |
|---|---|
| **No product analytics** | No SDK, no events, anywhere |
| **No sync monitoring or alerting** | A silently failing nightly job appears as stale numbers, not an error |
| **Cron summaries are not persisted** | Each route returns JSON that nothing records |
| **No error tracking service confirmed** | `instrumentation.ts` exists; what it registers was not verified |
| **No staleness indicator** except on the Usage tab |

## Testing

**Twenty test files, 233 tests** at `9d83a22` — up from 7 files / 124 tests on 2026-08-03.
The growth is almost entirely health: the engine, its status resolution, model overrides,
rule and signal language, support facts, the evidence rule and the recommendations panel.
Plus stakeholder facts and migration, task updates, and notification links.

**Still untested:** every permission gate · every ARR and retention formula · the import
parser · every page and **almost every server action** — including the destructive Use Case
Universe actions, whose pure functions are tested but whose guards, transactions and
revalidation are not.

**Tested but dead:** `lib/metrics/health.test.ts` and `health-cap.test.ts` — 21 tests over
`lib/metrics/health.ts`, which has had no importers since the engine switch. A green suite
vouching for a module nothing calls.

Several of these were **written as pure functions specifically to be testable** and simply
have no tests.

## Operations

| Limitation | Detail |
|---|---|
| **`drizzle/meta` is stale** | `db:generate` emits a full-schema baseline, not an incremental; applying it would clash with live tables. Use the reviewed extracted SQL, or `db:push` after reviewing its diff |
| **~40 ad-hoc maintenance scripts** have changed schema outside migrations | The migration history is not a complete record |
| **The README is stale** in four places | See [contradictions](contradictions.md#the-readme-describes-a-product-that-no-longer-exists-in-three-places) |
| **300s function ceiling** applies to the health-formula save, which recomputes the whole portfolio |

## Product scope

Signal does not: write back to HubSpot, Intercom or Metabase · send anything to customers ·
manage contracts, invoices or billing · predict churn · offer a public or customer-facing
surface · offer a mobile app · export reports (the URL is the sharing mechanism) · deliver
scheduled reports.

## Feature gaps worth naming

- No saved views or column configuration on the Clients directory.
- No bulk edit beyond owner assignment.
- No cross-account project view.
- No review workflow for use-case definitions — "Review overdue" states a fact and does
  nothing about it.
- No queue surfacing accounts that arrive unowned — the sync reports a count in a job
  response nobody reads.
- No way to un-dismiss an Action-list item that this pass identified.
- `/import` has no navigation entry.

---

## How to use this list

Anything here is fair to cite when scoping work. Nothing here has been fixed by documenting
it. When one is resolved, remove it in the same change and note it in the
[changelog](../releases/CHANGELOG.md).
