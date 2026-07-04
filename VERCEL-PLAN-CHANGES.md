# Vercel Hobby plan — temporary changes (revert when upgrading to Pro)

**Why this file exists.** This app was first deployed on Vercel's free Hobby plan (2026-07-05), which enforces two hard limits the original design exceeded. Two changes were made purely to fit those limits — not because the original design was wrong. This file is the single source of truth for what changed, the exact original values, and how to put them back once the account upgrades to Pro.

## 1. Cron cadence — `vercel.json`

| Route | Pro-plan value (original design) | Current Hobby value |
|---|---|---|
| `/api/cron/sync` | `0 */4 * * *` (every 4 hours) | `0 6 * * *` (once daily) |
| `/api/cron/usage-sync` | `15 */4 * * *` (every 4 hours) | `20 6 * * *` (once daily) |
| `/api/cron/profile-completeness` | `0 6 * * *` — **not a Hobby workaround**, this route was always meant to run once a day | `0 7 * * *` (still once daily — only shifted an hour later than its original design, so it runs *after* `sync` and reflects that day's fresh deal data instead of yesterday's) |

**Reason:** Vercel Hobby rejects the entire deploy if *any* cron in `vercel.json` runs more than once a day.

## 2. Function duration ceiling — `maxDuration` in each route file

| File | Pro-plan value (original design) | Current Hobby value |
|---|---|---|
| `app/api/cron/sync/route.ts` | `800` | `300` |
| `app/api/cron/usage-sync/route.ts` | `800` | `300` |
| `app/api/sync/route.ts` (manual/legacy sync trigger, not on a cron) | `800` | `300` |
| `app/api/cron/profile-completeness/route.ts` | `300` — unchanged, this route was always short-running | `300` |
| `app/api/import/clients/route.ts` | `60` — unchanged | `60` |

**Reason:** Vercel Hobby caps every serverless function at 300 seconds max, regardless of how it's triggered. A higher value fails the whole deploy, not just that route.

## Is it safe to revert these independently?

Yes — in any order, and there is **no corruption risk either way**. The sync logic is idempotent and checkpoint-based: HubSpot sync tracks a `last_synced_at` checkpoint and only re-derives/upserts data (never appends duplicates), and ARR/status/health are recomputed fresh from source data on every run. If a run gets cut off by `maxDuration`, it simply does less work that cycle — it never leaves a half-written or corrupt row. The next run (whichever cadence is active) picks up cleanly.

That said, for the app to actually behave the way it was designed once you're back on Pro, **raise both together**:
- Raising `maxDuration` alone (back to 800) without raising cron cadence just gives the once-daily run more headroom to finish — safe on its own, and a reasonable thing to do even if you want to stay on daily cadence for cost reasons.
- Raising cron cadence alone (back to every 4 hours) **without** raising `maxDuration` is the one combination to avoid: if a full sync genuinely needs more than 5 minutes, it will get silently truncated on *every single 4-hourly run*, quietly under-syncing forever instead of just occasionally. Not corruption, but a real regression that's easy to miss since each run still returns `200 OK` — it just does less than it should.

## Full revert checklist (when upgrading to Vercel Pro)

1. In `vercel.json`, restore:
   - `/api/cron/sync` → `"0 */4 * * *"`
   - `/api/cron/usage-sync` → `"15 */4 * * *"`
   - (leave `/api/cron/profile-completeness` at `"0 7 * * *"` — that hour-later offset from `sync` is a real improvement, independent of the plan)
2. In these three files, change `maxDuration = 300` back to `800`:
   - `app/api/cron/sync/route.ts`
   - `app/api/cron/usage-sync/route.ts`
   - `app/api/sync/route.ts`
3. The "Intended cadence… currently throttled" comments in those route files can be deleted at that point, or left as historical context.
4. Commit, push, redeploy.
5. Delete this file (or add a note that the revert is complete) once done, so it doesn't go stale.
