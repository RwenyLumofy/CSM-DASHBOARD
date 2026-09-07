# 0015. The engine scores health, and every surface reads the applied status

**Status:** Accepted
**Date:** 2026-08-03 – 2026-08-05
**Affected product areas:** Health · CS Pulse · Clients directory · Client Profile · Today ·
Action list · Insights · Settings

## Context

Two health code bases had coexisted for months, and
[contradictions](../known-limitations/contradictions.md) had asked the same question the
whole time: *is the engine the intended future of health scoring, or abandoned work?*

`recomputeClientHealth` called `computeHealthScore` — **a flat weighted average over ten
metrics, with no qualification gates, no status rules and no lifecycle states.** The
published model (`MODEL_V1_1` plus the engine in `lib/health/`) had all of those and **had
never been wired to anything**: `getAccountHealth` had zero callers.

Measured against production, 133 accounts:

| Tier | Was | Now |
|---|---|---|
| Healthy | 43 | 3 |
| Watch | 15 | 22 |
| At risk | 75 | 23 |
| Churned | 0 | **79** |
| Critical | 0 | 1 |
| Implementation | 0 | 2 |
| Not Assessed | 0 | 3 |

**The 43 "Healthy" included churned accounts. The 75 "At risk" was mostly the churned
back-catalogue being scored as though it were live.**

## Decision

**The engine is the scorer.** `recomputeClientHealth` runs the published model.

**`tier` carries the APPLIED status, not the band.** Otherwise the clients list would show
Healthy for an account the profile calls Watch, and a cap would exist only in a drawer
nobody opens. The raw score is stored **unmodified** and the band alongside it, so nothing is
hidden — they simply mean different things.

**Every surface reads the applied status.** `lib/health/status.ts` is the single answer.
Re-deriving a band from the raw score throws the engine's conclusion away.

**Three statuses are lifecycle facts, not judgements** — Churned, Implementation, Not
Assessed. No surface counting "how many are at risk" may include them.

**The gates and status rules are configurable, but not editable as conditions.** Five
qualification gates and sixteen status rules are where the model's judgement lives; they were
code, so every retune was a deploy. Each can now be switched off, have its single number
moved, and have its cap target changed. A rule with no number, or with more than one, is
**toggle-only** rather than guessing which number was meant — because a free-text condition
editor yields a model that still runs and silently measures something else.

**Explanations are generated from the model**, from the same `when` the engine evaluates.

## Alternatives considered

- **Keep the flat formula and add gates to it.** Rejected implicitly: the engine already had
  gates, rules, lifecycle states, immutable published versions and 25 tests.
- **Run both and compare.** The commit reports a production measurement instead, which is the
  same evidence without carrying two scorers indefinitely.
- **Let `tier` carry the band and expose the cap separately.** Rejected explicitly — *"a cap
  would exist only in a drawer nobody opens."*

## Consequences

- **The book was re-sorted, not re-tuned.** 79 accounts became Churned. Anyone comparing a
  dashboard across 2–3 August is comparing two different questions.
- **A new failure mode arrived with it, three times in one day.** The engine's component keys
  have **zero overlap** with the retired formula's, so any key set written against the old
  vocabulary still **compiled** and silently matched nothing: the Insights drag panel read
  `undefined` for every row (`abd355e`); `hasCustomerEvidence()` returned false for all 133
  accounts, showing "Not assessed" on top of good scores (`afc55a5`); and the Settings
  formula editor configured a model that no longer decided anyone's health (`e6dc235`).
  **Nothing in the type system prevents a fourth.**
- **Four surfaces still re-band the raw score** on the retired 75/55 cutoffs —
  `lib/metrics/portfolio.ts`, `movement.ts`, `lib/today/build.ts`, and the now-uncalled
  `healthBand` in `exec.ts`. The model uses 65/50/25. Tracked in
  [contradictions](../known-limitations/contradictions.md#at-risk-still-has-two-definitions--narrowed-2026-08-05-not-closed).
- **`lib/metrics/health.ts` is dead code with 21 passing tests.** No importers outside its
  own test files.
- **The engine's 19 tables are still unused** — results land in `clients.health` JSONB, so
  there is still no health history.
- **Config changes re-score the whole book immediately**, with no dry-run and no audit trail.
- **Rollback is a snapshot/restore of `clients.health`** (`022e342`), not a version switch.

## Implementation references

`lib/health/*` · `lib/repo/drizzle.ts` (`recomputeClientHealth`) ·
`lib/metrics/health-evidence.ts` · `app/(app)/settings/client-health-actions.ts` ·
`components/settings/HealthModelWeights.tsx`, `HealthModelRules.tsx` ·
commits `9a8ea59` `1aec1a1` `31777c2` `abd355e` `afc55a5` `e6dc235` `022e342` `0764bcc`
`3f6934f` `32923a3` `9625e0e` `810de4e` `b47fe07`

## Superseded decisions

Answers the open question in
[0007](0007-define-health-risk-renewal-and-churn-separately.md) and supersedes
[0013](0013-record-keeping-alone-is-not-a-health-score.md) and
[0014](0014-a-critical-pulse-caps-the-tier-and-leaves-the-score-alone.md) **as
implementations** — both were built into the retired formula. Their *principles* survive in
the engine: 0013's "record-keeping alone is not a score" is now the evidence rule plus the
mandatory-component policy, and 0014's "a Critical judgement outranks the arithmetic" is now
the `r_pulse_below_60` status rule and the `q_pulse` gate.

---

**Rationale evidence:** commit messages `9a8ea59`, `1aec1a1`, `31777c2`, `abd355e`, `e6dc235`
— each carries a measured production result. Pinned by 8 test files.
