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
- **New logos trigger assignment** — `persistSync` → `runAssignment(newClientIds)`, so a
  brand-new company gets an owner without a human step.
- **Malformed numbers are not silently discarded** (commit `86e5e4f`).
- `sync_checkpoints` records how far the last run got.

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

Sync → assignment → notifications. Usage sync → health inputs. Survey sync → satisfaction
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
