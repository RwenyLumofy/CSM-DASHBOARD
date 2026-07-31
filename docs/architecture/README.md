# Architecture

**Status:** Partially verified · **Last verified:** 2026-07-31 · **Commit:** `4214349`

Enough architecture to understand how product behaviour is implemented and maintained. Not
a line-by-line reference.

---

## 1. Shape

A single Next.js 15 App Router application. **No separate backend.** Server Components read
data directly; Server Actions write it. A small number of REST routes exist for the
scheduler, integrations and backfills.

```
app/
  (app)/          Authenticated shell — sidebar, top bar, pages
  api/            REST: sync, cron, admin, import, backfills
  sign-in/        Clerk
  scratch-*/      Prototypes, outside the shell — not product
components/       ui/ layout/ clients/ today/ reports/ settings/ …
lib/
  auth.ts roles.ts config.ts        Identity, permissions, runtime mode
  data.ts                           The data facade — the read/write entry point
  repo/                             Drizzle read/upsert
  db/                               Schema + client
  integrations/                     HubSpot, Intercom, Metabase, Gemini, Storage
  metrics/                          ARR, retention, churn, health, portfolio, exec
  health/                           The config-driven engine (unwired) + CS Pulse (live)
  today/ actions/ projects/ stakeholders/ usage/ notes/ assignment/ import/
drizzle/          Migrations + hand-maintained SQL
scripts/          ~40 one-off maintenance scripts
```

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript 5.7 |
| Styling | Tailwind CSS v4 with Lumofy design tokens in `@theme` |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase Postgres via Drizzle ORM + `postgres` driver |
| Validation | Zod |
| Rich text | TipTap + `sanitize-html` |
| Spreadsheets | `xlsx` |
| Icons | `lucide-react` |
| Dates | `date-fns` |
| Deploy | Vercel, region `bom1` |
| Tests | Node's built-in test runner via `tsx` — **6 files** |

**Note:** the README lists `recharts` for reporting; it is **not** in `package.json`. Charts
are hand-built.

## 3. Runtime modes

`lib/config.ts` detects mode from environment variables:

- **`hasDatabase()`** — true when `DATABASE_URL` is set. **Sample mode has been removed**:
  `lib/data.ts` states plainly that there is no sample/demo fallback; an unconfigured
  database shows empty states. The seed sets in `lib/sample/` are commented out rather than
  deleted, so they can be re-enabled. **The README still documents sample mode — it is
  stale.** The one exception is Today, which still falls back to `lib/today/mock.ts`.
- **`authEnabled()`** — true when both Clerk keys are present. **When false, everyone
  resolves to `super_admin`.** Correct for local development; dangerous if a deployment
  ever loses its keys, and nothing prevents that configuration booting.
- **Each integration is independently live** — add only the tokens you have.

## 4. Authentication and authorisation

**Authentication:** Clerk, enforced in `middleware.ts` with Clerk's canonical matcher.
Everything is protected except an explicit public list, each member of which has its own
bearer-secret check. `clockSkewInMs` is widened to 60s because device clock drift trips
"Clock skew detected" and loops the sign-in redirect.

**Email resolution** reads a custom `email` claim off the session JWT first (local, no
network call), falling back to `currentUser()` — raced against a 6s timeout and retried
once. That fallback is a live Backend API call with no built-in timeout; it was seen
hanging in production right after a fresh OAuth sign-in and froze pages for the full 300s
ceiling.

**Authorisation:** four permission tiers plus a per-user access scope, all in `lib/roles.ts`
(pure data, import-safe from the client) and `lib/auth.ts` (server-only gates). See
[permissions-and-scoping](../business-rules/permissions-and-scoping.md).

The architectural rule: **`lib/roles.ts` derives the UI's capability text from the same
boolean gates authorisation uses**, so the words shown to a user cannot claim a permission
the backend does not enforce.

## 5. Data access

`lib/data.ts` (1137 lines) is the **facade** — the single entry point pages and components
use to read and write. It always reads from the database and degrades gracefully: a failed
or timed-out query returns an empty result rather than throwing, per-call.

`lib/repo/drizzle.ts` holds the Drizzle reads and upserts. `withDbTimeout()` bounds queries
so one stalled call cannot consume the 300s function ceiling.

**Scoping happens at the facade**, not at the component. `getClients()` is already
role-scoped, which is why the whole Today snapshot, every Insights figure and every list
inherits the viewer's scope automatically. The known exception is `getAppUsers()`, which has
no scope check at all.

## 6. State management

There is none, in the client-library sense. No Redux, Zustand or React Query.

- **Server state** lives in Server Components, re-read per request
  (`dynamic = "force-dynamic"` on the pages that need it, `cache()` per request for auth).
- **URL state** carries Insights period, comparison mode and filters, and the Clients
  search — deliberately, so a filtered view is a shareable link.
- **Client state** is local `useState` inside interactive components. Today's snapshot is
  built server-side and handed to a client repo that reads only from it.

The one place this bit: Today's "Mark reviewed" and "Snooze" were `useState` sets that
looked like logging and evaporated on reload — fixed by persisting the *decision* in
`workspace_config`.

## 7. Writes: Server Actions, not REST

