# Business rule — Health scoring and account status

**Status:** Partially verified — the model, status resolution and evidence rule are
test-backed
**Last verified:** 2026-08-05 · **Commit:** `9d83a22`

> **Rewritten 2026-08-05.** The health engine (`lib/health/`) replaced the flat weighted
> average (`lib/metrics/health.ts`) as the live scorer on 2026-08-03 (`9a8ea59`). Every rule
> below now describes the engine. R1–R9 previously described the retired formula and were
> wrong from the moment the switch landed. R10–R12, which documented CS Pulse as a tenth
> metric, an evidence rule and a tier cap in that formula, are **superseded**: the first two
> have engine equivalents (R2, R7) and the third is subsumed by the status rules (R6).

Narrative: [health](../product/health/README.md).

---

## R1 — Health is a four-component weighted score, interpreted from config

**Definition.** An account's score is a weighted roll-up of four components, each of which is
either a leaf formula or a reweighted branch. The scoring maths is **not hardcoded** — a
model version is a tree of components, formulas, bands and rules that the engine interprets.

**The model.** `MODEL_V1_1`:

| Component | Weight | Mandatory | Missing-data policy |
|---|---|---|---|
| Product Adoption and Value Realization | 50% | **Yes** | `mark_not_assessed` |
| Customer Success Pulse | 25% | **Yes** | `mark_not_assessed` |
| Support and Reliability | 15% | No | `redistribute_weight` |
| Client Sentiment (NPS only) | 10% | No | `redistribute_weight`, 90-day validity |

**Leaves** (weight within parent): Meaningful Reach 0.4, Workflow Progress 0.3, Completion
and Outcomes 0.2, Use Case Breadth 0.1 · Stakeholder Coverage 0.35, Engagement and Execution
0.3, Renewal Readiness 0.35 · SLA and Resolution 0.3, Incident Burden 0.3, Aged and Reopened
0.2, Ticket Satisfaction 0.2.

**Inputs.** Metabase usage, Intercom tickets and surveys, the CSM's CS Pulse, stakeholder
profiles, deal dates, and use-case implementations.

**Exceptions.**
- **A mandatory component with no data ⇒ the whole account is `Not Assessed`.**
- An optional component with no data redistributes its weight across the rest.
- Client Sentiment ignores an NPS reading older than 90 days.

**Code.** [`lib/health/model-v1.ts`](../../lib/health/model-v1.ts),
[`engine.ts`](../../lib/health/engine.ts), [`formula.ts`](../../lib/health/formula.ts).
**Tests.** `lib/health/engine.test.ts` (25).

---

## R2 — Score, band and applied status are three different things

**Definition.**

| Field | Is |
|---|---|
| `score` | The weighted arithmetic, 0–100. **Stored unmodified** |
| `band` | Where that score lands on the cutoffs, before any judgement |
| `tier` | The **applied status** — the engine's conclusion after gates and rules |

**Bands:** Healthy ≥ 65 · Watch ≥ 50 · At Risk ≥ 25 · Critical < 25. Resolved by lower bound.

**Rule.** `tier` carries the applied status, not the band. If it carried the band, the
clients list would show Healthy for an account the profile calls Watch, and a cap would
exist only in a drawer nobody opens.

**The score and the status legitimately disagree.** Neither is hidden; they answer different
questions.

**Code.** [`lib/health/to-stored.ts`](../../lib/health/to-stored.ts).

---

## R3 — Never re-band the raw score

**Definition.** Every surface reads `health.tier` through
[`lib/health/status.ts`](../../lib/health/status.ts) → `accountStatus()`. No surface derives
its own band.

**Why.** The clients list, the team rollup and the signals engine each re-derived a band via
`healthBand()` on 75/55 cutoffs — matching neither the model's 65/50/25 nor each other.
Measured on the same scored data, the two approaches **disagreed on 20 of 133 accounts, in
both directions**: Implementation and Not Assessed accounts counted as at-risk, while
genuinely capped accounts scoring 68–70 did not.

**Matching is case- and space-insensitive**, because bands are admin-renameable and a literal
string comparison silently stops matching the day somebody edits a name. The retired engine
wrote "At risk"; this one writes "At Risk".

**Exception.** An unrecognised tier — an admin-renamed band like "Thriving" — falls back to
the score, because a custom name still sits in a numeric band and guessing "not assessed"
would hide the account from every count.

