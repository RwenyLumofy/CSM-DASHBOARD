# Health and CS Pulse

**Status:** Partially verified

> **Changed 2026-08-03 → 2026-08-05 — the engine replaced the formula.** The health engine
> in `lib/health/` is now **the** scorer. `recomputeClientHealth` runs the published model
> (`MODEL_V1_1`), and every surface reads the **applied status** it concludes. The flat
> ten-metric weighted average in `lib/metrics/health.ts` is retired and has **no importers
> outside its own tests**. Everything §1 and §2 said before this date described that retired
> formula and has been rewritten.
>
> The switch moved 20 of 133 accounts' answers and re-sorted the book: 43 "Healthy" became
> 3, and 79 accounts previously scored as live are now correctly `Churned` (commits
> `9a8ea59`, `31777c2`).

---

## 1. One score, one status — how they differ

Signal computes **one** health result per account, nightly. It has two numbers and they mean
different things.

| | Meaning | Where |
|---|---|---|
| **`score`** | The weighted arithmetic, 0–100. Stored **unmodified** | `clients.health.score` |
| **`band`** | Where that score lands on the model's cutoffs, before any judgement | `clients.health.band` |
| **`tier`** | The **applied status** — the engine's conclusion after gates and rules | `clients.health.tier` |

**`tier` is what the product means by "how is this account doing".** An account can score 83
and be capped to At Risk; the score is not rewritten, and both are stored, because they
answer different questions.

**Never re-band `health.score` yourself.** [`lib/health/status.ts`](../../../lib/health/status.ts)
is the single answer, and it exists because three surfaces used to re-derive a band on
75/55 cutoffs matching neither the model's 65/50/25 nor each other. On the same scored data
the two approaches disagreed on **20 of 133 accounts**, in both directions.

`accountStatus()` matches the stored tier case- and space-insensitively, because bands are
admin-renameable and a literal comparison would silently stop matching the day somebody
edits a name. An unrecognised tier falls back to the score rather than guessing "not
assessed", which would hide the account from every count.

### Three statuses are lifecycle facts, not judgements

`Churned` · `Implementation` · `Not Assessed`. No score should be read from them, and any
surface counting "how many accounts are at risk" must skip them
(`NON_SCORING_STATUSES` in [`lib/health/to-stored.ts`](../../../lib/health/to-stored.ts)).

Counting them as at-risk is exactly how the old dashboard reported 75 at-risk accounts on a
book that was mostly churned.

---

## 2. The published model

**Verified** — `lib/health/engine.test.ts` (25 tests) plus `status.ts`, `model-overrides.ts`,
`describe-model.ts`, `signal-language.ts` and `support-facts.ts` test files.

`MODEL_V1_1` in [`lib/health/model-v1.ts`](../../../lib/health/model-v1.ts). The scoring
maths is **not hardcoded** — a model version is a tree of components, formulas, bands and
rules that the engine interprets. New models are new *config*, never new engine code.

### 2.1 Four components

| Component | Weight | Mandatory? | Missing-data policy | Leaves (weight within parent) |
|---|---|---|---|---|
| **Product Adoption and Value Realization** | 50% | **Yes** | `mark_not_assessed` | Meaningful Reach 0.4 · Workflow Progress 0.3 · Completion and Outcomes 0.2 · **Use Case Breadth** 0.1 |
| **Customer Success Pulse** | 25% | **Yes** | `mark_not_assessed` | Stakeholder Coverage 0.35 · Engagement and Execution 0.3 · Renewal Readiness 0.35 |
| **Support and Reliability** | 15% | No | `redistribute_weight` | SLA and Resolution 0.3 · Incident Burden 0.3 · Aged and Reopened 0.2 · Ticket Satisfaction 0.2 |
| **Client Sentiment** | 10% | No | `redistribute_weight`, 90-day validity | NPS only, normalised `(nps + 100) / 2` |

**A mandatory component with no data makes the whole account `Not Assessed`.** An optional
one redistributes its weight across the rest. Nothing is faked with a neutral value.

Two deliberate exclusions worth knowing:

