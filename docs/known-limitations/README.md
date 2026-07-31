# Known limitations

Honest list of what Signal does not do, does badly, or does inconsistently — including
things nobody has filed.

**Last verified:** 2026-07-31 · **Commit:** `4214349`

Contradictions have their own file: [contradictions.md](contradictions.md).

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
| **No audit on role, scope or owner changes** | A notification is emitted for automated assignment; nothing is kept |
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

Six test files: four use-case modules, the health engine, stakeholder coverage.

**Untested:** every permission gate · every ARR and retention formula · the live health
formula · the signal engine · the assignment engine · the import parser · every page and
server action.

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
- No queue surfacing assignment decisions stuck in `needs_admin`.
- No way to un-dismiss an Action-list item that this pass identified.
- `/import` has no navigation entry.

---

## How to use this list

Anything here is fair to cite when scoping work. Nothing here has been fixed by documenting
it. When one is resolved, remove it in the same change and note it in the
[changelog](../releases/CHANGELOG.md).
