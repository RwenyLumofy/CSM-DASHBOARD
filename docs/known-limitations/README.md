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
| **Ten use cases can have no adoption data at all** | GDP, IDPs, PIPs, AI Readiness, 360° Feedback, Career Coaching & Development Conversations, Career Transition Readiness, Employee Engagement & Feedback Measurement, Digital Transformation, and Hiring & Role-Based Assessments are absent from HubSpot's `use_cases` picklist, so no deal can declare them and the backfill has nothing to draw on. They will read "No clients yet" until a CSM records one on an account. This is a gap in the source system, not in the Universe — [`lib/use-cases.ts`](../../lib/use-cases.ts) documents the same drift |
| **A key removed from a data model is not a compile error** | The taxonomy was once a delta on the code-shipped list, and `overlay.renamed[id]` was how a shipped entry's label, category or summary was overridden. `7f731b7` rewrote the overlay as a flat database and removed `renamed`, so `normalizeOverlay` silently drops it. Everything the Use Case Definition Library had recorded there — 11 renames and category moves, 25 summaries — went with it, and the app fell back to the original shipped wording without anything failing. Repaired by [`scripts/reconcile-taxonomy-with-definition-library.mjs`](../../scripts/reconcile-taxonomy-with-definition-library.mjs). The general risk stands: `workspace_config` values are schemaless JSONB, so a key that stops being read produces stale output rather than an error. Any future change to a normalizer should ask what already-stored data it stops honouring |
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
| **`app/scratch-*` prototypes ship** | Prototype routes outside the product, with no navigation entry and no documentation. `/scratch-wf` was one of them, and it was a data leak. **Re-counted 2026-09-09 at `d45a6cd`: 26 tracked scratch routes**, of which **8 have no production guard and therefore ship in the production build** — `scratch-clients`, `scratch-health`, `scratch-insights`, `scratch-model-editor`, `scratch-pulse`, `scratch-settings`, `scratch-usage-v2`, `scratch-usecases`. The other 18 call `notFound()` when `NODE_ENV === "production"`. The newest, [`app/scratch-tech-stack/page.tsx`](../../app/scratch-tech-stack/page.tsx) (commit `d45a6cd`), is one of the guarded ones: it previews the Client Profile's [Tech stack](../product/client-profile/tech-stack.md) section against a hand-written properties bag — including, since 2026-09-10, a workspace with its own configured categories and a card rendering the Settings → Tech stack categories editor — with both the client `PATCH` and the admin config `PUT` stubbed in the browser, so nothing it does reaches a database. **It is not product.** Guarding the remaining eight is the outstanding work |
| **The read API has no rate limiting** | `/api/v1/*` (added 2026-10-18) accepts as many requests as the deployment will serve from any active key. Each list call reads a whole table into memory. Nothing throttles, counts or alerts on request volume; the only usage record is `api_keys.last_used_at`, at minute resolution. *Partially verified* — no limiter exists anywhere in `lib/api/` or `middleware.ts`. See [Signal API (v1)](../product/integrations/api-v1.md#known-limitations) |
| **API keys have no scopes** | Every active key reads every account, account task and expansion opportunity the API serves — the read scope of a super admin (`lib/api/read.ts` bypasses `lib/data.ts`'s per-user scoping by design). There is no per-endpoint, per-team or per-account key, and no expiry. A leaked key exposes the whole book until a super admin revokes it. This is why only super admins can issue keys ([decision 0025](../decisions/0025-a-read-only-integration-api-with-hashed-keys-and-stable-shapes.md)). *Partially verified* |
| **21 public tables had row level security off (fixed 2026-10-21; new tables can repeat it)** | The DDL files [`drizzle/contract-records.sql`](../../drizzle/contract-records.sql), [`drizzle/health-tables.sql`](../../drizzle/health-tables.sql) and [`drizzle/expansion-tables.sql`](../../drizzle/expansion-tables.sql) create tables without `ENABLE ROW LEVEL SECURITY`, so PostgREST serves them to anyone holding the anon key, which ships in the browser bundle for Storage. On the test database on 2026-10-18 that meant 21 of 60 public tables: `contract_records`, `client_status_overrides` and `contract_audit`, plus the 18 health-engine tables. The anon key returned real `contract_records` and `contract_audit` rows. [`drizzle/rls-enable-missing.sql`](../../drizzle/rls-enable-missing.sql) turns RLS on and adds no policies. It runs on top of the earlier RLS lockdown, [`drizzle/rls-lockdown.sql`](../../drizzle/rls-lockdown.sql) (PR #30), which covered the four expansion tables and seven others. The app connects as `postgres`, the table owner, so it still reads every row. Applied to the test database via [`scripts/rls-enable-missing.mjs`](../../scripts/rls-enable-missing.mjs), and to **production on 2026-10-21** by pasting both SQL files into the Supabase SQL editor (reported by the person who ran them; the closing `SELECT`, which should return no rows, was not re-checked independently). Each new public table still needs its own `ENABLE` line, because the DDL files that caused this have not been changed |
| **Env files in the working tree** | `.env.clone`, `.env.local`, `.env.local.bak` sit in the working directory. **Verified 2026-07-31: all three are gitignored** (`.gitignore:24,86,87`), so this is a local-machine concern, not a repository leak |

## Auditability

| Limitation | Detail |
|---|---|
| **No configuration audit trail** | Changing the health formula silently rescores every account. No record of who, when, or from what |
| **No audit on role, scope or owner changes** | A notification is emitted for automated assignment; nothing is kept |
| **`health_audit_logs` is defined and unwritten** | |
| **The ARR ledger is the only reconstructible history** | Because it is modelled as events. Nothing else is |
| **No import audit and no undo** | A bad import is corrected by hand or by script |
| **Most task edits leave no history** | Since 2026-09-13 a change to a task's **due date, owner or status** is written into its update thread as a `task_updates` row (`due_date_changed`, `reassigned`, `status_changed`), in the same transaction as the change, and no one — admins included — can remove it (`lib/task-activity.ts`, `lib/repo/drizzle.ts`). **Title, notes, priority, focus-area and account-link changes are still unrecorded**: they overwrite `today_tasks` in place, so a task can be rewritten into different work with only `updated_at` as a trace. Also unrecorded: creation and deletion — and deleting a task leaves its history rows orphaned and unreachable. History begins when the change deploys; nothing before it can be reconstructed. The thread, history included, is invisible to Guests. See [Account Tasks](../product/client-profile/account-tasks.md#known-limitations). Added 2026-09-13; rewritten 2026-09-13 when due-date, owner and status history was built |

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
| **The Contract tab's global-library list is hardcoded and can drift from HubSpot** | *Global library* on a sale or renewal offers a list written into [`ContractTab.tsx`](../../app/%28app%29/clients/[id]/contract/ContractTab.tsx) (`LIBRARIES`), **not** the synced `deal_global_libraries` options. A provider added to or removed from HubSpot's picklist never reaches the field, and until 2026-10-18 the two lists matched by coincidence, so the drift was invisible. Since 2026-10-18 a CSM can **type** an unsuggested provider, which works around a missing name but does not close the drift. Typing is available both when editing a sale or renewal record and in the Record-a-renewal/downgrade drawer; it stays read-only on a saved expansion or downgrade record. A third list, `DEAL_FIELD_FALLBACK_OPTIONS.globalLibraryPackage` in [`lib/deal-overrides.ts`](../../lib/deal-overrides.ts), disagrees with both and is ignored once any synced option exists — so adding EdX there does not put it on the deal card. That file's own `globalLibraryPackage` comment was corrected on 2026-10-18 to say so; its module header still claims the list is unioned with the synced options and was not touched. See [contradictions](contradictions.md#three-vocabularies-for-a-global-library-provider). Added 2026-10-18 |
| **CS-pipeline deals synced before 2026-10-22 still carry live ARR, and nothing will clean them up** | The sync stopped pulling renewals, expansions, downgrades and churn from HubSpot's CS pipeline on 2026-10-22 ([decision 0026](../decisions/0026-hubspot-owns-the-closed-won-sale-signal-owns-every-movement-after-it.md)), but the rows already synced were **deliberately** left untouched — still on their accounts, still `tracked`, still counted. An account's stored ARR is the sum of its tracked deals plus its non-HubSpot ledger events ([ARR R1a](../business-rules/arr-and-revenue-movement.md#r1a--the-materialised-arr-on-a-client-row-is-tracked-deals--non-hubspot-events)), so stripping them would have dropped real ARR across 19 accounts while contract records are still preview-only. In the local production clone: **21 tracked CS deals, 19 accounts, $371,720**. Retiring the rows belongs to the contract-records switch-over. Added 2026-10-22 |
| **A renewal that synced before 2026-10-22 may still be double-counting ARR, and only a human can fix it** | A CS *Renewed* deal arrived `tracked = true` on top of the sale it replaced, so the account counted both until a CSM unticked the superseded deal on the Contracts & deals card. The 2026-10-22 change stops new ones arriving; **it does not untick anything**. At least one production account is expected to be double-counted right now — the account whose renewal triggered the change. That cannot be confirmed from this repository: the local clone predates the renewal and production reads were blocked in the session that made the change, so production's current state is **inferred, not read**. Someone with production access should check the accounts holding a tracked CS renewal alongside a tracked sale and untick the superseded row. Added 2026-10-22 |
| **A completeness gap is reported for the account, so a blank new deal is not flagged** | Since 2026-10-22 a per-deal completeness field is missing only when **no** deal on the account holds it ([R2](../business-rules/profile-completeness.md#r2--scope-rule-every-deal-on-the-account-and-a-field-is-missing-only-when-none-holds-it), [decision 0027](../decisions/0027-a-completeness-gap-belongs-to-the-account-not-to-a-deal-row.md)). A value on an **older** deal therefore satisfies the check for a **newer** one: a brand-new deal left entirely blank raises no badge and no Action-list item while an earlier deal carries the same fields. This is the accepted trade — the three narrower rules tried instead each reported gaps in data the team demonstrably has, two of them turning 16 of 132 accounts red — and the relaxation **cannot be tightened back** within this rule; per-deal gaps would need a second indicator. The Contract tab's *Account setup* checklist is the record-level one that exists today. Added 2026-10-22 |
| **Two completeness indicators disagree by design, and nothing says so in the product** | The profile badge is account-level and reads HubSpot **deals**; the Contract tab's *Account setup* card is record-level, reads **contract records**, and checks a partly different list of eight items (*Modules you start with* and *Support amount* are on it and not on the badge; licences, user price, use case, AI credits, contract start and the five client-level fields are on the badge and not on it). An account can show a green badge beside "5 of 8 filled in", or the reverse. Compared in [Client Profile → the badge](../product/client-profile/README.md#the-profile-completeness-badge-is-an-account-level-indicator). Whether a CSM should be told why they differ is an open product question. Added 2026-10-22 |
| **No renewal raises ARR by itself any more** | Nothing arrives from HubSpot to raise it, and contract records do not feed live ARR until the switch is on, so a renewal's increase must be entered by hand. An expansion has a deliberate path ("Add this to the account's ARR now" on the [Expansion board](../product/expansion/README.md)); a renewal has none. Added 2026-10-22 |
| **"SMB" means "small **or** unknown" — 37 accounts have no headcount at all** | An account's segment is derived from its headcount at 250 and 50 employees, and an **unknown** headcount yields `smb` rather than an "unknown" band ([segmentation R1](../business-rules/segmentation.md#r1--headcount-decides-the-band-at-250-and-50)). In the local production clone **37 accounts have no headcount**, so they are counted as small companies by everything that groups by segment — the churn segment gradient, the Insights segment filter, Today's account tier and the `/api/v1/accounts` filter. Pre-existing, and **deliberately left alone** on 2026-10-28: [`lib/segment.test.ts`](../../lib/segment.test.ts) now *pins* the behaviour so the next change to it is a decision rather than a side effect. Fixing it means adding an `unknown` segment that every consumer would have to understand — at least [`lib/metrics/exec.ts`](../../lib/metrics/exec.ts) (filter + options), [`lib/metrics/churn.ts`](../../lib/metrics/churn.ts) (by-segment slices), [`lib/today/build.ts`](../../lib/today/build.ts) → `tierFor` (which returns the segment as the account **tier**, so `AccountTier` in [`lib/today/types.ts`](../../lib/today/types.ts) gains a value too), and [`lib/api/serialize.ts`](../../lib/api/serialize.ts), whose three-value `segment` enum is a **published API shape** ([api-v1](../product/integrations/api-v1.md)). The clone is a production clone but is dated, so the 37 is indicative, not a production count. Added 2026-10-28 |
| **A local entity of a global company needs a human to correct it, and nothing prompts anyone to** | HubSpot holds one headcount per company record, and for a local entity that number is the **group's**. The case that prompted the 2026-10-28 change read **Enterprise on $44,520 of ARR** because its HubSpot record carries 100,000 employees. Signal cannot infer a local headcount and does not try. The fix is a human one: correct the *Employees* field on Client Profile → General information, or set *Segment* by hand, which pins it against every future recompute ([segmentation R2](../business-rules/segmentation.md#r2--the-segment-follows-the-headcount-unless-a-human-set-the-segment), [decision 0028](../decisions/0028-the-segment-follows-the-headcount-unless-a-human-sets-it.md)). **Nothing surfaces the need.** There is no signal, no completeness field and no Action-list item for an implausible segment, and the band is invisible on the account anyway — segment is not a column in the Clients directory and not a field on the Client Profile, so a CSM sees it only in the Edit account drawer, the directory's CSV export, the weekly Notion export or the API. An account stays mis-banded until somebody happens to look. Added 2026-10-28 |
| **A wrong segment does not heal on its own, and spurious overrides already in the data still exclude accounts** | The segment is recomputed when the sync assembles an account, when `recomputeClient` runs, or when a CSM saves a headcount — so a sales-only sync may leave an affected account wrong for a long time. [`scripts/apply-segment-recompute.mts`](../../scripts/apply-segment-recompute.mts) is the re-runnable backfill for the existing rows (`--dry` to preview), and it **skips any account whose `segment` is in `__field_overrides`**. Until later the same day, the Edit account drawer wrote that mark on **every** save whether or not anyone touched the Segment select; the repository now compares the incoming segment against the stored one and marks it only when it differs ([segmentation R3a](../business-rules/segmentation.md#r3a--the-segment-is-compared-not-just-received), [contradictions — RESOLVED](contradictions.md#correcting-a-headcount-moves-the-segment-on-one-screen-and-pins-it-on-the-other--resolved)). **That stops new spurious marks; it does not clear the ones already written.** Any account carrying one is still read as a deliberate human choice and is still excluded from the derivation *and* from the backfill, with nobody having chosen its band — so a backfill reporting "nothing to correct" does not prove every band is right. How many accounts are in that state is **not known**: it needs a read of `clients.properties->'__field_overrides'` across the book, which could not be run (production reads blocked). Added 2026-10-28 |
| **One Edit-account-drawer save pins every core field on that account against the HubSpot sync** | The drawer posts `name`, `domain`, `industry`, `country`, `employees` and `startedAt` on every save, changed or not, and `updateClientFields` marks each one in `__field_overrides` merely because it was sent — the comparison added for `segment` on 2026-10-28 was **deliberately not** extended to the others. For these fields the mark only stops the sync overwriting the column, which is the direction a CSM would want, so it is the lesser problem; the cost is that HubSpot can no longer correct a field nobody deliberately set. An account whose *Industry* was blank in the drawer when somebody saved it keeps the blank even after the value is filled in HubSpot. Pre-existing, stated in the code, and unmeasured. [segmentation inconsistency 2](../business-rules/segmentation.md#2-every-other-core-field-is-still-marked-whether-or-not-it-changed). Added 2026-10-28 |
| **The recurring HubSpot sync does not re-discover existing accounts** | Since 2026-09-21 the incremental sync also finds qualifying companies from a change to the **company** record, not only from a change to a Closed Won deal — closing the gap where a deal won before the company's `customer_type`/lifecycle stage qualified left the account permanently missing. It adds **new accounts only**: a reactivated account that already has a Signal row still needs `POST /api/add-account` or a deal edit. A company corrected before the fix deployed, and not modified since, is not caught either; nor is anything on the first, checkpoint-initialising run (`lib/integrations/sync.ts` → `buildUnifiedData`). See [Integrations and sync](../product/integrations/README.md#how-the-recurring-sync-discovers-new-accounts). Added 2026-09-21 |

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

**The two counts above are stale.** `npm test` on 2026-10-22 (`f8b8d4c` + working tree on
`fix/completeness-reads-the-sale`) runs **402 tests, all passing**, across far more than seven
files. Recounting them is an audit pass, not this change. One item from the "Untested" list
moved on 2026-10-22: **profile completeness has its first tests** — **seven**, in
[`lib/profile-completeness.test.ts`](../../lib/profile-completeness.test.ts), covering which
deals answer for an account
([R2](../business-rules/profile-completeness.md#r2--scope-rule-every-deal-on-the-account-and-a-field-is-missing-only-when-none-holds-it))
and nothing else in that module — not the field lists, not the severity gate, not a single
downstream consumer. Five of those tests shipped in the morning for the superseded R2a rule;
two were added in the afternoon for the production case and its mirror. The HubSpot sync itself
still has no test, so the change that stopped it pulling CS-pipeline deals is verified only by
reading and by its effect on completeness.

**Re-counted 2026-10-28** at `19511e6` plus the working-tree change on
`fix/segment-follows-headcount`: **407 tests, all passing**. The five new ones are
[`lib/segment.test.ts`](../../lib/segment.test.ts) — **account segmentation's first tests**,
covering the thresholds, the hand-set escape hatch and the pinned unknown-reads-as-SMB
behaviour ([segmentation R1 and R2](../business-rules/segmentation.md)). Still untested in that
area: every write path, the backfill script, and every consumer that groups by segment. A full
recount of files remains an audit pass.

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
scheduled reports. *(Since 2026-10-18 there is an **internal**, read-only, key-authenticated
API for Lumofy's own tools — [Signal API (v1)](../product/integrations/api-v1.md). It is not
customer-facing and does not change this list.)*

## Feature gaps worth naming

- No saved views or column configuration on the Clients directory.
- No bulk edit beyond owner assignment.
- No cross-account project view.
- No review workflow for use-case definitions — "Review overdue" states a fact and does
  nothing about it.
- No queue surfacing assignment decisions stuck in `needs_admin`.
- No way to un-dismiss an Action-list item that this pass identified.
- `/import` has no navigation entry.
- The [tech stack](../product/client-profile/tech-stack.md) recorded on an account is
  readable only by opening that account — no directory column, no filter, no Insights
  panel, no export, and no contribution to profile completeness. "Which of our accounts run
  Workday?" is a database query, not a product question, and tool names are free text with
  no spelling reconciliation.

---

## How to use this list

Anything here is fair to cite when scoping work. Nothing here has been fixed by documenting
it. When one is resolved, remove it in the same change and note it in the
[changelog](../releases/CHANGELOG.md).