Almost every mutation is a Server Action in a `*-actions.ts` file next to its route.
The contract is `{ ok, error }` — which is why `denyClientWrite()` **returns a reason
rather than throwing**.

REST exists only for: the scheduler (`/api/cron/*`), the sync trigger (`/api/sync`),
admin config reads, import, and one-off backfills.

## 8. Background jobs

Seven Vercel Cron entries in `vercel.json`, ordered so each reads the previous one's output.
See [integrations](../product/integrations/README.md) for the table.

Every cron route: `runtime = "nodejs"`, `maxDuration = 300`, and a `CRON_SECRET` bearer
check where **a missing secret is a 503 in production**, not a bypass. They are excluded
from Clerk protection because the scheduler has no session, and `auth.protect()` would 404
the request before the handler's own check could run.

Fan-out work is bounded (`mapLimit` in `lib/actions/generate.ts`) rather than unbounded
`Promise.all`.

## 9. AI services

**Gemini only, and only for wording.** `lib/integrations/gemini.ts` +
`lib/actions/enrich.ts` rewrite Action-list titles and insights. The *decision* about what
is flagged is made by the deterministic, pure `detectSignals()`. Without `GEMINI_API_KEY`
the feed is fully functional on template text.

This is the right boundary and worth preserving: **AI improves presentation, never
behaviour.**

## 10. Integrations

Three read-only sources (HubSpot, Intercom, Metabase), each independently live, plus
Supabase Storage for attachments. Signal **never writes back**. In-app corrections become
overrides applied on read. See [integrations](../product/integrations/README.md).

## 11. Architectural boundaries worth respecting

| Boundary | Rule |
|---|---|
| `lib/roles.ts` vs `lib/auth.ts` | Roles is pure data, import-safe from the client. Auth is server-only. Do not merge them. |
| `lib/metrics/health-config.ts` vs `lib/assignment/config.ts` | Types are client-safe; DB-backed accessors are server-only. |
| `lib/actions/signals.ts` (pure) vs `generate.ts` (I/O) | Detection is testable in isolation; orchestration does the writes. |
| `lib/assignment/engine.ts` (pure) vs `run.ts` (I/O) | Same pattern. |
| `lib/use-case-transfer.ts` `planImport()` | Pure — preview and write are the same function on the same inputs. |
| `lib/health/` engine | No `eval`/`Function`; 15 formula types interpreted from config. |
| `lib/use-cases.ts` vs `lib/use-case-overlay.ts` | **Deliberately uncoupled.** The overlay imports nothing from the taxonomy. Re-coupling them would repeat a known mistake. |
| Sample data | `lib/sample/` is commented out, not deleted. Do not re-wire it silently. |

## 12. Observability

Effectively none.

- No product analytics SDK. No events.
- No error tracking service (`instrumentation.ts` exists — verify what it registers before
  citing it).
- Cron routes return a JSON summary that is **not persisted, aggregated or alerted on**.
- Failures are `console.error`, visible only in Vercel logs.
- No sync-staleness indicator outside the Usage tab.
- `drizzle/health-analytics-views.sql` defines Metabase views over the **engine's** tables,
  which do not run.

**This is the largest architectural gap in the product.** A silently failing nightly job
shows up as stale numbers, not as an error.

## 13. Testing

`npm test` → `node --import tsx --test lib/health/*.test.ts lib/stakeholders/*.test.ts lib/*.test.ts`

Six files: four use-case modules, the health engine (25 tests), and stakeholder coverage.

**Untested:** every permission gate, every ARR and retention formula, the live health
formula, the signal engine, the assignment engine, the import parser, and every page.

The pure modules were deliberately written to be testable. Most of them simply have no
tests.

## 14. Deployment

Vercel, region `bom1`. Environment variables are set in the Vercel project — none ship in
the repo. `.env.clone`, `.env.local` and `.env.local.bak` exist in the working tree;
**confirm they are gitignored** before sharing the repository.

The README describes a Vercel Hobby-plan cron constraint and links to
`VERCEL-PLAN-CHANGES.md`, **which does not exist**. `vercel.json`'s seven crons — five
sub-daily — would be rejected on Hobby, so the project is on a paid plan and the README was
never updated.

## 15. Known limitations

1. **No observability** (§12).
2. **Near-zero test coverage** of business-critical logic (§13).
3. **Stale `drizzle/meta`** — `db:generate` emits a full-schema baseline (see
   [data-model](../data-model/README.md)).
4. **~40 ad-hoc maintenance scripts** have changed schema outside migrations.
5. **`app/scratch-*` prototypes ship** in the production build.
6. **Auth-disabled mode grants everyone Super Admin.**
7. **The README is stale** on sample mode, crons, and `recharts`.
8. **Two health systems** (§ [health](../product/health/README.md)).

## Open questions

- Is error tracking intended? `instrumentation.ts` suggests something was set up.
- Should `scratch-*` routes be excluded from the production build?

## Source references

`package.json` · `next.config.mjs` · `vercel.json` · `middleware.ts` ·
`instrumentation.ts` · `lib/config.ts` · `lib/auth.ts` · `lib/roles.ts` · `lib/data.ts` ·
`lib/db/client.ts` · `lib/repo/drizzle.ts` · `drizzle.config.ts` · `README.md`