- **Platform/survey CSAT is not a sentiment input.** Sentiment tracks relationship advocacy
  via NPS; *ticket* CSAT sits inside Support and Reliability instead.
- **Use Case Breadth replaced Manager Participation** (commit `32923a3`).

### 2.2 Bands — where a score lands before judgement

| Band | Score |
|---|---|
| Healthy | ≥ 65 |
| Watch | 50 – 64.99 |
| At Risk | 25 – 49.99 |
| Critical | < 25 |

Resolved by lower bound. **These are the model's own cutoffs and they are now the product's**
— unlike the retired formula, whose tiers were free-form admin config.

### 2.3 Five qualification gates — each must HOLD, or the account is capped

An account cannot be Healthy unless **all five** hold. Each caps to **Watch**.

| Gate | Condition |
|---|---|
| `q_product` | Product Adoption ≥ 65 |
| `q_pulse` | CS Pulse ≥ 75 |
| `q_coverage` | Data coverage ≥ 85% |
| `q_multithreaded` | Not single-threaded — **`ne: true`, not `isFalse`** |
| `q_pulse_valid` | A valid CS Pulse review exists |

**The `ne: true` on `q_multithreaded` is a rule worth understanding.** A qualification gate
must *hold* or the account is capped, so `isFalse` meant an **unanswered** question failed
the gate exactly like an explicit "yes, single-threaded" — penalising the account for
*Signal's* missing data. `client_contacts.is_primary` is populated nowhere in this
workspace and the Pulse question is often blank, so this capped **every** account to Watch
regardless of score, including ones scoring 90. `ne: true` holds for both `false` and
`null`: the gate now fires only when somebody actually said the account is single-threaded.

Related: **a zero primary-contact count is unknown, not "single-threaded"** (commit
`b47fe07`).

### 2.4 Sixteen status rules, applied in priority order (low number first)

| Priority | Action | Rules |
|---|---|---|
| 1 | **replace → Churned** | Confirmed written termination |
| 10–12 | **force → Critical** | Termination notice received · Imminent churn evidence · Unresolved executive escalation |
| 20–26 | **cap → At Risk** | Active critical incident · Negative renewal intent · Suspension requested · Material scope reduction requested · No meaningful activity 60d post-launch · CS Pulse < 60 · Competitive replacement underway |
| 40–44 | **cap → Watch** | Product Adoption < 65 · Single-threaded · No sponsor / economic-buyer access · Champion left without replacement · Renewal < 90d with economic buyer unknown |

Every rule carries a `reasonTemplate`, and the triggered reasons are stored on the account —
which is what makes §4's Health signals panel able to explain a verdict rather than restate
a number.

### 2.5 Gates and rules are configurable, and re-scoring is immediate

Since commit `1aec1a1`, Settings → Client health carries the five gates and sixteen status
rules, plus the minimum data coverage. Each rule can be switched **off**, have its single
number moved, and (status rules) have its cap target changed. **Saving re-scores every
account.**

**Deliberately not a condition builder.** The `when` conditions encode what a signal
*means*; a free-text editor there yields a model that still runs and silently measures
something else. A rule with no number, or with more than one (the renewal-window rule reads
two signals), is **toggle-only** rather than guessing which number was meant.

Component weights and bands are workspace config too
([`lib/health/model-overrides.ts`](../../../lib/health/model-overrides.ts)), **normalised to
sum to 1.0 on apply** — the engine's redistribution assumes the enabled weights total 1, and
a half-finished edit saved at 90% would quietly inflate every score.

Every rule is restated in plain English **generated from the same `when` the engine
evaluates** ([`lib/health/rule-language.ts`](../../../lib/health/rule-language.ts),
[`describe-model.ts`](../../../lib/health/describe-model.ts)), so the explanation cannot
drift from the rule.

### 2.6 "Not assessed" — no customer evidence, no score

**Verified** — `lib/metrics/health-evidence.test.ts`.

An account whose score rests on nothing the customer did or said shows **"Not assessed"**
instead of a number. Evidence means at least one component keyed on customer signal
contributed. Applied by the shared [`HealthPill`](../../../components/ui/HealthPill.tsx),
the CS Pulse panel, and the `/clients` at-risk headline count.

