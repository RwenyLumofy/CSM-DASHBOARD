# Health scoring — the plan

> Written by `signal-product-manager`. This is the **sequencing** document: what to build,
> in what order, why each stage waits for the one before it, and what tells you it is time
> to start the next. The structural design it implements is
> [health-scoring-structure](health-scoring-structure.md). What Signal does **today** is
> [health-scoring](../../business-rules/health-scoring.md).

**Status:** Proposed
**Date:** 2026-08-03
**Verified against commit:** `6660fe8`

---

## The shape of the problem

Signal's health score already has more configurability than most people realise — an admin
can change which of ten signals count, their weights, their cutoffs, and the tier bands.
What it lacks is everything that makes changing it *safe*: no version history, no audit, no
preview, no score history, and — the one that matters most day to day — **the weight an admin
sets is not the weight applied to most accounts**.

So the work is not "make health configurable". It is:

1. Make the number **trustworthy and explainable** as it stands.
2. Make **changing** it non-destructive.
3. Make changing it **informed**.
4. Make **adding a signal** cheap.
5. Make it **fit different kinds of account**.
6. Make it **accountable to what actually happened**.

Those are the six stages below, in dependency order. Each is independently valuable and
shippable. **None of them is a prerequisite for using health — the score works today.** They
are prerequisites for *trusting* it as it changes.

---

## Standing constraints

Three rules that apply to every stage. They are what stop this becoming a second health
system, which is the mistake already made once.

**1. Persist evidence, derive verdicts.**
A score row stores what was measured — sub-scores, applied weights, and the raw facts a rule
needs. It does not store conclusions. Tier, assessed/not-assessed and any cap are computed on
read. This is R11's design; it shipped with no migration, no recompute and no rewritten rows.
R12 chose the opposite and bought a staleness window the documentation has to apologise for.

**2. Consumers read verdicts, never bands.**
`tier`, `assessed`, `cappedBy` are the public surface. Nothing downstream bands on `score`.
Without this, every hardcoded threshold defeats every configuration change upstream.

**3. Tiers stay workspace-global.**
Even when formulas eventually vary (Stage 5), the tier vocabulary does not. The score is a
within-formula number; **the tier is the portfolio-comparable unit**. Break this and Today,
the at-risk count, health drag and the Insights distribution all quietly stop comparing
like with like.

---

## Stage 0 — Make the number trustworthy

**Build this now.** Everything here fixes a defect that exists today, independently of how
configurable health ever becomes.

| Work | Why it stands alone |
|---|---|
| **Test the weighted sum and renormalisation** | R10, R11 and R12 are each pinned by tests. The formula all three feed is not. This is the guard for every later change |
| **Consumers read `tier`, not hardcoded 55/74** | The only user-visible bug here — recut the tiers and the Action list disagrees with the profile. R12 already widened it |
| **Store and show applied weights** | A CSM cannot be told why their account scores what it does. `cs_pulse` set to a 25% share is ~75% on an account carrying only usage and Pulse |
| **Derive R12's cap at read** | An account rated Critical today keeps its old tier until tomorrow's cron. A live defect, not a configurability question |

**What it unlocks.** An explainable score, and a test suite that makes every later change
survivable.

**How you know it worked.** A CSM can open any account and see which signals produced the
number and how much each contributed. The Action list and the profile never disagree about
who is at risk.

**Move to Stage 1 when:** someone wants to change the formula.

---

## Stage 1 — Make changing it safe

| Work | Delivers |
|---|---|
| Publish immutable **formula versions** instead of saving over one | Every past score stays interpretable |
| **Audit** — who published what, when, with an optional note | Answers "why did every score move last Tuesday?" |
| Pin every score to the version that produced it | Explainability survives a retune |
| **Snapshot** health on each recompute | History, and therefore trend |

**What it unlocks.** Retuning stops being destructive. This is also the stage that quietly
delivers *named, switchable formulas* — a version is already the unit.

**How you know it worked.** You can answer "what was the formula in June, and what did it
score this account?" without asking anyone.

**Why it waits.** Nothing above is useful until the number itself is trustworthy (Stage 0),
and versioning a formula nobody changes is machinery for its own sake.

**Move to Stage 2 when:** a retune surprises someone.

---

## Stage 2 — Make changing it informed

| Work | Delivers |
|---|---|
| **Diff** the draft against the published version, in product language | See what you are about to change |
| **Dry run** across the whole portfolio before publishing | *"38 accounts change tier · 6 into the lowest · mean −4 · 3 become Not assessed"* |
| Before/after distribution on the health report | Judge the change after the fact |

**What it unlocks.** Tuning with evidence instead of nerve. Today the only way to discover
what a weight change does is to do it to every account at once.

**How you know it worked.** Nobody publishes a formula change without knowing its blast
radius first.

**Move to Stage 3 when:** someone asks for a new signal for the second time.

---

## Stage 3 — Make adding a signal cheap

| Work | Delivers |
|---|---|
| **Metric registry** replacing the closed `HealthMetricKey` enum | A signal is a record, not an enum member plus a hardcoded branch |
| **Five normaliser shapes**, open parameters — `linear` · `binary` · `decay` · `banded` · `passthrough` | Covers all ten current metrics without a formula language |
| `evidenceClass` on each metric | R11's customer-vs-record-keeping list becomes a property, not a hardcoded set |
| `introductionPolicy` — declarative | Replaces the hand-written migration script per metric |