**Tests.** `lib/health/status.test.ts`.

---

## R4 — Three statuses are lifecycle facts, not judgements

**Definition.** `Churned` · `Implementation` · `Not Assessed`. No score should be read from
them, and **any surface counting "how many accounts are at risk" must skip them**
(`NON_SCORING_STATUSES`).

**Why.** Counting them as at-risk is how the old dashboard reported 75 at-risk accounts on a
book that was mostly churned.

**Related rule.** A churned account is **gone, not un-reviewed** — it resolves to `Churned`,
never `Not Assessed` (commit `810de4e`). Only one of those asks a CSM to go and look.

---

## R5 — Five qualification gates: each must HOLD, or the account is capped to Watch

| Gate | Condition |
|---|---|
| `q_product` | Product Adoption ≥ 65 |
| `q_pulse` | CS Pulse ≥ 75 |
| `q_coverage` | Data coverage ≥ 85% |
| `q_multithreaded` | Not single-threaded — **`ne: true`** |
| `q_pulse_valid` | A valid CS Pulse review exists |

**An account cannot be Healthy unless all five hold.**

**The exception that defines the family.** `q_multithreaded` uses `ne: true`, not
`isFalse: true`. A gate must *hold* or the account is capped, so `isFalse` meant an
**unanswered** question failed the gate exactly like an explicit "yes, single-threaded" —
penalising the account for *Signal's* missing data. `client_contacts.is_primary` is populated
nowhere in this workspace and the Pulse question is often blank, so this capped **every**
account to Watch regardless of score, including ones scoring 90.

`ne: true` holds for both `false` and `null`. The gate now fires only when somebody actually
said the account is single-threaded.

**The same principle, three places:** the gate above · "silence is not a Yes" for unanswered
Pulse questions (`9625e0e`) · a zero primary-contact count is *unknown*, not single-threaded
(`b47fe07`).

---

## R6 — Sixteen status rules, applied in priority order

**Definition.** Lower priority number runs first. Four actions.

| Priority | Action | Rules |
|---|---|---|
| 1 | **replace → Churned** | Confirmed written termination |
| 10–12 | **force → Critical** | Termination notice received · Imminent churn evidence · Unresolved executive escalation |
| 20–26 | **cap → At Risk** | Active critical incident · Negative renewal intent · Suspension requested · Material scope reduction requested · No meaningful activity 60d post-launch · CS Pulse < 60 · Competitive replacement underway |
| 40–44 | **cap → Watch** | Product Adoption < 65 · Single-threaded · No sponsor/economic-buyer access · Champion left without replacement · Renewal < 90d with economic buyer unknown |

**`cap_max` lowers a status; it never raises one.** `force` sets it outright. `churned`
replaces it.

**The calculated score is never rewritten by a rule.** Only the applied status moves, and the
triggered reasons are stored so the profile can explain the verdict.

---

## R7 — No customer evidence, no score ("Not assessed")

**Definition.** An account whose score rests on nothing the customer did or said shows
**"Not assessed"** instead of a number.

**Applied by:** `HealthPill` (so every readout behaves the same), the CS Pulse panel, and the
`/clients` at-risk headline count — those accounts need a CSM to go and look, not to be
triaged as failing.

**Exception.** A usage reading of **zero is evidence**, not a gap. Only an *absent* metric
counts as missing evidence.

**Known inconsistency, and the reason this rule needs a test to stay true.** On the engine
switch, `CUSTOMER_EVIDENCE_METRICS` still listed the retired formula's keys — with **zero
overlap** against the engine's component keys — so `hasCustomerEvidence()` returned false for
every row and the pill read "Not assessed" on **all 133 accounts**, on top of perfectly good
scores. Fixed in `afc55a5`: 133/133 → 2/133.

**Code.** [`lib/metrics/health-evidence.ts`](../../lib/metrics/health-evidence.ts).
**Tests.** `lib/metrics/health-evidence.test.ts`.

---

## R8 — Configuration re-scores the whole book, immediately

**Definition.** Component weights, bands, the five gates, the sixteen status rules and the
minimum data coverage are **workspace configuration**. Saving any of them re-scores every
account.