**A usage reading of zero is evidence, not a gap.** Only an *absent* metric counts as
missing evidence.

⚠️ **This rule broke completely on the engine switch and was fixed the same day.**
`CUSTOMER_EVIDENCE_METRICS` still listed the retired formula's keys (`usage`, `csat`,
`platform_csat`, `nps`, `sla_breaches`, `cs_pulse`) while the engine stores an entirely
different set with **zero overlap** — so `hasCustomerEvidence()` returned false for every
row and the pill read "Not assessed" on **all 133 accounts**, on top of perfectly good
scores. Fixed in `afc55a5`: 133/133 → 2/133, the remaining two genuinely being
Implementation accounts with no customer signal yet.

That was the **third** instance of the same migration failure in one day — a key set written
against the retired formula, still compiling, silently matching nothing. The others were the
Insights health-drag panel (`abd355e`) and the signals engine.

### 2.7 Refresh and rollback

- **Daily**, `/api/cron/client-health` at `0 9 * * *` — after intercom-sync, usage-sync and
  client-actions, so it reads same-day-fresh support and usage data.
- **On demand**, immediately after a Super Admin saves gates, rules or weights in
  Settings → Client health.
- `recomputeAllClientHealth()` → `recomputeClientHealth()` in
  [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts) is the entry point; it calls
  `scoreAccount` in [`lib/health/service.ts`](../../../lib/health/service.ts).

**Everything is scored on each recompute rather than read back from a number persisted at
capture time**, because the Pulse dimensions, the rating scale and the top-level
weights/bands are all workspace config — the same stored ratings must score differently
after an admin retunes them.

**Rollback:** commit `022e342` added snapshot/restore for `clients.health` — the engine
migration's only rollback. `clients.health` is JSONB, so the engine's extra fields
(coverage, confidence, momentum, primary risk, next action, triggered rule reasons) are
additive: readers that only know `score`/`tier`/`components`/`trend` are unaffected.

---

## 3. CS Pulse — the CSM's qualitative read

### Summary
Rated dimensions with rubrics, plus risk signals, captured by the CSM and stored on the
account. It is **25% of the health score and mandatory** — an account with no valid Pulse
cannot be scored at all.

### Purpose
Numbers from usage and support cannot see a champion leaving, a stalled sponsor, or a budget
freeze. Pulse is the place a human records what the data cannot show.

### Entry points
- Client Profile → CS Pulse trigger → Pulse drawer (read-out **and** capture in one flow).
- Today → pulse-due banner (accounts whose Pulse is missing or lapsed).
- `/reports/pulse` → coverage across the book.

### Storage and shape
`clients.properties.cs_pulse`, written through the atomic `properties || patch` merge.
[`lib/health/pulse.ts`](../../../lib/health/pulse.ts) is the single source of truth for the
dimensions, their rubrics, the risk signals, the stored shape, freshness, and conversion into
the engine's `CsPulseInput` — so the capture form, the scoring service and Settings cannot
drift apart.

Rating tiers default to Strong / Moderate / Weak / Critical (`CS_PULSE_TIERS` in
`lib/health/model-v1.ts`) and are configurable. `normalizeCsPulseTiers` coerces stored JSON
and never throws.

### Freshness
`PULSE_VALIDITY_DAYS = 30` in `lib/health/pulse.ts` is the single owner of that window.
[`lib/health/pulse-queue.ts`](../../../lib/health/pulse-queue.ts) produces the due queue that
Today and `/reports/pulse` read; both are role-scoped.

A lapsed Pulse fails the `q_pulse_valid` gate, so the account cannot be Healthy — **and,
because the CS Pulse component is mandatory, an account with no valid Pulse at all is
`Not Assessed`**, not zero.

### Silence is not a Yes
Commit `9625e0e`: an **unanswered** Pulse question no longer caps the account. This is the
same principle as `q_multithreaded`'s `ne: true` — Signal must not penalise an account for
its own missing data. `null` survives as a third state throughout.

