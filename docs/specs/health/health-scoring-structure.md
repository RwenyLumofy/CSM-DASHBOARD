# Specification — a health model that changes by configuration, not by code

> **Level 3.** Written by `signal-product-manager`. Describes **intended** behaviour.
> Not product documentation. Do not cite as evidence of what Signal does today —
> for that, read [health-scoring](../../business-rules/health-scoring.md).

**Status:** Proposed — **scope reduced 2026-08-03, see the note below**
**Date:** 2026-08-03
**Product areas affected:** Health · CS Pulse · Settings · Action list · Insights · Clients
**Verified against commit:** `6660fe8`

> **Scope decision, 2026-08-03.** Per-cohort scoring was considered and **deferred — "too
> early"**. This document keeps the full structural design because it is the destination, but
> **§6.0 is what to build now**. Cohorts, the metric registry, and the dry run are all held.
> The reasoning for holding them is in §12: the trigger for building configuration machinery is
> retuning *frequency*, and nobody yet knows how often health should change. Building the
> machinery before that is known is how you end up with knobs nobody turns.

---

## 1. Executive decision

Signal's health score is already configurable — an admin sets which of ten metrics count,
their weights, their cutoffs, and the tier bands. What it is not is **safe to change**: there
is no version history, no audit, no preview, no score history, and the configured weight of a
metric is not the weight actually applied to most accounts. Adding one metric (`cs_pulse`, on
2026-08-03) cost a new enum member, a hardcoded scoring branch, and a bespoke migration script.

This specifies the structure that makes retuning routine and restructuring rare: an immutable
**published formula version**, an open **metric registry** in place of a closed enum, scores
that record the weights that actually applied, and one rule — **persist evidence, derive
verdicts** — that decides where every rule is evaluated.

**Product judgement: Proceed with changes.** Do not wire the `lib/health/` engine
(§6 Non-goals). Do not add configurability before §7's contracts are in place.

---

## 2. Problem

**User problem.** A Super Admin cannot change the health formula with confidence. Saving
recomputes every account immediately, with no preview of the effect, no record of what the
formula was, and no history to judge the change against. A CSM cannot explain why an account
scores what it does, because the weights shown in Settings are not the weights applied to
their account.

**Current behaviour**, all verified in
[health-scoring](../../business-rules/health-scoring.md):

- **Weights are per-account, not portfolio-wide.** R1 renormalises over metrics that produced
  a value; R2 excludes a metric with no data for that client only. `cs_pulse` configured at a
  25% share is ~75% of the score on an account carrying only usage and Pulse. Settings
  presents a single number as though it were global.
- **R11 exists because of that property.** An account scored entirely on Signal's own
  record-keeping produced "a real number in the wrong units" — one account read *Healthy 76*
  on profile and onboarding data alone. R11 patches the worst case at three surfaces; the
  property is untouched.
- **Adding a metric requires bespoke migration maths.** `getClientHealthConfig` defaults an
  absent metric to `{ enabled: false, weight: 0 }` — correct, so a new metric cannot silently
  re-weight a tuned formula — but the consequence was
  [`scripts/enable-cs-pulse-health-metric.mjs`](../../../scripts/enable-cs-pulse-health-metric.mjs),
  solving `w = enabledTotal / 3` by hand. One script per metric does not scale.
- **Rules sit at three evaluation stages by accident.** R1/R2 at config, R12 at recompute
  (persisted, so an account keeps a stale tier until the nightly cron), R11 at read
  (retunable instantly, no migration). Nobody chose this.
- **Downstream consumers band on `score`, not `tier`.** `lib/actions/signals.ts` and
  `healthBand` in `lib/metrics/exec.ts` use hardcoded 55/74 while tiers are admin-configurable.
  R12 widens the gap: a capped account's tier is the lowest while its score sits anywhere.
- **No version, no audit, no history** (known inconsistencies 7 and 8).
- **The weighted sum itself has no test** (known inconsistency 2). R10, R11 and R12 are
  pinned; the formula they all feed is not.

**Consequence.** Operationally, health is retuned rarely and nervously, and every retune
silently invalidates comparison with the past. Commercially, a score that cannot be explained
per account will not be trusted for renewal decisions — which is the only reason to have it.

**Assumptions.** That health is intended to be tuned by a human periodically rather than
fitted from outcome data. Nothing in the repository suggests otherwise, and there is no
outcome-validation loop.

---

## 3. Product outcome

A Super Admin can change what health means — which signals count, how much, where the tier
cuts fall, and what caps apply — see what the change will do before publishing it, publish it
as a named version, and compare the portfolio before and after. A CSM opening any account can
see the weights that actually produced *that* number. Adding a new signal from a source
Signal already reads is a configuration entry, not a release.

