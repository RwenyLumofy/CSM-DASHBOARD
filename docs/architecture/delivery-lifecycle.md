# Signal — infrastructure and the full delivery cycle

**Audience:** engineers and agents picking up work in this repo who need the whole
loop, not one slice of it. Read this before proposing structural change.

**Method:** every claim below was verified against the repo on 2026-08-17 —
`package.json`, `vercel.json`, `.claude/`, `drizzle/`, `scripts/`, `lib/`,
`app/api/cron/`, `docs/`. Counts are as of that read and will drift; re-run the
commands in [Verifying this document](#verifying-this-document) rather than
trusting the numbers.

**This document is deliberately self-critical.** The last section lists open
structural questions. If you are an agent asked to "analyse and improve", start
there — not with a rewrite of what already works.

---

## 1. The stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript, strict |
| Styling | Tailwind v4, design tokens only (`text-fg`, `bg-surface`, `font-display`) |
| Auth | Clerk |
| Database | Supabase Postgres via Drizzle |
| Hosting | Vercel, region `bom1` |
| Tests | `node --test` with `tsx`, colocated as `lib/**/*.test.ts` |

Two facts about this stack that shape everything else:

- **There is no staging environment.** Local runs against a test database with no
  production credentials, and anything gated on a signed-in Clerk user cannot be
  exercised locally at all. The workaround in use is a `/scratch-*` route that
  mounts a real production component against a fixture — see §6.
- **Tests cover `lib/` only.** The glob is `lib/**/*.test.ts`. No component,
  route, or integration tests exist. `npm test` passing means the derivation
  logic is sound; it says nothing about whether a page renders.

---

## 2. Where things live

```
app/            routes (App Router) + app/api/cron/* (7 scheduled endpoints)
components/     UI; components/clients/* is the Client Profile surface
lib/            all logic — see below
drizzle/        10 numbered SQL migrations
scripts/        56 .mjs/.mts operational scripts
docs/           product documentation (see §5)
.claude/        3 agent definitions, 1 skill, launch.json
```

`lib/` is organised by **domain**, not by technical layer, and this is the single
most useful thing to understand about the codebase:

| Directory | Owns |
|---|---|
| `lib/integrations/` | The outside world: `hubspot`, `intercom`, `metabase`, `gemini`, `supabase-storage`, plus `sync.ts` orchestration |
| `lib/db/`, `lib/repo/` | Schema and data access. `lib/repo/drizzle.ts` is the main repository |
| `lib/health/` | **The live health engine** — `MODEL_V1_1`, `calculateAccountHealth`, gates, status rules |
| `lib/metrics/` | Older derivations. `lib/metrics/health.ts` is the **retired** model A |
| `lib/usage/` | Usage snapshots, adoption score, period queries |
| `lib/expansion/`, `lib/stakeholders/`, `lib/support/`, `lib/work/`, `lib/today/`, `lib/projects/`, `lib/notes/`, `lib/notifications/`, `lib/actions/`, `lib/import/`, `lib/sample/` | One domain each |

> **Trap.** `lib/health/` and `lib/metrics/` both contain health code. `lib/health/`
> is live; `lib/metrics/health.ts` is a retired formula that still compiles and is
> still partly computed. A recurring bug in this repo — hit at least five times —
> is writing a key set against the retired model's shape: it type-checks, runs,
> and silently matches nothing. **Always confirm which engine you are editing.**

---

## 3. The data cycle

This is the product's actual heartbeat. Signal owns almost no primary data; it
ingests, derives, and presents.

```
  HubSpot ─┐
 Intercom ─┼─→ sync (lib/integrations) ─→ Postgres ─→ derivation ─→ UI
 Metabase ─┘        via cron                          (lib/health,
                                                       usage, work…)
```

**Ingest** is scheduled, not on-demand. `vercel.json` defines seven crons:

| Time (UTC) | Endpoint | Cadence |
|---|---|---|
| `0 */4` | `/api/cron/sync` | every 4h — HubSpot core sync |
| `15 */4` | `/api/cron/usage-sync` | every 4h, offset 15m — Metabase usage |
| `30 5` | `/api/cron/survey-sync` | daily |
| `0 6` | `/api/cron/intercom-sync` | daily |
| `0 7` | `/api/cron/profile-completeness` | daily |
| `0 8` | `/api/cron/client-actions` | daily |
| `0 9` | `/api/cron/client-health` | daily |

**The daily chain is staggered on purpose, and the order encodes a dependency
graph that exists nowhere else in the codebase.** Surveys and Intercom land
first, completeness reads them, actions read that, health runs last. The 15-minute
offset between `sync` and `usage-sync` exists so usage does not race the core
sync for the same rows.

That ordering is a convention held only by seven cron expressions in a JSON file.
Nothing asserts it. See §7 for why that matters.

**Derivation** happens on read and on recompute, never at ingest. Raw readings go
into Postgres; scores, statuses, signals and recommendations are computed from
them. This separation is deliberate and worth preserving — it means a model change
re-scores history rather than requiring a backfill.

**A rule the repo takes seriously:** score and applied status are separate things.
A qualification gate caps the *status* and never rewrites the *score*. Components
with no data are skipped and the remaining weights re-share (renormalisation),
rather than a missing input being faked as a zero.

---

## 4. The delivery cycle

`CLAUDE.md` defines a four-stage loop, enforced by three agent definitions in
`.claude/agents/`. The agents do not overlap, and the distinction is the point:

| Stage | Agent | Writes to | Records |
|---|---|---|---|
| Define | `signal-product-manager` | `docs/specs/`, `docs/product-notes/`, `docs/decisions/` | *intended* behaviour |
| Build | — | code | — |
| Establish | `signal-product-data-analyst` | `docs/product-data/` | what Signal can honestly *know* (read-only, `SELECT` only) |
| Document | `signal-product-documenter` | `docs/product/`, `docs/business-rules/` | *verified* behaviour |

**The invariant: never document proposed behaviour as live.** `docs/specs/` is
intent, `docs/product/` is confirmed reality, and conflating them is the failure
mode the three-agent split exists to prevent.

The product-manager stage is required for any change touching more than one
product area, a business rule, a calculation, the data model, permissions, or a
commercial outcome. Short requests are explicitly *not* grounds for inferring
significant product behaviour.

### Verification gates

```bash
npm run typecheck && npm test && node scripts/docs-check.mjs
```

`typecheck` and `test` are named in `CLAUDE.md` as required before finishing.
`docs-check.mjs` validates documentation links and citations — documentation here
is expected to cite the implementation that proves it.

**What no gate covers:** rendering, routes, permissions in practice, or
integration behaviour. A green run is necessary and nowhere near sufficient.

---

## 5. The documentation system

`docs/` documents *the product*, not customer data. It is unusually complete for
an internal tool, and it is structured for retrieval:

| Directory | Docs | Purpose |
|---|---|---|
| `specs/` | 20 | Intended behaviour, pre-build |
| `product/` | 18 | One per product area, verified |
| `decisions/` | 18 | Why it is the way it is |
| `business-rules/` | 10 | Formulas, inputs, exceptions |
| `_templates/` | 6 | Templates for the above |
| `known-limitations/` | 2 | Including `contradictions.md` |
| `architecture/`, `data-model/`, `product-notes/`, `releases/`, `runbooks/` | 1 each | |

Entry points: `PRODUCT_OVERVIEW.md` (why), `PRODUCT_MAP.md` (where), `GLOSSARY.md`
(language — including the distinctions that are easy to blur),
`DOCUMENTATION_COVERAGE.md` (is this documented?), `BACKLOG.md` (what isn't).

Two conventions carry real weight:

- **Module header comments are treated as decision evidence.** Keep them true.
  Several files carry a header explaining why an approach was rejected; deleting
  or letting one drift destroys the reasoning.
- `docs/README.md` carries its own baseline commit and last-audit commit, and
  currently flags the root `README.md` as stale in four places.

---

## 6. Local development and its hard constraints

```bash
npm run dev        # never `npm run build` while this runs — it poisons .next
```

| Constraint | Consequence |
|---|---|
| No Clerk session locally | Anything behind auth cannot be verified locally |
| Test DB only, no prod credentials | Production migrations are always a manual human step |
| `next build` alongside `next dev` | Corrupts `.next`; replays already-fixed compile errors |

The working pattern for verifying an auth-gated component: a tracked
`/scratch-*` route that imports the **real** component and feeds it a fixture
built from the actual types. Two rules learned the hard way:

1. **Build the fixture from `lib/**/types.ts`, not from inference.** A guessed
   shape type-checks via `as never` and then crashes at render.
2. **A `tsc`-clean edit is not a verified edit.** An edit applied to the wrong
   file reports success, leaves types clean, and changes nothing. Confirm against
   the rendered DOM.

---

## 7. Open structural questions

For agents asked to analyse and improve. These are observations from a verified
read, not settled defects — each needs confirming before action.

1. **Two migration mechanisms.** `drizzle/` holds 10 numbered SQL migrations;
   `scripts/` holds 56 scripts, many of them named `add-*` / `backfill-*` /
   `cleanup-*` and clearly schema changes. Which is authoritative? Can the
   schema be rebuilt from `drizzle/` alone, or is `scripts/` load-bearing?
   *Highest-value question here.*

2. **The cron dependency graph is implicit.** Ordering lives only in seven cron
   expressions. Nothing asserts that health runs after its inputs, and a slow
   upstream job silently produces a stale downstream result. Worth checking
   whether `client-actions` (08:00) reads health computed at 09:00 the *previous*
   day — if so, actions trail health by ~24h, which may be intended or may not.

3. **Retired model A is still computed.** `AdoptionScore.score` is produced at
   `lib/repo/drizzle.ts:839` and consumed at `lib/metrics/health.ts:78`. Both are
   the retired formula; `computeHealthScore` has no live caller outside comments.
   That is dead work running per account per recompute, and it is the source of
   the recurring wrong-key bug in §2.

4. **No test covers a rendered page.** The glob is `lib/**/*.test.ts` only. The
   highest-leverage addition to this repo is probably a thin render test per
   major surface, not more unit tests.

5. **`lib/metrics/` versus `lib/health/`.** Two homes for overlapping concerns,
   one live and one retired, with no naming signal. Renaming `lib/metrics/health.ts`
   to something explicitly retired would prevent a known, repeated bug class.

6. **Vocabulary collides across surfaces.** Independent enums reuse the same
   words — `dormant` exists as a usage tier, a `UsageRiskKind`, and a
   `UsageDirection`; `at_risk` as both a usage tier and a health status. They are
   unrelated in code and indistinguishable in conversation. `GLOSSARY.md` is the
   right place to fix this.

7. **No staging.** Every production change is verified either by unit tests, by a
   fixture-fed scratch route, or in production. That is the root cause behind
   most of the caution documented in §6.

---

## Verifying this document

```bash
cd CSM-DASHBOARD && ls -1d lib/*/ && cat vercel.json && ls drizzle/*.sql | wc -l && ls scripts | wc -l && for d in docs/*/; do echo "$d $(find "$d" -name '*.md' | wc -l)"; done
```

If a count here disagrees with that output, the output is right — update this
file and note what moved.
