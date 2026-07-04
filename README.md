# Lumofy · Customer Success Dashboard

A tool for the Lumofy CSM team to **centralize client data**, **run playbooks**, and **report retention** (NRR / GRR / churn / downgrades / health) to upper management.

It unifies three sources per ARR customer:

| Source | Provides |
|---|---|
| **HubSpot** | The client list — companies where `lifecyclestage = customer` **and** `customer_type = arr`, plus owner (CSM), firmographics, and the ARR baseline. |
| **Intercom** | Support signals — open / snoozed / closed tickets, first-response time, CSAT (conversation ratings), and NPS. |
| **Metabase** | Product usage — seats, active users, adoption, WAU/MAU stickiness, feature adoption. |

Built on the **Lumofy Design System** (Cosmos/Halo/Sirius palette, Source Sans 3 + IBM Plex Sans/Arabic, brand logos) for a fully on-brand, bilingual-ready (LTR/RTL) UI.

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — Vercel-native.
- **Tailwind CSS v4** with the Lumofy tokens wired into `@theme`.
- **Clerk** for authentication (guarded — the app runs open in dev/sample mode).
- **Supabase Postgres** via **Drizzle ORM**.
- **lucide-react** icons, **recharts** (reporting), **date-fns**.

## Sample mode vs. live mode

The app is designed to run **before** any credentials exist:

- **Sample mode** (default): when `DATABASE_URL` is unset, pages serve a realistic seeded dataset derived from the real HubSpot ARR customers (`lib/sample/`). Auth is bypassed when Clerk keys are absent. The top bar shows a **“Sample data”** badge.
- **Live mode**: set `DATABASE_URL` (Supabase) and run a sync. Pages then read synced records. Add Clerk keys to enforce auth. The badge switches to **“Live data”**.

Each integration is **independently** live — add only the tokens you have; the rest stays seeded/empty.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in what you have (all optional for sample mode)
npm run dev                  # http://localhost:3000
```

With no `.env.local`, the app runs in full sample mode immediately.

### Going live

1. **Database (Supabase)** — create a project, then in `.env.local`:
   - `DATABASE_URL` → the **Connection pooling** string (Transaction, port `6543`).
   - `DIRECT_DATABASE_URL` → the **Direct connection** string (port `5432`, for migrations).
   - Create the tables: `npm run db:push` (or `npm run db:generate && npm run db:migrate`).
2. **Auth (Clerk)** — add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Restrict sign-ups to your domain in the Clerk dashboard (Restrictions → Allowlist).
3. **Integrations** — add the tokens you have:
   - `HUBSPOT_ACCESS_TOKEN` (Private App; scopes: companies, deals, owners read).
   - `INTERCOM_ACCESS_TOKEN` (+ `INTERCOM_REGION`).
   - `METABASE_URL` + `METABASE_API_KEY` (and `METABASE_USAGE_CARD_ID` for the usage question).
4. **Sync** — pull the data:
   ```bash
   curl -X POST http://localhost:3000/api/sync -H "Authorization: Bearer $SYNC_SECRET"
   curl http://localhost:3000/api/sync   # GET: which sources are configured
   ```

See `.env.example` for the full annotated list.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server. |
| `npm run build` / `start` | Production build / serve. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run db:push` | Push the Drizzle schema to Supabase (quick start). |
| `npm run db:generate` / `db:migrate` | Generate & apply SQL migrations. |

## Project structure

```
app/
  (app)/            App shell (sidebar + top bar) + pages
    page.tsx          Overview — portfolio KPIs, watchlist, renewals, activity
    clients/          Directory + 360° profile ([id])
    reports/          NRR / GRR / churn / downgrades + revenue bridge
    playbooks/        Playbook definitions + open tasks
  sign-in/          Clerk sign-in (guarded)
  api/sync/         Sync endpoint (HubSpot → Intercom → Metabase → DB)
components/         ui/ (Button, Card, Badge, …), layout/, clients/, brand/
lib/
  integrations/     hubspot.ts, intercom.ts, metabase.ts, sync.ts
  metrics/          health, retention (NRR/GRR), portfolio, derive
  db/               Drizzle schema + client
  repo/             Drizzle read/upsert
  sample/           Seeded dataset (real-derived)
  data.ts           Data facade (DB when configured, else sample)
  types.ts          Domain model
```

## Notes & known follow-ups

- **ARR baseline.** HubSpot has no single “current ARR” property here, so the sync uses `total_revenue` as a baseline. True ARR should be derived from recurring deals/subscriptions — wire this when finalizing the HubSpot connection.
- **NRR/GRR history.** On first sync, `previousArr = arr` (NRR ≈ 100%). The `arr_snapshots` table accrues monthly history so period-over-period retention becomes real over time. Sample mode ships pre-built deltas so the reports are populated.
- **Intercom NPS.** Not native to Intercom; if you run NPS via Intercom Surveys, point the sync at that export. CSAT is computed from conversation ratings (4–5 = satisfied).
- **Metabase mapping.** `mapUsageRow` tolerates common column names; align it to your usage question’s columns (join key = domain or HubSpot id).
- **Deployment.** Live on Vercel. Set the same env vars from `.env.local` in the Vercel project's Environment Variables — none of them ship in the repo.

## Cron jobs

Three scheduled jobs, defined in `vercel.json`, each guarded by `CRON_SECRET` (`Authorization: Bearer <CRON_SECRET>`): `/api/cron/sync` (HubSpot), `/api/cron/usage-sync` (Metabase), `/api/cron/profile-completeness` (daily by design). All three currently run once a day and every serverless function is capped at 300s — both are temporary constraints of the Vercel Hobby (free) plan, not the original design. See **[VERCEL-PLAN-CHANGES.md](./VERCEL-PLAN-CHANGES.md)** for the exact original values and the checklist to restore them when upgrading to Pro.

**Why "current" ≠ "intended":** Vercel's Hobby (free) plan rejects the whole deploy if *any* cron in `vercel.json` runs more than once a day. `sync` and `usage-sync` were designed to run every 4 hours (fresh HubSpot data, fast CSM auto-assignment on new companies), but are throttled to once/day until one of:
- **Upgrade to Vercel Pro** — restore `"0 */4 * * *"` / `"15 */4 * * *"` in `vercel.json` and redeploy. No other changes needed.
- **Wire an external scheduler** (e.g. [Upstash QStash](https://upstash.com), free tier) to call these two routes every 4 hours directly, and remove them from `vercel.json`'s `crons` array (keep `profile-completeness`, which is fine on Hobby as-is). Configure each QStash schedule with the destination URL and the `Authorization: Bearer <CRON_SECRET>` header.

Each route's file has a matching comment — start there when reverting.

## Design system

The full handoff lives in `design_system/` (git-ignored). Tokens are ported into `app/globals.css`; fonts in `public/fonts`, logos in `public/brand`. Compose with tokens (`text-fg`, `bg-surface`, `rounded-lg`, `font-display`) — never raw hex.
