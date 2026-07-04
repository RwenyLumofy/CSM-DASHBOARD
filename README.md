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
- **Deployment.** Vercel-ready, but **not deployed yet** by request. Set the same env vars in Vercel and add a Cron Job hitting `POST /api/sync` (with `SYNC_SECRET`).

## Design system

The full handoff lives in `design_system/` (git-ignored). Tokens are ported into `app/globals.css`; fonts in `public/fonts`, logos in `public/brand`. Compose with tokens (`text-fg`, `bg-surface`, `rounded-lg`, `font-display`) — never raw hex.
