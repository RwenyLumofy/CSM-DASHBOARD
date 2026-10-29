# Business rule: Health scoring and at-risk classification

**Status:** Verified against code. One health system scores accounts: the engine in
`lib/health/`, running the published model in `lib/health/model-v1.ts`.
**Last verified:** 2026-10-29 · **Commit:** `3b635c3`

Since 2026-08-03 (`9a8ea59`, "the recompute now runs the published model") the daily
recompute scores every account with the engine. The older weighted formula in
`lib/metrics/health.ts` and its `client_health_formula` config no longer produce any stored
score. See [Leftovers from the old formula](#leftovers-from-the-old-formula).

---

## R1: The score is a weighted sum of four components

**Definition.** A 0–100 calculated score from four top-level components, each itself a
weighted sum of sub-components scored 0–100.

| Component | Weight | Mandatory | Sub-components (weight inside the component) |
|---|---|---|---|
| Product Adoption and Value Realization | **50%** | Yes | Meaningful Reach 40% · Workflow Progress 30% · Completion and Outcomes 20% · Use Case Breadth 10% |
| Customer Success Pulse | **25%** | Yes | Stakeholder Coverage 35% · Engagement and Execution 30% · Renewal Readiness 35% |
| Support and Reliability | **15%** | No | SLA and Resolution 30% · Critical/High Incident Burden 30% · Aged and Reopened Tickets 20% · Ticket Satisfaction 20% |
| Client Sentiment | **10%** | No | NPS only, normalised as `(nps + 100) / 2` |

**How sub-components score.**

| Sub-component | Formula |
|---|---|
| Meaningful Reach | `meaningfully_active_users / target_cohort × 100`, falls back to login-proxy active users |
| Workflow Progress | Actual progress against stage-expected progress |
| Completion and Outcomes | `completed_matured_workflows / total_matured_workflows × 100` |
| Use Case Breadth | Step table on live use cases: 4+ → 100, 3 → 80, 2 → 60, 1 → 35, 0 → 0 |
| Pulse dimensions | CSM rating: Strong 100 · Moderate 75 · Weak 40 · Critical 0 |
| SLA and Resolution | Resolved within target ÷ eligible resolved tickets |
| Incident Burden | Any open P1 → 0 · 2+ aged high-severity → 40 · 1+ resolved high-severity → 75 · else 100 |
| Aged and Reopened | Serious persistent issue → 0 · 3+ aged/reopened → 40 · 1+ → 75 · else 100 |
| Ticket Satisfaction | Satisfied ÷ valid rated tickets, needs at least 3 ratings in 90 days |

**Why these weights.** Adoption carries half because value realised is the strongest
predictor of renewal. Pulse is the only judgement in the model and covers what usage and
support data cannot see (a champion leaving, a stalled sponsor). Support and sentiment are
optional because many accounts have little of either.

**Why Use Case Breadth.** It replaced "Manager and Admin Participation", which counted
performance cycles rather than people and had data on 19 of 121 usage snapshots. Breadth is
data Signal owns for every live account, and an account running one use case is one budget
review away from having no reason to renew.

**Code.** `MODEL_V1_1` in [`lib/health/model-v1.ts`](../../lib/health/model-v1.ts),
evaluated by [`lib/health/engine.ts`](../../lib/health/engine.ts). Facts are assembled in
[`lib/health/facts.ts`](../../lib/health/facts.ts).

---

## R2: Missing data is redistributed, or the account is Not Assessed

| Situation | Effect |
|---|---|
| An optional sub-component or component has no data | Its weight is redistributed proportionally to the ones that do |
| A **mandatory** component (Adoption or Pulse) has no data | **Not Assessed**, no score |
| Data coverage below **70%** of the enabled top-level weight | **Not Assessed**, no score |
| Account status is `onboarding` | **Implementation**, not scored |

Coverage is measured on the original weights, before redistribution.

**Why.** Absent data is our gap, not the customer's. A low number would read as a bad
account; Not Assessed says the truth and points at the data fix.

**A Pulse lapses after 30 days.** A lapsed Pulse counts as missing, so the account becomes
Not Assessed until it is refreshed.

---

## R3: The score resolves to a band

| Band | Score |
|---|---|
| Healthy | 65 and above |
| Watch | 50–64 |
| At Risk | 25–49 |
| Critical | below 25 |

Bands are editable in Settings → Client health (R6).

---

## R4: The applied status can only be lower than the band

The band is where the number lands. The **applied status** is what every surface shows.
Rules can hold an account below its band; nothing lifts it above.

**Healthy qualification.** All must hold, otherwise the account is capped at Watch:

- Product Adoption ≥ 65
- CS Pulse ≥ 75
- Data coverage ≥ 85%
- Not single-threaded (fires only when someone said it is; blank is not a yes)
- A valid CS Pulse exists

**Status rules,** applied in priority order:

| Effect | Rules |
|---|---|
| Replace with **Churned** | Account status is `churned` |
| Force **Critical** | Termination notice received · Imminent churn evidence · Unresolved executive escalation |
| Cap at **At Risk** | Open P1 ticket · Negative renewal intent · Suspension requested · Material scope reduction requested · No activity 60 days after launch · CS Pulse < 60 · Competitive replacement underway |
| Cap at **Watch** | Product Adoption < 65 · Single-threaded · No sponsor access · Champion left without replacement · Renewal within 90 days and economic buyer unknown |

Coverage below 85% also caps at Watch.

**Where the facts come from.** Single-threaded, sponsor access, champion left and economic
buyer known come from the CSM's Pulse answer, then the mapped stakeholder roster, and stay
`null` when neither says. Renewal intent, competitive replacement, suspension, scope
reduction and executive escalation come from the Pulse. Incidents come from support tickets.

**Why.** A weighted average can hide one serious problem. On 2026-08-03, eight of nine
accounts carrying a Critical Pulse rating read Healthy or Watch under the old formula,
because record-keeping metrics at 100 outvoted it. The calculated score is never
overwritten; each rule that moved the account is stored in `reasons` / `reasonDetails`.

---

## R5: What is stored

`clients.health` (JSONB), written by `toStoredHealth` in
[`lib/health/to-stored.ts`](../../lib/health/to-stored.ts):

| Field | Meaning |
|---|---|
| `score` | The calculated score, unmodified |
| `tier` | The **applied status**, not the band |
| `band` | The band the score fell in, before caps |
| `reasons`, `reasonDetails` | Why `tier` differs from `band`, with rule id and shortfall |
| `coverage`, `confidence` | Share of weight with data; High ≥ 85%, Moderate ≥ 70% |
| `momentum` | Change since the last stored score: Improving at +5 or more, Stable, Declining, Rapidly Declining at −10 or worse |
| `notAssessed`, `notAssessedReason` | Set when R2 stops scoring |
| `evidence` | Metric values behind each component |

`Churned`, `Implementation` and `Not Assessed` are lifecycle states, not health judgements.
Counts of at-risk accounts must skip them (`NON_SCORING_STATUSES`).

---

## R6: What an admin can change

Settings → Client health (Super Admin), stored in `workspace_config.health_model_overrides`:

- The four top-level component weights
- The band names and cutoffs
- Each qualification gate and status rule: on/off, its single numeric threshold, and where
  a status rule caps to
- Minimum coverage for assessment
- CS Pulse dimensions and rating scale

Formulas, sub-component weights and rule conditions stay in code. An admin can move a
number; they cannot retype what a rule means.

**Code.** [`lib/health/model-overrides.ts`](../../lib/health/model-overrides.ts),
`model-overrides-store.ts`.

---

## R7: Recomputation

| Trigger | Scope |
|---|---|
| `/api/cron/client-health`, daily `0 9 * * *` | Every client |
| Any save on Settings → Client health | Every client |
| Recalculate button on the client profile | That client |

The cron runs after intercom-sync (`0 6`), usage-sync (`15 */4`) and client-actions
(`0 8`). The Action list therefore reads **yesterday's** health.

Tier moves found by the daily cron become notifications. Moves caused by a Settings save do
not, because the model changed, not the accounts.

---

## R8: At-risk classification in the Action list

The Action list reads the **applied status and its reasons**, not a score threshold. It
raises one recommendation per active gate or rule, high priority on Critical or At Risk,
medium otherwise. Lifecycle states raise nothing.

**Code.** `#5 Health` in [`lib/actions/signals.ts`](../../lib/actions/signals.ts).

---

## R9: Health is not churn, risk, or renewal confidence

| Concept | Nature | Where it lives |
|---|---|---|
| **Health** | Current condition: score + applied status | `clients.health` |
| **Risk signal** | Evidence contributing to a read | CS Pulse risk signals; Action list signals |
| **Renewal confidence** | Commercial outlook | Forward outlook in Insights |
| **Churn** | Recorded outcome with its own taxonomy | `arr_events` type `churn` + reason |

---

## Known gaps

1. **Three status rules can never fire.** Nothing populates `termination_notice_received`,
   `imminent_churn` or `days_since_meaningful_activity` in `lib/health/facts.ts`.
2. **No health history.** Only the latest score is stored; momentum compares against the
   previous row. The engine's `health_*` tables have no writer.
3. **No audit of Settings changes** to the model.
4. **NPS and ticket CSAT were null for every client** when last checked (2026-07-31). Where
   that still holds, Sentiment and Ticket Satisfaction are redistributed away rather than
   scored. Not re-verified in this pass.

## Leftovers from the old formula

Still in the repo, not used for any stored score:

- `lib/metrics/health.ts` (`computeHealthScore`), `health-config.ts`, `health-config-store.ts`
- `workspace_config.client_health_formula`, still present in the database
- An unused `getClientHealthConfig` import in `lib/repo/drizzle.ts`
- The header comment in `lib/actions/signals.ts` that still describes `< 55` / `55–74`
  thresholds

Do not quote the old metrics, weights, or 75/55 tiers as current behaviour.

## Source references

`lib/health/model-v1.ts` · `lib/health/engine.ts` · `lib/health/facts.ts` ·
`lib/health/service.ts` · `lib/health/to-stored.ts` · `lib/health/model-overrides.ts` ·
`lib/repo/drizzle.ts` (`recomputeClientHealth`) · `app/api/cron/client-health/route.ts` ·
`lib/actions/signals.ts` · `lib/health/engine.test.ts`