---

## 4. The durability test

Every structural decision below is justified by one table. Only the last row should require code.

| Change | Should cost | Costs today |
|---|---|---|
| Reweight a metric | publish a version | save + full recompute; no history, no record |
| Recut or rename a tier | publish a version | save — but the Action list still bands 55/74 |
| Change a metric's cutoffs | publish a version | save |
| Add a metric from a source already read | a registry entry | enum + `subscoreFor` branch + migration script |
| Add a cap or evidence rule | publish a version | code (`PULSE_CRITICAL_CAPS`) + tests |
| Retime a rule | publish a version | code — R11 and R12 are hardcoded at opposite stages |
| Score two segments differently | publish two versions | impossible |
| **Read a new data source** | **code** | code — correct, and always will be |

---

## 5. Recommendation

### 5.1 The governing principle

> **Persist evidence. Derive verdicts.**

A score row stores what was measured — sub-scores, the weights that applied, the raw facts a
rule needs. It does not store conclusions. Tier, assessed/not-assessed, and any cap are
computed on read from the formula version the score was pinned to.

This is not a new idea in Signal; it is R11's design, generalised. R11 shipped with no
migration, no recompute and no rewritten rows, and can be retuned freely. R12 chose the
opposite and bought a staleness window the documentation has to explain. The principle
resolves the open question the business-rule doc already asks about R12.

### 5.2 Five entities

**`MetricDefinition` — a registry, not an enum.**
`HealthMetricKey` is a closed union with a hardcoded branch per member; that is what makes
every new signal a release. Replace with records:

| Field | Meaning |
|---|---|
| `key` | Stable identifier, never reused |
| `label`, `help` | Admin-facing |
| `source` | Which loader produces the raw value |
| `normaliser` + `params` | How the raw value becomes 0–100 (§5.3) |
| `evidenceClass` | `customer` \| `record-keeping` — R11's list becomes a property |
| `introductionPolicy` | `disabled` \| `ratio-of-enabled: n` — replaces the migration script |

`introductionPolicy` is the fix for the R10 rollout exception: a new metric declares how it
should arrive in a workspace that already has a tuned formula, and the rule is applied on read
rather than by a hand-written script.

**`Normaliser` — five shapes, open parameters.**
`linear(zeroAt, fullAt)` · `binary` · `decay(max)` · `banded(cuts)` · `passthrough`. These
cover all ten current metrics. **Deliberately not a formula language** — the unwired engine
carries fifteen formula types and cannot be used by an admin without a bespoke editor, which
is a large part of why it was never wired.

**`FormulaVersion` — immutable and published.**
Holds: enabled metrics with weights and params, tiers, rules, and an `appliesTo` selector.
Publishing writes a new row; nothing is ever mutated. This single change is what makes
retuning non-destructive, and it delivers named switchable formulas as a side effect.

**`HealthScore` — pinned, with applied weights.**
Stores `score`, `components`, **`appliedWeights`**, `formulaVersionId`, and the raw facts
rules need (e.g. the Pulse dimensions rated `critical`). Does **not** store tier, assessed, or
`cappedBy` — those derive.

**`HealthSnapshot` — one row per recompute.**
Current value stays on `clients.health` so no existing consumer changes. History goes beside
it. This is what makes "did that change help?" answerable, and it closes known inconsistency 7.

### 5.3 The two decisions, made

**D1 — cohorts are DEFERRED. Carry `appliesTo`, build nothing behind it.**
Considered and held on 2026-08-03 as too early. The field exists and is always `null`, meaning
"all accounts". The design below is retained because it is where this goes if cohorts return —
and because **§5.3 D1a is a constraint worth knowing before anyone adds a second formula**, not
after.

Signal already scores two cohorts differently in practice — `CsPulsePanel` is gated on
`client.status !== "onboarding"`, and `onboarding_period` only means something during
onboarding — so this will come back. It is not urgent.

**Lifecycle stage, not commercial segment — and the distinction is load-bearing.**

| | Example | Verdict |
|---|---|---|
| **Lifecycle stage** | onboarding · live · renewal window | **Yes.** The same account passes through each, and "healthy" genuinely differs: during onboarding low usage is expected and time-to-value is the signal; at renewal, sponsor coverage and engagement dominate |
| **Commercial segment** | Tier 1 vs SMB · industry · ARR band | **Only with a stated reason.** An account sits in one persistently, so a per-segment formula permanently changes what its number means relative to its peers |