**What it unlocks.** Adding a signal from a source Signal already reads becomes a
configuration entry rather than a release. Reading a *new* source stays code — correctly, and
always will.

**Why it waits.** This is the largest single piece of work here, and it only pays off from
the second new metric onward. `cs_pulse` cost an enum member, a scoring branch and
[`scripts/enable-cs-pulse-health-metric.mjs`](../../../scripts/enable-cs-pulse-health-metric.mjs)
solving `w = enabledTotal / 3` by hand. One of those is tolerable. Three is not.

**Move to Stage 4 when:** there is a written case that one formula is wrong for a specific
lifecycle stage.

---

## Stage 4 — Make it fit different kinds of account

**Deliberately deferred as of 2026-08-03 — "too early".** Recorded here as the destination,
not as work.

| Work | Delivers |
|---|---|
| `appliesTo` resolution — ordered, first match wins, mandatory catch-all | An account resolves to exactly one formula, auditably |
| Two cohorts to start: **onboarding**, and everything else | During onboarding, low usage is expected and time-to-value is the signal |
| Constraint 3 enforced — tiers stay global | Cross-account comparison survives |

**The trap to avoid.** Lifecycle stage (onboarding → live → renewal) is a defensible reason
to score differently: the same account passes through each. Commercial segment (tier, ARR
band, industry) is not, or not without a stated case — an account sits in one permanently, so
a per-segment formula permanently changes what its number means next to its peers.

**The other trap.** Two cohorts is maintainable. Six is a configuration surface nobody
re-tunes, so five rot at whatever they were seeded with while looking maintained. Cap it
early: require a written reason and a calibration plan before a third.

**One field to carry now, though.** `FormulaVersion.appliesTo`, nullable, unused. A nullable
column today costs nothing; retrofitting it later means migrating every version and every
score.

**Move to Stage 5 when:** there is enough renewal and churn history to test against.

---

## Stage 5 — Make it accountable to outcomes

| Work | Delivers |
|---|---|
| Compare scores against renewal, contraction and churn outcomes | Calibration from evidence, not opinion |
| Track the two failure modes explicitly: **churned while Healthy**, **At risk that renewed** | The only honest measure of whether health works |

**What it unlocks.** The difference between a score people believe and a score people
actually act on.

**Why it is last.** It needs Stage 1's history and Stage 2's before/after to mean anything,
and it needs enough elapsed renewals to be more than anecdote.

---

## What gets retired

**`lib/health/` — the unwired engine.** A complete, tested, config-driven engine with
versioning, validation, formula trees, status rules and 19 persistence tables. Twenty passing
tests. Wired to nothing.

**It is not being wired**, and this plan takes its ideas rather than its code. Its own status
section lists data loaders, jobs, REST APIs, the admin model editor and audit writes as
outstanding — most of the remaining work, not a wiring task — while the live path gained three
tested rules on 2026-08-03 and has the momentum.

- **At Stage 1:** mark it `Deprecated`, stating what was carried across. Keep its tests; they
  document behaviour worth having while versioning is built.
- **At Stage 3:** delete it. Two health systems is the headline contradiction in Signal's
  documentation and the reason every health document has to hedge.

---

## The plan in one table

| Stage | Delivers | Start it when | Held by |
|---|---|---|---|
| **0 · Trustworthy** | Explainable score, tested formula, one at-risk definition | **Now** | — |
| **1 · Safe to change** | Versions, audit, history | Someone wants to change the formula | Stage 0 |
| **2 · Informed** | Diff, dry run, before/after | A retune surprises someone | Stage 1 |
| **3 · Cheap to extend** | Metric registry, normalisers | A new signal is asked for twice | Stage 0 |
| **4 · Fits the account** | Lifecycle cohorts, global tiers | A written case that one formula is wrong for a stage | Stages 1–3 |
| **5 · Accountable** | Outcome validation | Enough renewal history | Stages 1–2 |

---

## What this plan refuses to do

- **Build configuration machinery before anyone has changed the configuration.** Stages 1–3
  are triggered by observed behaviour, not by a date. The failure mode this avoids is a
  Settings page full of knobs nobody turns, which is worse than fewer knobs because it looks
  maintained.
- **Add a formula language.** Five normaliser shapes cover all ten current metrics. Fifteen
  formula types is what the unwired engine has, and it is part of why it needs a bespoke
  editor before anyone can use it.
- **Score commercial segments differently** without a stated case (Stage 4).
- **Let any surface band on `score`** (Constraint 2).

---

## Open decisions

| Decision | Recommendation | Blocking? |
|---|---|---|
| Retire `lib/health/` — delete now or deprecate first? | Deprecate at Stage 1, delete at Stage 3 | No |
| Who may publish a formula version? | Super Admin only — publishing is instant and portfolio-wide | Not until Stage 1's UI |
| Does the Stage 2 dry run cover the whole portfolio or a sample? | Whole portfolio; it is small enough, and a sample that misses the account someone cares about is worse than none | Not until Stage 2 |

---

**Documenter handoff.** Nothing here is documented as behaviour until it ships. On each
stage landing, `docs/business-rules/health-scoring.md` is the document that changes — Stage 0
closes known inconsistencies 2 and 4, Stage 1 closes 7 and 8, and retiring the engine closes 1.