### Churned accounts
Commit `810de4e`: **a churned account is gone, not un-reviewed.** It resolves to `Churned`,
not `Not Assessed` — the two mean different things and only one asks a CSM to go and look.

### Permissions
Capture and edit follow the client write gate — an operator can Pulse their own accounts;
Guests cannot Pulse anything. Dimensions, tiers, gates and rules are configured by
Admin/Super Admin in Settings.

---

## 4. Health signals on the profile

**New, 2026-08-05.** The Client Profile tab formerly labelled "Action list" is now
**"Health signals"** (the tab key stays `actions`, so saved links still work).

It answers *why the number is what it is*, in this order:

1. **The verdict, explained** — which gates failed and which status rules fired, in the
   model's own words (`b752517`).
2. **Distance to the threshold**, not just the rule — "3 points below the Healthy minimum
   of 65" rather than "Product Adoption below 65" (`8f516a0`).
3. **The model itself, explained and then drawn** — generated from the model, not described
   alongside it, so it cannot go stale (`2b85fe6`, `e81293d`,
   [`components/clients/HealthModelExplainer.tsx`](../../../components/clients/HealthModelExplainer.tsx)).
4. **Recommendations beneath**, anchored on the status they sit under (`131b31c`,
   `009d404`).

The recommendations panel had a real bug worth recording: it claimed to say "what to do
about the readings above" and **did not read them**. Bank of Bahrain, scoring 73 and held on
Watch by a failed CS Pulse gate and a single-threaded flag, got one recommendation reading
"breadth is dragging it down" — a raw engine id, naming the cheapest signal on the account
and mentioning neither of the two things actually holding it back. Now covered by
[`lib/actions/signals-health.test.ts`](../../../lib/actions/signals-health.test.ts).

---

## 5. Business rules

- **Health is a current condition.** Not a churn prediction, not a renewal forecast.
- **The score and the status legitimately disagree.** Read the status.
- **Churned, Implementation and Not Assessed are lifecycle facts** — never counted as
  at-risk.
- **A mandatory component with no data ⇒ Not Assessed.** An optional one redistributes.
- **Missing data is never treated as bad data** — in the gates (`ne: true`), in the Pulse
  (silence is not a Yes), and in the evidence rule.
- **Record-keeping alone cannot produce a score** — §2.6.
- **Config changes re-score the whole book immediately.**

Cross-product detail: [health-scoring](../../business-rules/health-scoring.md).

## 6. Technical implementation

| Concern | File |
|---|---|
| The published model | [`lib/health/model-v1.ts`](../../../lib/health/model-v1.ts) |
| Calculation pipeline | [`lib/health/engine.ts`](../../../lib/health/engine.ts) |
| Formula engine (15 types, **no `eval`**) | [`lib/health/formula.ts`](../../../lib/health/formula.ts) |
| Scoring entry point | [`lib/health/service.ts`](../../../lib/health/service.ts) |
| Result → stored shape | [`lib/health/to-stored.ts`](../../../lib/health/to-stored.ts) |
| **The single status answer** | [`lib/health/status.ts`](../../../lib/health/status.ts) |
| Component decomposition / drag | [`lib/health/drag.ts`](../../../lib/health/drag.ts) |
| Config overrides | `lib/health/model-overrides.ts`, `model-overrides-store.ts` |
| Plain-English rule text | `lib/health/rule-language.ts`, `describe-model.ts`, `signal-language.ts` |
| Publish-time validation | [`lib/health/validate.ts`](../../../lib/health/validate.ts) |
| "Not assessed" rule | [`lib/metrics/health-evidence.ts`](../../../lib/metrics/health-evidence.ts) |
| Health readout | [`components/ui/HealthPill.tsx`](../../../components/ui/HealthPill.tsx) |
| Profile signals UI | `components/clients/HealthSignals.tsx`, `HealthModelExplainer.tsx` |
| CS Pulse model | `lib/health/pulse.ts`, `lib/health/model-v1.ts` |
| Pulse queue | `lib/health/pulse-queue.ts` |
| Pulse UI | `components/clients/CsPulsePanel.tsx`, `PulseDrawer.tsx` |
| Recompute | `recomputeClientHealth` in `lib/repo/drizzle.ts` |
| Job | `app/api/cron/client-health/route.ts` |
| Settings | `components/settings/HealthModelWeights.tsx`, `HealthModelRules.tsx`, `ClientHealthEditor.tsx`, `app/(app)/settings/client-health-actions.ts` |
| Engine schema | `lib/db/health-schema.ts`, `drizzle/health-tables.sql` |
| **Retired formula** | `lib/metrics/health.ts`, `health-config.ts` — **no importers outside tests** |

