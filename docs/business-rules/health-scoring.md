# Business rule — Health scoring and at-risk classification

**Status:** **Contradictory** — two health systems exist. See
[health](../product/health/README.md) §1 first.
**Last verified:** 2026-07-31 · **Commit:** `4214349`

This document states the rules of the **live** system (`lib/metrics/health.ts`), which is
what users see. The rules of the unwired engine (`lib/health/`) are documented in
[`docs/health-engine.md`](../health-engine.md) and **must not be described as Signal's
current behaviour**.

---

## R1 — Health is a weighted sum of available metrics

**Definition.** A 0–100 score over the metrics an admin enabled, restricted to those that
have data for this client, renormalised over the weights that participated.

**Formula.**
```
score = round( Σ(subscore_i × weight_i) / Σ(weight_i) )
```
for every metric `i` that is **enabled** and has a **non-null** sub-score.

**Inputs and their sources.**

| Metric | Sub-score | Source |
|---|---|---|
| `usage` | `AdoptionScore.score` (0–100) | Metabase, via `getClientUsage` |
| `csat` | Normalised rating, linear between `zeroAt`/`fullAt` | Intercom conversation ratings |
| `platform_csat` | "% satisfied" (already 0–100), linear between cutoffs | Intercom Surveys |
| `nps` | Linear between `zeroAt` (−100) and `fullAt` (100) | Intercom Surveys |
| `sla_breaches` | `100 − min(breaches, maxBreaches)/maxBreaches × 100` | Intercom + `lib/sla.ts` |
| `onboarding_period` | 100 at ≤ `targetDays` (30), 0 at ≥ `maxDays` (90), linear between | Deal dates |
| `use_case_set` | 100 / 0 | Client use cases |
| `profile_complete` | 100 when severity is `none`, else 0 | `computeProfileCompleteness` |
| `stakeholder_mapping` | 100 / 0 | Stakeholder mapping |

**Code.** `computeHealthScore`, `subscoreFor` in
[`lib/metrics/health.ts`](../../lib/metrics/health.ts). **Tests.** None.

---

## R2 — Two kinds of exclusion, and they are not the same

| | Effect |
|---|---|
| **Disabled metric** | Excluded from **every** client, unconditionally |
| **Enabled metric, no data for this client** | Excluded **for that client only**; remaining weights renormalise |

**Neither is faked with a neutral filler value.** That is why one universally-empty signal
(NPS today) does not drag every client's score down.

**Exception.** A client with **zero** available metrics scores **0** — indistinguishable in
the UI from a genuinely terrible account. This is a real ambiguity.

---

## R3 — `null` means "no reading", not "bad"

- `usage`: null when usage is unavailable or the account is unlinked.
- `csat` / `platform_csat`: null when the value is null **or** the response count is 0.
- `nps`: null when null.
- `sla_breaches`: null when `supportLevelUsed` is null — SLA is not evaluated for this
  account at all.
- `onboarding_period`: null when `days` is null.

The same principle governs the Action list: usage signals fire **only** when
`usage.status === "ok"`. Absence of data is never treated as evidence.

---

## R4 — `profile_complete` is binary, deliberately

Not the three-tier red/yellow/none gradation that profile completeness normally shows.
The metric was scoped as "incomplete profile if yes or not", and the code carries that
note. So a client with one yellow gap scores the same as one with twelve red gaps: **0**.

---

## R5 — Tiers are admin-defined

**Definition.** A score resolves to the **highest tier whose `minScore` it meets**.

**Shape.** `HealthTierDef` = `{ id, name, minScore, color }`. Names and cutoffs are
workspace configuration — they are **not** fixed to Healthy/Watch/At Risk/Critical.

**Exception.** The lowest tier should have `minScore: 0` so every score has a home. If the
config has no tiers, `resolveTier` falls back to `DEFAULT_HEALTH_TIERS`.

**Consequence for documentation:** never hard-code tier names. The 65/50/25 bands in
`docs/health-engine.md` belong to the **engine's** Version 1.1 seed, not to the live
product.

---

## R6 — Recomputation

| Trigger | Scope |
|---|---|
| `/api/cron/client-health`, daily `0 9 * * *` | Every client |
| Immediately after a Super Admin saves the health formula | Every client |

The cron time is deliberate: it runs **after** intercom-sync (`0 6`), usage-sync
(`15 */4`) and client-actions (`0 8`), so it reads same-day-fresh support and usage data.

**Consequence:** the Action list's health signal reads **yesterday's** health, because
actions are generated an hour before health recomputes.

---

## R7 — Health is not churn, risk, or renewal confidence

Four distinct concepts that must never be used interchangeably:

| Concept | Nature | Where it lives |
|---|---|---|
| **Health** | Current condition, 0–100 + tier | `clients.health` |
| **Risk signal** | Evidence contributing to a read | CS Pulse risk signals; Action list signals |
| **Renewal confidence** | Commercial outlook | Forward outlook in Insights |
| **Churn** | Recorded outcome with its own taxonomy | `arr_events` type `churn` + reason |

A churned account is excluded from health, at-risk and concentration analysis.

---

## R8 — Overrides preserve the calculated score

**Stated rule** (from `docs/health-engine.md` and the engine's tests): a status rule or a
manual override changes the **applied status** but **never destroys the calculated score**.

**Status: `Partially verified`.** This is proven for the **engine**. The live path is
separate code (`lib/repo/drizzle.ts` → `recomputeClientHealth`, plus
`app/(app)/clients/[id]/health-actions.ts`). **Verify before relying on it.**

---

## R9 — At-risk classification

**Status: `Unverified`.** The Action list uses explicit numeric thresholds — health `< 55`
is at-risk, `55–74` is watch (`lib/actions/signals.ts`). Insights has its own at-risk panel.
**These were not confirmed to share a single definition.** Until they are, do not document
"at risk" as one concept with one threshold.

---

## Known inconsistencies

1. **Two health systems** — the headline contradiction.
2. **The live formula has no tests**; the unused engine has 20.
3. **Score 0 is ambiguous** (R2).
4. **Action-list thresholds (55/74) are hardcoded** while tiers are configurable — an
   admin can rename and re-cut tiers without changing what the Action list calls at-risk.
5. **NPS and CSAT are null for every client**, so satisfaction holds weight and contributes
   nothing.
6. **No health history** for the live score, so no trend is possible.
7. **No audit** of health-formula changes.

## Open questions

- Do the live path's overrides preserve the calculated score?
- Is "at risk" one definition or several?
- Should the Action list's thresholds derive from the configured tiers?

## Source references

`lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/metrics/health-drag.ts` ·
`lib/actions/signals.ts` · `app/api/cron/client-health/route.ts` · `docs/health-engine.md` ·
`lib/health/engine.test.ts`