**Constraint.** Weights are **normalised to sum to 1.0 on apply** — the engine's
redistribution assumes the enabled weights total 1, and a half-finished edit saved at 90%
would quietly inflate every score.

**Deliberately not a condition builder.** A rule's `when` encodes what the signal *means*.
A rule with no number, or with more than one, is **toggle-only** rather than guessing which
number was meant.

**Everything is re-scored on each recompute** rather than read back from a number persisted
at capture time, because the Pulse dimensions and rating scale are themselves config — the
same stored ratings must score differently after an admin retunes them.

**Code.** `lib/health/model-overrides.ts`, `model-overrides-store.ts`,
`app/(app)/settings/client-health-actions.ts`. **Tests.** `lib/health/model-overrides.test.ts`.

---

## R9 — Explanations are generated from the model, not written alongside it

**Definition.** Every gate and status rule is restated in plain English **from the same
`when` the engine evaluates**, and the profile's Health signals panel reports the *distance*
to a threshold rather than only the rule.

**Why it is a rule and not a nicety.** A hand-written explanation beside a config-driven rule
is a second source of truth that drifts on the first retune.

**Code.** `lib/health/rule-language.ts`, `describe-model.ts`, `signal-language.ts`.
**Tests.** `describe-model.test.ts`, `signal-language.test.ts`, `lib/actions/signals-health.test.ts`.

---

## R10 — Recomputation schedule

| Trigger | Scope |
|---|---|
| `/api/cron/client-health`, daily `0 9 * * *` | Every client |
| A Super Admin saving Settings → Client health | Every client |

The cron time is deliberate: after intercom-sync, usage-sync and client-actions, so it reads
same-day-fresh support and usage data.

**Consequence:** the Action list's health signals read **yesterday's** status, because
actions are generated at `0 8`, an hour before health recomputes.

---

## R11 — Health is not churn, risk, or renewal confidence

| Concept | Nature | Where |
|---|---|---|
| **Health** | Current condition — score + applied status | `clients.health` |
| **Risk signal** | Evidence contributing to a read | CS Pulse risk signals; the model's facts |
| **Renewal confidence** | Commercial outlook | Insights forward outlook |
| **Churn** | Recorded outcome with its own taxonomy | `arr_events` type `churn` + reason |

Four distinct concepts; never synonyms. See
[decision 0007](../decisions/0007-define-health-risk-renewal-and-churn-separately.md).

---

## Known inconsistencies

1. **The retired formula is still in the tree and still tested.** `lib/metrics/health.ts` and
   `health-config.ts` have **no importers outside `health.test.ts` and `health-cap.test.ts`**
   — 21 tests exercising a module nothing calls. Dead code that reads as live.
2. **The engine's 19 tables are unused.** Scoring runs, but writes to `clients.health` JSONB.
   `health_score_snapshots` is unwritten, so there is **no health history** and
   `/reports/health` remains "as of today".
3. **Three key-set migration failures landed in one day** (§R7) — a key set written against
   the retired formula, still compiling, silently matching nothing. Nothing in the type
   system prevents a fourth.
4. **Status changes wait for the recompute.** Rating an account Critical does not move its
   status until 09:00 or a config save.
5. **`CsPulsePanel.tsx`'s module header still names `lib/metrics/health.ts`** as a live
   source of a second health number. Recorded in
   [contradictions](../known-limitations/contradictions.md).

## Open questions

- Are the 19 `health_*` tables intended to be used, or removed?
- When is `lib/metrics/health.ts` deleted?
- Should health history be persisted so the Health page can trend?
- Should the status cap apply at read time, so a Critical rating takes effect immediately?

## Source references

`lib/health/model-v1.ts` · `engine.ts` · `formula.ts` · `service.ts` · `to-stored.ts` ·
`status.ts` · `drag.ts` · `model-overrides.ts` · `rule-language.ts` ·
`lib/metrics/health-evidence.ts` · `lib/repo/drizzle.ts` ·
`app/api/cron/client-health/route.ts` · `docs/health-engine.md`

**Tests read:** `lib/health/engine.test.ts` · `status.test.ts` · `model-overrides.test.ts` ·
`describe-model.test.ts` · `signal-language.test.ts` · `support-facts.test.ts` ·
`lib/metrics/health-evidence.test.ts` · `lib/actions/signals-health.test.ts`