**Tests:** `lib/health/engine.test.ts` · `status.test.ts` · `model-overrides.test.ts` ·
`describe-model.test.ts` · `signal-language.test.ts` · `support-facts.test.ts` ·
`lib/metrics/health-evidence.test.ts` · `lib/actions/signals-health.test.ts`

## 7. Analytics and observability

`drizzle/health-analytics-views.sql` defines Metabase views over the engine's tables
(`analytics.account_health_*`). **The engine now runs, but it writes to `clients.health`
JSONB — not to the 19 `health_*` tables**, so those views are still not fed. `health_audit_logs`
remains unwritten. No product analytics.

## 8. Known limitations

1. **The retired formula is still in the tree and still tested.** `lib/metrics/health.ts`
   and `health-config.ts` have no importers outside `health.test.ts` and `health-cap.test.ts`
   — 21 tests exercising a module nothing calls. It is dead code that reads as live.
2. **The engine's 19 tables are still not used.** Scoring runs, but the result lands in
   `clients.health` JSONB. `health_score_snapshots` is unwritten, so there is still **no
   health history** and `/reports/health` remains "as of today".
3. **Three migration failures in one day**, all the same shape: a key set written against
   the retired formula, still compiling, silently matching nothing (§2.6). Nothing in the
   type system prevents a fourth.
4. **The tier cap waits for the nightly recompute.** Rating an account Critical does not
   change its status until `/api/cron/client-health` runs at 09:00, or an admin re-saves the
   configuration.
5. **`components/clients/CsPulsePanel.tsx`'s module header is now badly stale** — it still
   describes "two health numbers in this app", naming `lib/metrics/health.ts` as the header
   ring's source. That module has no importers. Recorded in
   [contradictions](../../known-limitations/contradictions.md).
6. **`app/api/cron/client-health/route.ts`'s comment** still points at
   "Settings → Workflows → Client health" and `workflow-actions.ts`, both removed.
7. **NPS is null for most accounts**, so Client Sentiment redistributes its 10% in practice.
8. **`drizzle/meta` is stale**, so `db:generate` emits a full-schema baseline rather than an
   incremental.

## 9. Open questions

- **Are the 19 `health_*` tables intended to be used?** The engine runs without them. If they
  stay unused, `health-analytics-views.sql`, `health_audit_logs` and `health_score_snapshots`
  should be removed or explained.
- **When is `lib/metrics/health.ts` deleted?** It is dead, tested, and reads as live.
- Should the status cap apply at read time so a Critical Pulse rating takes effect
  immediately rather than at the next recompute?
- Should health history be persisted so `/reports/health` can trend?

## Source references

`lib/health/*` (28 files) · `lib/metrics/health-evidence.ts` · `lib/repo/drizzle.ts` ·
`app/api/cron/client-health/route.ts` · `components/clients/HealthSignals.tsx` ·
`components/ui/HealthPill.tsx` · `docs/health-engine.md` ·
commits `9a8ea59` `1aec1a1` `31777c2` `abd355e` `afc55a5` `e6dc235` `022e342` `9625e0e`
`810de4e` `b47fe07` `32923a3` `0764bcc` `3f6934f`

---

**Documentation status:** Partially verified — the model, status resolution and evidence rule
are test-backed; the profile's signals UI is read, not tested end to end
**Last verified:** 2026-08-05 · **Commit:** `9d83a22` · **Owner:** Unassigned
