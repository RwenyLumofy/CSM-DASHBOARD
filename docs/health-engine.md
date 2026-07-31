# Client Health Scoring Engine

A configuration-driven, versioned, auditable, explainable, deterministic health
engine. The scoring math is **not** hardcoded — a model version is a tree of
components + formulas + bands + rules that the engine interprets. New models are
new **config**, never new engine code.

Calculated health (the weighted number + band) is kept **separate** from the
applied operational status. A status rule or manual override changes the applied
status but **never destroys the calculated score**.

## Architecture

```
lib/health/
  model.ts       — config & result TYPES (components, formulas, bands, rules, results)
  formula.ts     — safe formula engine (15 formula types; NO eval/Function)
  engine.ts      — calculation pipeline (coverage→redistribution→score→band→
                   momentum→status rules→qualification→applied status→drivers)
  model-v1.ts    — "Lumofy Client Health Model" Version 1.1 seed (config only)
  validate.ts    — publish-time validation (weights=100%, bands tile 0–100, …)
  engine.test.ts — 20 tests: formula units, band matrix, integration scenarios
lib/db/health-schema.ts  — 19 persistence tables (numeric weights/scores)
drizzle/health-analytics-views.sql — Metabase views (§26), run after migration
```

### Calculation pipeline (`calculateAccountHealth`)
Eligibility → component tree (leaf formula or reweighted branch) → mandatory-missing
guard → **original** data coverage → redistribute optional missing weight →
weighted score → calculated band → momentum → coverage cap → Healthy-qualification
caps → priority-ordered status rules (cap/force/replace/churn) → non-expired
overrides → drivers + full explainable result.

Every result carries: calculated score & band, applied status, momentum, score
delta, data coverage & confidence, positive/negative drivers, primary risk, next
action/owner/due, triggered rules, active overrides, per-component & per-metric
breakdown, model name/version, timestamp.

## Local setup & tests

```bash
npm install
npm test          # node --import tsx --test lib/health/*.test.ts  → 20 passing
npm run typecheck
```
No test dependency to install — uses Node's built-in test runner via the
already-present `tsx`.

## Database migration (operator runs — no DB reachable from the dev sandbox)

The tables live in `lib/db/health-schema.ts`, re-exported from `lib/db/schema.ts`.

**Recommended — apply the reviewed, health-only DDL directly** (18 tables, 17
indexes, 11 FKs; additive, no existing table touched):

```bash
psql "$DATABASE_URL" -f drizzle/health-tables.sql            # the health tables
psql "$DATABASE_URL" -f drizzle/health-analytics-views.sql   # Metabase views
```

`drizzle/health-tables.sql` was extracted from a drizzle-kit generate and
verified to contain only the health tables. It is the reviewed source of truth.

> ⚠️ Do **not** rely on a fresh `npm run db:generate` here: this repo's
> `drizzle/meta` journal is stale, so generate emits a *full-schema baseline*
> rather than an incremental — applying that would clash with your live tables.
> Once the journal is reconciled in a real environment, `db:generate`/`db:migrate`
> resume normally; until then use the extracted SQL above (or `db:push` **after
> reviewing its proposed diff**).

Additive only. Safe to run alongside the current `clients.health` field, which
becomes a legacy input, not the engine.

## Rollout (§29)

1. **Schema & seed** — migrate; insert Version 1.1 (`MODEL_V1_1`) into
   `health_models` / `health_model_versions` (published, immutable).
2. **Shadow mode** — run the engine for 5 representative accounts; do not surface
   to CSMs. Compare with the current manual assessment.
3. **Calibration** — record disagreements as cases; fix data, not the model.
4. **Data correction** — target cohorts, module applicability, stale Pulse,
   maturity rules, misclassified tickets.
5. **Portfolio rollout** — all eligible launched accounts; nightly job + event
   recalcs.
6. **Outcome validation** — check against renewals/churn/contraction; watch
   "churned while Healthy" and "At Risk that renewed".

## Rollback

- **Config:** publish a prior version (versions are immutable; nothing is
  mutated). Reassign the default model version.
- **Schema:** the migration is additive; `drop` the `health_*` tables and the
  `analytics.account_health_*` views to fully revert. No existing table changes.
- **App:** the engine is inert until wired into a job/endpoint — no user-facing
  surface changes on migrate.

## Status

**Delivered (this increment) — the deterministic core, proven by tests:**
formula engine, calculation pipeline, Version 1.1 seed, publish validation,
persistence schema, Metabase view SQL, docs.

**Next increments (need the DB running / are large UI):** metric data-loaders
from real product/support/survey tables, calculation service + nightly/event jobs
(§21–22), REST APIs (§25), admin model-editor UI (§23), CSM Pulse UI (§24),
audit-log writes on config changes (§27). The schema and engine are already
shaped for all of them.

## Definition-of-done coverage (this increment)

| DoD item | Status |
|---|---|
| Change weights / formulas / bands / rules without engine code | ✅ config-driven |
| Prevent invalid configs from publishing | ✅ `validateModelVersion` |
| Published version immutable; every score references its version | ✅ schema (`config` snapshot, `model_version_id`) |
| Bands 65→Healthy / 50→Watch / 25→At Risk / <25→Critical | ✅ tested (all boundaries) |
| Healthy score can be capped to Watch/At Risk/Critical | ✅ tested (adoption<65, coverage<85, single-threaded, critical incident) |
| Overrides & status rules preserve the calculated score | ✅ tested |
| Missing optional weight redistributes; coverage shown separately | ✅ tested |
| Momentum calculated separately | ✅ tested |
| Every score explainable to raw metric + formula | ✅ per-component/metric results |
| Metabase can query current + historical health | ✅ view SQL |
| Pending DB/UI wiring | ⏳ next increments |