**Cohort resolution.** `appliesTo` is an ordered list; **first match wins**; a version with
`appliesTo: null` is **mandatory** and catches everything unmatched. An account resolves to
exactly one formula, always. `HealthScore.formulaVersionId` records which — so the resolution
is auditable after the fact, not re-derived.

**D1a — tiers are workspace-global, not per-version.**
This is the constraint that makes cohorts safe. If each formula carried its own tiers, no two
accounts in different cohorts would be comparable — and comparing health across accounts is
precisely what Today, the `/clients` at-risk count, `health-drag` and the Insights
distribution all do. Instead: **metrics, weights and params vary by cohort; every formula maps
into the same tier vocabulary.** The score becomes a within-cohort number; the **tier is the
portfolio-comparable unit**.

The cost is explicit and should be stated to whoever tunes them: each cohort's formula must be
calibrated so that its 70 means the operational thing the global tiers say it means. That
burden is real, and it is far smaller than the alternative, which is a portfolio where no two
numbers can be compared.

**D2 — Tier, assessed and caps derive at read.**
Store evidence, derive verdicts (§5.1). Publishing a version applies immediately, including to
scores already written, with no portfolio recompute.

**The cost, stated plainly:** SQL and Metabase consumers reading `clients.health` directly no
longer find a tier there. That is why `drizzle/health-analytics-views.sql` exists in the engine
work — a view derives the same verdicts for analytics. Budget for it; do not skip it and quietly
denormalise a tier back onto the row, because a cached verdict that disagrees with the derived
one is worse than either.

---

## 6. Scope

### 6.0 Build now — the reduced scope

Four items. Each fixes a defect that exists **today**, independently of how configurable health
ever becomes, and none of them is wasted if the full design is built later.

| # | Change | Why it stands alone |
|---|---|---|
| 1 | **Test the weighted sum and renormalisation** (`AC-009`) | R10, R11 and R12 are pinned; the formula they all feed is not. This is the guard for every later change — do it first |
| 2 | **Consumers read `tier`, not hardcoded 55/74** (`AC-007`) | The only user-visible bug here: recut the tiers and the Action list still disagrees with the profile. R12 widens it — a capped account's tier and score already disagree |
| 3 | **Store `appliedWeights` on the score** (`AC-006`) | A CSM cannot currently be told why their account scores what it does, because the configured weight is not the applied weight. Cheap, and it is the explainability fix R11 had to work around |
| 4 | **Derive the cap at read** (`AC-005`) | R12's staleness window — an account rated Critical today keeps its old tier until tomorrow's cron — is a live defect regardless of retuning frequency. Needs `criticalDimensions` on the score row |

**Held until retuning frequency is known:** formula versioning and audit, the publish diff and
dry run, the metric registry, snapshots, and cohorts. Versioning is the first to unlock — the
moment anyone retunes the formula more than occasionally, it stops being optional, because
without it every retune silently invalidates comparison with the past.

**Carry one field anyway:** `FormulaVersion.appliesTo`, nullable, unused. A nullable column now
costs nothing; retrofitting it means migrating every version and every score. This is the only
part of the cohort design worth keeping today.

### Foundation — the full design, for later

1. `FormulaVersion` — immutable, published, with publish-time validation.
2. **Cohort resolution** — ordered `appliesTo`, first match wins, mandatory catch-all default
   (D1). Ship with **two** cohorts: onboarding, and everything else.
