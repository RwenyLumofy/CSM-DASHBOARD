# Integrations and sync

**Status:** Partially verified

## Summary

Three read-only source systems feed Signal — HubSpot, Intercom and Metabase — plus Gemini
for action wording and Supabase Storage for attachments. Seven Vercel Cron jobs keep the
data current. **Signal never writes back to any of them.**

## Purpose

Signal's value is that the account book is assembled once, on a schedule, instead of by a
CSM opening three tabs.

## Intended users

Super Admins configure and trigger. Everyone consumes the result.

## Entry points

- **Route:** `/settings?tab=integrations`
- **API:** `POST /api/sync` (bearer `SYNC_SECRET`), `GET /api/sync` (which sources are
  configured)
- **Cron:** seven routes under `/api/cron/`

## The sources

| Source | Provides | Configured by | Independently live? |
|---|---|---|---|
| **HubSpot** | Customer list (`lifecyclestage = customer` **and** `customer_type = arr`), owner (CSM), firmographics, deals and contract fields, the ARR baseline, contacts | `HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_PORTAL_ID` | Yes |
| **Intercom** | Open/snoozed/closed tickets, first-response time, CSAT (conversation ratings, 4–5 = satisfied), NPS via Surveys | `INTERCOM_ACCESS_TOKEN`, `INTERCOM_REGION` | Yes |
| **Metabase** | Product usage — seats, active users, adoption, WAU/MAU stickiness, feature adoption | `METABASE_URL`, `METABASE_API_KEY`, `METABASE_USAGE_CARD_ID` | Yes |
| **Gemini** | Rewrites Action list wording only | `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`) | Optional — templates work without it |
| **Supabase Storage** | Client attachment hosting | `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional |

Each integration is **independently live**: add only the tokens you have, and the rest stays
empty. `lib/config.ts` → `integrations` reports which are configured.

## The schedule

`vercel.json` — seven crons, ordered so each reads the previous one's output:

| Time | Route | Does |
|---|---|---|
| `0 */4 * * *` | `/api/cron/sync` | HubSpot sync (every 4 hours) |
| `15 */4 * * *` | `/api/cron/usage-sync` | Metabase usage (every 4 hours) |
| `30 5 * * *` | `/api/cron/survey-sync` | Intercom surveys |
| `0 6 * * *` | `/api/cron/intercom-sync` | Intercom tickets |
| `0 7 * * *` | `/api/cron/profile-completeness` | Completeness sweep → notifications |
| `0 8 * * *` | `/api/cron/client-actions` | Regenerate the Action list |
| `0 9 * * *` | `/api/cron/client-health` | Recompute health |

**The README is stale here.** It describes three crons throttled to once a day by the
Vercel Hobby plan and links to `VERCEL-PLAN-CHANGES.md`, **which does not exist in the
repository**. The current `vercel.json` has seven crons, five of them sub-daily, which the
Hobby plan would reject — so the project is on a paid plan and the README was never
updated. Treat `vercel.json` as the truth.

Region is `bom1`. Every serverless function is capped at 300s (`maxDuration = 300` on the
cron routes and on `/settings`).

## Authentication of the pipeline

Cron routes are **excluded from Clerk protection** in `middleware.ts` — Vercel's scheduler
never has a session, and `auth.protect()` would 404 the request before the handler's own
check could run.

Each route instead checks `Authorization: Bearer <CRON_SECRET>`. An **unset `CRON_SECRET`
is a 503 refusal in production**, not a free pass — previously an unset secret skipped the
check entirely, leaving every cron route open, and `.env.example` never prompted for the
variable.

`/api/sync`, `/api/churn-import`, `/api/add-account` and `/api/usage-refresh` are public to
middleware for the same reason and gated by `SYNC_SECRET`/`CRON_SECRET` bearer checks.

## Sync behaviour

`lib/integrations/sync.ts` → `buildUnifiedData()` then `persistSync()`.

- **Read-only in all three directions.** No write-back.
- **In-app edits become overrides**, layered on read (`lib/deal-overrides.ts`), so a synced
  value is never destroyed by a CSM's correction — and equally, a CSM's correction never
  reaches HubSpot.
- **New logos arrive unowned.** The auto-assignment engine was removed in `07db772`; a
  brand-new client is inserted with no CSM or Implementation owner, and the sync adds a
  warning with the count that need one (`lib/integrations/sync.ts` → `runSync`). Owners
  are then set deliberately in-app. *(Corrected 2026-09-21 — this line previously said new
  logos triggered `runAssignment`, which no longer exists.)*
- **Malformed numbers are not silently discarded** (commit `86e5e4f`).
- `sync_checkpoints` records how far the last run got.

### How the recurring sync discovers new accounts

**Status:** Partially verified — implementation read end to end
(`app/api/cron/sync` → `runSync` → `buildUnifiedData` → `HubSpotClient`); no test covers
it. Re-verified 2026-09-21 against uncommitted changes on top of `580e0b7`.

**Qualification rule** (unchanged). A HubSpot company becomes a Signal account only if its
`customer_type` contains "arr" (case-insensitive) **and** its `lifecyclestage` is
`customer`, and it has at least one Closed Won deal in the Direct or Indirect pipeline.
A company that fails the rule is skipped with a sync warning, never force-added
(`lib/integrations/hubspot.ts` → `fetchAcquisition`, `fetchAcquisitionByCompanyIds`).

**Window.** Each run after the first searches from the last checkpoint minus a one-hour
safety buffer (HubSpot's search index is eventually consistent). The **first run** only
initialises the checkpoint — it imports no historical accounts
(`lib/integrations/sync.ts` → `runSync`).

**Two discovery paths on every incremental run:**

1. **Deal side** — Closed Won deals in Direct/Indirect whose deal `hs_lastmodifieddate`
   falls in the window; each deal's company is then checked against the rule
   (`fetchAcquisition`).
2. **Company side** (added 2026-09-21) — companies whose **company** `hs_lastmodifieddate`
   falls in the window, with `lifecyclestage = customer` and `customer_type` containing
   "arr" (`fetchQualifiedCompanyIdsModifiedSince`). Companies already found by path 1 in
   this run, or already present in Signal (any `clients` row with that HubSpot id,
   churned rows included), are dropped. The rest go through the same by-company
   assembly used by `/api/add-account` (`fetchAcquisitionByCompanyIds`), and only those
   with at least one qualifying Closed Won deal are added. A warning line reports how many
   were picked up this way. If this step fails, the failure is reported as a sync warning
   and the rest of the sync completes (`buildUnifiedData`).

**Why path 2 exists.** Path 1 only re-examines a company when one of its *deals* changes.
If a deal was marked Closed Won *before* the company's `customer_type` or lifecycle stage
qualified, the company was skipped on that run and — because fixing the company record
does not modify the deal — never examined again. Before 2026-09-21 the only remedy was a
manual `POST /api/add-account`. Newly discovered companies flow into `persistSync` like any
other new logo, so they get `new_business` ARR events and arrive unowned, counted in the
"need a CSM and an Implementation owner" warning.

**Limits of path 2:**

- **New accounts only.** It never re-processes a company that already has a Signal row. A
  reactivated existing account still needs `/api/add-account` or an edit to its deal.
- **The company record must change inside a sync window after deployment.** A company
  corrected before the fix shipped, and not touched since, is not caught — use
  `/api/add-account` once.
- **Not on the first run**, which only initialises the checkpoint.
- **Any company edit counts.** The window is the company's last-modified date, so an
  unrelated edit to a long-qualified company that was never imported will also bring it in
  — consistent with the qualification rule, since such a company meets it. Whether this
  catch-up is desired has not been confirmed with the team.

## Known data caveats (from README and code)

- **ARR baseline.** HubSpot has no single "current ARR" property here, so the sync used
  `total_revenue` as a baseline. Current ARR is now the **ARR event ledger** balance;
  HubSpot only contributes `new_business` events (Closed Won in Direct/Indirect pipelines).
  See [arr-and-revenue-movement](../../business-rules/arr-and-revenue-movement.md).
- **NRR/GRR history.** On first sync `previousArr = arr`, so NRR ≈ 100% until
  `arr_snapshots` accrues real history.
- **Intercom NPS** is not native to Intercom; it comes from Intercom Surveys. CSAT is
  computed from conversation ratings.
- **Metabase mapping.** `mapUsageRow` tolerates common column names and must be aligned to
  the usage question's columns. Join key is domain or HubSpot id.
- **CSAT and NPS are null for every client today**, so the satisfaction health metrics
  contribute nothing while still holding weight.

## Permissions

- **View integration status:** everyone (Integrations tab is ungated at the tab level).
- **Secrets and full re-sync:** Super Admin only.
- **Cron and backfill routes:** bearer secret; no user session involved.

## Automations and side effects

Sync → new-client "needs an owner" warning (no automatic assignment since `07db772`). Usage sync → health inputs. Survey sync → satisfaction
inputs. Profile completeness → notifications and Action list items.

## Data model

`sync_checkpoints` · `clients` · `client_deals` · `client_contacts` · `client_emails` ·
`client_meetings` · `client_usage_snapshots` · `client_usage_monthly` ·
`survey_responses` · `arr_events`.

## Technical implementation

| Concern | File |
|---|---|
| HubSpot | `lib/integrations/hubspot.ts` |
| Intercom | `lib/integrations/intercom.ts`, `intercom-surveys.ts` |
| Metabase | `lib/integrations/metabase.ts`, `lib/usage/sync.ts` |
| Orchestration | `lib/integrations/sync.ts` |
| Gemini | `lib/integrations/gemini.ts` |
| Storage | `lib/integrations/supabase-storage.ts` |
| Support sync | `lib/support/sync.ts`, `survey-sync.ts` |
| Routes | `app/api/sync/route.ts`, `app/api/cron/*/route.ts` |
| Config | `lib/config.ts`, `.env.example`, `vercel.json` |
| Admin UI | `components/settings/SyncManager.tsx` |

Operational scripts (run by an operator, not the app): `scripts/full-resync.mjs`,
`wipe-and-resync.mjs`, `audit-sync.mjs`, `verify-usage-metabase.mjs`,
`diagnose-usage-intercom-links.mjs`, `clone-prod-db.sh`.

## Analytics and observability

Each cron returns a JSON summary in its HTTP response. **Nothing is persisted, aggregated
or alerted on.** Failures are `console.error`. There is no sync-failure notification, no
staleness badge outside the Usage tab, and no dashboard of run history.

## Known limitations

1. **No sync monitoring or alerting.** A silently failing nightly job would show up as
   stale numbers, not as an error.
2. **Read-only means divergence is invisible.** A field corrected in Signal and left wrong
   in HubSpot stays wrong in HubSpot, with no indication in either system.
3. **The README's cron and sample-mode sections are stale.**
4. **`VERCEL-PLAN-CHANGES.md` is referenced and does not exist.**
5. **`drizzle/meta` is stale**, so `db:generate` emits a full-schema baseline rather than an
   incremental — applying it would clash with live tables. Documented in
   `docs/health-engine.md`; it is a real migration hazard for anyone following the README.
6. **Secrets handling** — `.env.clone`, `.env.local` and `.env.local.bak` exist in the
   working directory. **Verified 2026-07-31: all three are gitignored**
   (`.gitignore:24,86,87`). A local-machine concern, not a repository leak.
7. **Existing accounts are not re-discovered by the recurring sync.** Company-side
   discovery (2026-09-21) catches only companies not yet in Signal, and only when their
   company record changes after deployment. Reactivations of existing rows, and companies
   fixed before deployment, still need a one-off `POST /api/add-account`. See
   [How the recurring sync discovers new accounts](#how-the-recurring-sync-discovers-new-accounts).

## Open questions

- Is write-back to HubSpot ever intended, or is one-way permanent? This determines whether
  deal overrides are a workaround or the design.
- Should sync failures notify a Super Admin in-app?

## Source references

`lib/integrations/*` · `lib/config.ts` · `vercel.json` · `middleware.ts` ·
`app/api/sync/route.ts` · `app/api/cron/*` · `README.md` · `lib/deal-overrides.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
