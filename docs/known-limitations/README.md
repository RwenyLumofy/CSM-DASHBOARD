# Known limitations

Honest list of what Signal does not do, does badly, or does inconsistently — including
things nobody has filed.

**Last verified:** 2026-07-31 · **Commit:** `15329e3`

Contradictions have their own file: [contradictions.md](contradictions.md).

---

## Outstanding work that has landed in code but not in production

| Item | Detail |
|---|---|
| **The use-case adoption backfill has not been run against production** | [`scripts/backfill-use-case-implementations.mjs`](../../scripts/backfill-use-case-implementations.mjs) has been applied to the **clone database only** — 85 associations across 38 accounts, covering 19 of 29 use cases. Until it runs against production, the Use Case Universe there reads "No clients yet" for most of the library while the workspace has known the answer for months. The script is dry-run by default (`--yes` to write), idempotent, and never modifies an existing record, so a production run is repeatable and cannot overwrite a CSM's own objective. Landed in `7f731b7` |
| **Ten use cases can have no adoption data at all** | GDP, IDPs, PIPs, AI Readiness, 360° Feedback, Career Coaching, Career Transition Readiness, Culture & Engagement, Digital Transformation, and Hiring & Role-Based Assessments are absent from HubSpot's `use_cases` picklist, so no deal can declare them and the backfill has nothing to draw on. They will read "No clients yet" until a CSM records one on an account. This is a gap in the source system, not in the Universe — [`lib/use-cases.ts`](../../lib/use-cases.ts) documents the same drift |
| **`scripts/restore-orphaned-use-cases.mjs` is a one-off repair, not a migration** | It exists to rescue environments damaged by the pre-`7f731b7` orphaning bug. Whether any environment other than the clone still needs it has not been established |
| **The health-engine schema is tracked but unwired** | `lib/db/health-schema.ts` and the `drizzle/health-*.sql` files were committed in `15329e3`. Nothing shipped writes them. See [health-engine.md](../health-engine.md) |

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

Seven test files, 124 tests: five use-case modules (`use-cases`, `use-case-overlay`,
`use-case-status`, `use-case-transfer`, `use-case-implementation`), the health engine, and
stakeholder coverage.

**Untested:** every permission gate · every ARR and retention formula · the live health
formula · the signal engine · the assignment engine · the import parser · every page and
**every server action** — including the destructive Use Case Universe actions, whose pure
functions are tested but whose guards, transactions and revalidation are not.

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