3. **Workspace-global tiers** (D1a), moved off the version.
4. Metric registry replacing the closed enum, with `evidenceClass` and `introductionPolicy`.
5. `HealthScore` records `appliedWeights` and `formulaVersionId`.
6. Tier, assessed and caps derived on read (R11's pattern, R12 migrated to it).
7. Every consumer reads `tier` / `assessed` / `cappedBy`; the 55/74 thresholds derive from
   configured tiers.
8. Publish flow: diff, dry run over the portfolio, audit record — **per cohort, and portfolio-wide**.
9. `HealthSnapshot` per recompute, recording `formulaVersionId` so a cohort change is legible.
10. **A test for the weighted sum and renormalisation**, before any of the above ships.

### Later

- Further cohorts beyond onboarding — each requiring a stated reason (D1, `D-D`).
- Rules as fully configurable records (cap / gate / force), beyond migrating R11 and R12.
- Outcome validation — comparing scores against renewals and churn, per cohort.

### Non-goals

- **Wiring `lib/health/`.** Its own status section lists data loaders, jobs, REST APIs, the
  admin model editor and audit writes as outstanding — that is most of the work, not a wiring
  task. The live path has three tested rules from 2026-08-03 and the momentum. **Retire the
  engine explicitly** as part of this work and close the headline contradiction; keeping a
  second tested-but-dead health system is what forces every health document to hedge.
- A formula language (§5.2).
- Changing what the ten current metrics mean. This is structure, not recalibration.
- Per-user or per-CSM formulas.

---

## 7. The two contracts

**C1 — every rule declares its stage.**

| Stage | Contains | Change cost |
|---|---|---|
| Config | metrics, weights, params, tiers, rules | publish a version |
| Recompute | anything needing data the score cannot carry | portfolio recompute |
| Read | anything derivable from the stored score row | none — applies instantly, including to history |

Push toward read. A rule lands at recompute only when the evidence it needs cannot reasonably
be stored on the score row — and the first question should always be whether to store it.

**C2 — consumers read verdicts, never bands.**
`tier`, `assessed` and `cappedBy` are the public surface. No consumer bands on `score`.
This is the contract that stops the 55/74 divergence growing back, and without it every other
part of this specification is decorative.

---

## 8. Publish flow

1. Admin edits a draft, derived from the current published version.
2. **Validation** — weights positive, tiers tile 0–100 with a lowest tier at 0, every metric
   key resolves in the registry, `appliesTo` well-formed.
3. **Diff** against the published version, in product language.
4. **Dry run** over the current portfolio: *"38 accounts change tier · 6 into the lowest ·
   mean −4 · 3 become Not assessed."* Computed from stored components and the draft — no writes.
5. **Publish** — new immutable row, audit record of who and when, optional note.
6. Derived verdicts apply immediately (D2). A recompute is scheduled for anything that needs
   fresh sub-scores, not to make the version take effect.

---

## 9. Data requirements

| Field | Meaning | Where | Notes |
|---|---|---|---|
| `formulaVersionId` | Which version produced this score | `HealthScore` | Required. Without it a score cannot be explained |
| `appliedWeights` | Weight per metric **after** renormalisation, for this account | `HealthScore` | The fix for §2's first bullet |
| `components` | Sub-score per metric | `HealthScore` | Already stored |
| `criticalDimensions` | Pulse dimensions rated `critical` | `HealthScore` | Lets R12's cap derive at read |
| `appliesTo` | Cohort selector | `FormulaVersion` | `null` = all accounts |
| `publishedBy`, `publishedAt`, `note` | Audit | `FormulaVersion` | Closes inconsistency 8 |
| `introductionPolicy` | How a new metric enters a tuned formula | `MetricDefinition` | Replaces the migration script |

---

## 10. Migration and compatibility

- **Existing scores.** Backfill `formulaVersionId` to a version-1 row seeded from the current
  stored config. `appliedWeights` cannot be reconstructed for old rows — leave null and have
  the UI say "recorded before applied weights were captured" rather than inventing them.
- **Existing config.** The current `client_health_formula` becomes published version 1,
  unchanged, so nothing moves on day one.
- **`clients.health` stays**, so exports, Metabase questions and any consumer reading it
  directly keep working. Tier moves to the analytics view.
- **Rollback.** Republish the prior version — versions are immutable, so nothing is lost.

---

## 11. Acceptance criteria

- [ ] `AC-001` — Given a published version, when an admin edits and publishes again, then a
      new immutable row is written and the previous version is unchanged and still readable.
- [ ] `AC-002` — Given a draft whose tiers leave a gap in 0–100, when publish is attempted,
      then it is refused and the gap is named.
- [ ] `AC-003` — Given a draft, when the dry run is requested, then the count of accounts
      changing tier is reported and **nothing is written**.
- [ ] `AC-004` — Given a published tier change, when any account is read, then the new tier
      applies **without a recompute**, including on scores written before the change.
- [ ] `AC-005` — Given an account whose Pulse rates renewal `critical`, when the tier is read,
      then it is the lowest configured tier and `cappedBy` names the dimension — with no
      staleness window.
- [ ] `AC-006` — Given an account with two metrics available out of ten, when the profile is
      opened, then the weight each metric actually contributed is shown, not the configured weight.
- [ ] `AC-007` — Given a recut of the tier bands, when the Action list is generated, then its
      at-risk set matches the configured tiers — no 55/74 anywhere.
- [ ] `AC-008` — Given a new metric added to the registry with `introductionPolicy: disabled`,
      when a workspace with a tuned formula reads its config, then existing weights are
      unchanged and no script is required.
- [ ] `AC-009` — Given the weighted sum and renormalisation, when the test suite runs, then
      both are covered — closing known inconsistency 2.

---

## 12. Risks and trade-offs

- **Deriving verdicts costs SQL consumers.** Named in §5.3. The analytics view is mandatory,
  not optional, and must ship in the same change.
- **The registry is a real refactor.** `HealthMetricKey` is referenced across `health.ts`,
  `health-config.ts`, `health-evidence.ts`, `health-drag.ts` and the Settings editor. It is
  the largest piece of work here and the one most likely to be deferred — and deferring it
  leaves the single most expensive change class (adding a metric) exactly as it is.
- **Against my own recommendation:** if the honest answer is that the formula will be tuned
  twice a year by one person who is happy to accept a recompute, then versioning, dry runs and
  read-time derivation are over-engineering, and the correct scope is items 5 and 8 alone —
  fix the consumer contract, test the sum, and stop. **The test is frequency.** If health is
  retuned less than quarterly, build less than this.
- **Three tested rules land on the live path today.** Restructuring around them risks
  regressing R10, R11 or R12. Their tests are the guard; do not restructure before `AC-009`
  gives the weighted sum its own.

**Two risks that arrive with cohorts specifically:**

- **A cohort change is a discontinuity.** An account graduating out of onboarding switches
  formula, and its score jumps for a reason that has nothing to do with the account. The
  snapshot records `formulaVersionId`, so the trend can render the change rather than showing
  an unexplained cliff — but the UI must actually say *"the formula changed: this account left
  onboarding"*. Without that, the first graduation looks like a bug and the score loses trust.
- **Configuration sprawl is the failure mode that kills this.** Two cohorts is maintainable.
  Six is a config surface nobody tunes, so five of them silently rot at whatever they were
  seeded with — the same dynamic the use-case implementation statuses were designed to avoid.
  **Cap it early**: ship two, and require a written reason and a calibration plan before a
  third. A cohort nobody re-tunes is worse than no cohort, because it looks maintained.

---

## 13. Open decisions

| Decision | Options | Recommendation | Consequence of delay |
|---|---|---|---|
| `D-A` Retire `lib/health/` outright, or park it with a stated status? | (a) Delete, recording the ideas taken. (b) Mark `Deprecated` and keep the tests. | **(b) now, (a) once the registry lands.** Its 20 tests document behaviour worth keeping while the registry is built. | The headline contradiction stays open and every health document keeps hedging. |
| `D-B` Does the dry run sample or cover the whole portfolio? | (a) All accounts. (b) A sample above a size threshold. | **(a).** The portfolio is small enough, and a sampled preview that misses the account someone cares about is worse than none. | Low. |
| `D-C` Who may publish — Super Admin only, or Admin too? | (a) Super Admin. (b) Admin, matching the Use Case Universe precedent. | **(a).** Republishing is instant and portfolio-wide under D2. Narrower than the Universe's gate, deliberately. | Low, but decide before the UI is built. |
| `D-D` **Which cohorts, concretely?** | (a) Lifecycle only — onboarding, live, renewal window. (b) Lifecycle + commercial tier. (c) Something else. | **(a), starting with onboarding vs everything else.** Lifecycle differences are real and defensible; commercial-segment differences permanently change what a number means relative to peers (D1). | **Blocking.** The cohort list determines the calibration work, and adding a cohort after accounts have history means their trend spans two formulas. |

---

## Coherence check

Introduces no second health score, no second definition of risk, and no second source of
truth — it **removes** one by retiring the engine (`D-A`). No new user-maintained field.
No AI. `appliesTo` adds a field that is deliberately inert (§5.3) with a stated reason.

## Evidence

`lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/metrics/health-evidence.ts` ·
`lib/metrics/health-drag.ts` · `lib/metrics/exec.ts` · `lib/health/pulse.ts` ·
`lib/actions/signals.ts` · `components/settings/ClientHealthEditor.tsx` ·
`app/(app)/clients/[id]/page.tsx` (the onboarding gate behind D1) ·
`scripts/enable-cs-pulse-health-metric.mjs` ·
[health-scoring](../../business-rules/health-scoring.md) ·
[health-engine](../../health-engine.md)

## Documenter handoff — after implementation, not before

- `docs/business-rules/health-scoring.md` — R1 gains applied weights; R5 gains versions; R12
  moves from recompute to read; known inconsistencies 2, 4, 5, 7 and 8 close; inconsistency 1
  closes when `D-A` reaches (a).
- `docs/product/health/README.md` — §1's two-systems section is retired.
- `docs/health-engine.md` — banner it as superseded, naming what was carried across.
- `docs/decisions/` — two records: "persist evidence, derive verdicts", and "retire the engine,
  keep its ideas".
- `docs/GLOSSARY.md` — formula version, applied weight, metric registry.
- **Must not be documented until it ships:** any of the above.
