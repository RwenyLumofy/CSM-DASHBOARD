# Specification — Usage tab, release 1

> **Level 3.** Decision-ready. Every metric has a contract, every state has a defined
> behaviour, and every open item carries a recommendation. Engineering should not need to
> invent business logic to implement this.
>
> Supersedes the discovery work in [usage-tab-handoff](usage-tab-handoff.md), which remains
> the reference for *why* each limitation exists.

**Status:** Proposed · **Date:** 2026-08-08 · **Area:** Client Profile → Usage
**Depends on:** P0 in §9 · **Affects:** health scoring, Action list, Today

---

## 1. Executive decision

Rebuild the Usage tab as a decision surface answering four questions in order — **what is
the condition · what changed · where is the gap · what should I do** — with everything else
beneath or behind disclosure.

Four metrics, each with a published contract. No composite score on the page. `AdoptionScore`
is retained as a health input and removed from the interface (§4). Product Adoption stops
being able to render a whole account unassessed because of a telemetry failure (§5).
The use-case section makes no adoption claim it cannot evidence (§6).

**Not in release 1:** composite scoring on the page, prediction, seasonality, intervention
attribution, cohort retention, per-user drill-down, portfolio benchmarks.

---

## 2. Information architecture

Four questions, in this order. Everything else is beneath them or collapsed.

| Zone | Question | Contains |
|---|---|---|
| **1 · Condition** | What is the current usage condition? | Condition state, its reasons, freshness, period label |
| **2 · Change** | What changed, and over what period? | Four metrics with comparison · one activity chart · at most three observations |
| **3 · Gap** | Where is the adoption gap? | Assigned → started → completed funnel · products and use-case evidence · seat utilisation |
| **4 · Trust** | Can I rely on this? | Collapsed: data coverage and definitions · all metrics |

**Eight visible components**, in render order: condition and freshness · four metrics · one
activity chart · up to three observations · funnel · products and use-case evidence · seat
utilisation and capacity · collapsed data definitions and full metric table.

---

## 3. The four metrics — contracts

Every metric renders: **value · denominator · comparison · definition on hover**. None renders
without a denominator. None renders `0` when the true state is "not instrumented" (§10).

### M1 · Monthly active-seat rate

| | |
|---|---|
| **Numerator** | Distinct users with ≥1 login in the period (`users_userlogin`) |
| **Denominator** | Seats — `SUM(available_licenses)` where `is_active`, **as of today** |
| **Eligible population** | All non-deleted users in the environment |
| **Exclusions** | `deleted_at IS NOT NULL`, `is_support`, `is_integration_user` |
| **Period** | The selected period; monthly by default |
| **Comparison** | Same metric, immediately preceding complete period |
| **Refresh** | Every usage sync |
| **Missing data** | Environment unlinked → **not shown**, with reason. Never `0%` |
| **Label** | "Monthly active-seat rate". Hover: *"Distinct users who logged in, over seats held today. Counts a login, not a meaningful action."* |

**Known weakness, stated in the interface:** the denominator has no history, so this metric
cannot be shown per month (§7). Release 1 shows it for the selected period only.

### M2 · Weekly-to-monthly active ratio

| | |
|---|---|
| **Numerator** | Distinct users with ≥1 login in the last 7 days |
| **Denominator** | Distinct users with ≥1 login in the last 30 days |
| **Exclusions** | As M1 |
| **Comparison** | Preceding complete period |
| **Suppression** | Not shown when the monthly figure is **< 20 users** — the ratio is noise below that |
| **Label** | "Weekly-to-monthly active ratio". Hover: *"How concentrated activity is within the month. Not a retention measure — it does not track whether the same people returned."* |

### M3 · Enrolment start rate

| | |
|---|---|
| **Numerator** | Enrolments assigned in the period with `started_at IS NOT NULL` |
| **Denominator** | Enrolments assigned in the period |
| **Sources** | `learning_items_enrollment` · `learning_contentitemenrollment` · pathway enrolments, **deduplicated by id** — the first two mirror the same enrolment on a shared primary key |
| **Assignment date** | `assigned_at` on learning items and pathways; `created_at` on content items |
| **Exclusions** | Enrolments assigned in the last 14 days — too new to judge |
| **Comparison** | Preceding complete period |
| **Missing data** | Requires `started_at` in the sync — **P1, §9** |
| **Label** | "Enrolment start rate". Hover: *"Of what was assigned, how much was opened."* |

**Why this metric.** 87% of learning items and 60% of pathways are never opened, while 91–96%
of *started* work completes. Take-up is where accounts differ; completion is nearly constant.

### M4 · Completion among started enrolments

| | |
|---|---|
| **Numerator** | Enrolments assigned in the period with `completed_at IS NOT NULL` |
| **Denominator** | Enrolments assigned in the period with `started_at IS NOT NULL` |
| **Period** | Cohort: assigned **90–180 days ago**, so every enrolment had comparable time |
| **Exclusions** | As M3 |
| **Suppression** | Not shown below **20 started enrolments** in the cohort |
| **Label** | "Completion among started". Hover: *"Of what was opened, how much finished. Enrolment-level, not per user."* |

**Naming note.** This is *enrolments*, not *users*. Per-user completion needs data Signal does
not pull. The label says "enrolments" and must not be softened to "users".

### Terminology that is now prohibited

| Do not write | Because | Use |
|---|---|---|
| "Engaged users" | `mau` counts logins | "Monthly active users" |
| "Activation" for MAU ÷ seats | Activation is a first meaningful action | "Active-seat rate" |
| "Return rate" for WAU ÷ MAU | Implies cohort retention | "Weekly-to-monthly ratio" |
| "Adoption" for any current metric | Nothing here measures adoption of an outcome | "Activity", "usage" |

---

## 4. The `AdoptionScore` decision

**Decision: retain as a health input, remove from the interface, rename.**

| | |
|---|---|
| **Removed from** | The Usage tab. The Usage condition (§5) replaces it visually |
| **Retained in** | `lib/usage/score.ts`, feeding health |
| **Renamed to** | `usageCompositeScore`, so nothing implies it measures adoption |
| **Surfaced where** | The collapsed data-definitions section only, labelled as a health input |

**Transition to name explicitly.** Today's production health model uses
`AdoptionScore.score` as its `usage` metric. The engine being wired reads *raw* usage fields
instead (`active_users`, `seats`, enrolments, completions). **Confirm which is live before
changing either** — during the transition both paths exist, and altering the score would move
health for reasons unrelated to any client.

---

## 5. Health dependency

**Problem.** Product Adoption is 50% of the health score and mandatory: no data → the whole
account is Not Assessed. Its inputs are login-based, partially stale, and missing meaningful
actions, entitlement history and target populations. **A Metabase outage should not make an
account unassessable.**

**Decision: separate three things that are currently one.**

| Concept | Meaning | Behaviour |
|---|---|---|
| **Usage condition** | What the activity says | `Healthy` · `Watch` · `At risk` · `Insufficient data` |
| **Data confidence** | How much of the input was available and fresh | Coverage % and age, shown separately, never folded into the score |
| **Account health** | The overall verdict | Product Adoption becomes **non-mandatory**; absent data redistributes its weight and drops confidence, rather than voiding the account |

**Rollout gate.** Any new adoption logic runs in **shadow mode** — computed, stored, not
surfaced — for at least one full month. Compare against a named set of accounts, review
disagreements with CSMs, and treat disagreement as a reason to fix data before changing the
model. Nothing influences 50% of health until that review has happened.

---

## 6. Use-case evidence — not use-case adoption

**Renamed from "Use cases versus usage".** Signal has no structured target populations, no
expected workflows, no implementation history and no meaningful-action definitions. It
therefore **cannot prove a use case is being adopted**, and must not imply it.

Each row shows four things and no more:

1. The client's **active use case** (from `use_case_implementations`)
2. The **relevant product** (from the definition's `products[]`)
3. **Available supporting activity** — the raw counts for that module in the period
4. **What remains unmeasurable** for this row

Three states, and only three:

| State | Condition |
|---|---|
| **Activity present** | The relevant module has activity in the period |
| **No activity recorded** | The module has zero activity in every month on record |
| **Cannot be evidenced** | The definition names no product, so there is nothing to look at |

**Prohibited in this section:** percentages of adoption · "on track" / "behind" · any date
claim about when a use case went live or a module entered the plan · causal language
("because", "driven by").

---

## 7. Period and comparison behaviour

| Rule | Behaviour |
|---|---|
| **Default period** | The last **complete** month |
| **Default comparison** | The immediately preceding complete month |
| **Incomplete periods** | The current month is selectable, labelled **"In progress"**. Every comparison is **disabled** while it is selected, and the reason is stated |
| **Never** | Compare an incomplete period against a complete one, under any selection |
| **Chart resolution** | ≤31 days → daily · 32–180 days → weekly · longer → monthly |
| **Custom range** | Permitted. If it ends inside the current period it is treated as in-progress |
| **Historical active-seat rate** | **Not computed.** No seat or entitlement history exists; any past percentage would divide past logins by today's seats. The chart shows absolute actives |
| **Comparison unavailable** | When the comparison period predates the record (before Nov 2025) the control offers it, disabled, with the reason |

---

## 8. Observations and signals — lifecycle

### 8.1 Observations (on the page, maximum three)

| Rule | Value |
|---|---|
| **Minimum history** | 6 complete months for any trend claim; 3 for a single-period change |
| **Change threshold** | The greater of **10% relative** or **10 users absolute** |
| **Small population** | Suppressed entirely below **20 monthly actives** |
| **Consecutive requirement** | A "streak" needs ≥2 consecutive periods moving the same way |
| **Deduplication** | One observation per kind per client per period |
| **Ranking** | Severity, then recency. Only the top three render |
| **Evidence** | Every observation names the periods it was drawn from and links to them in the chart |
| **One occurrence is not a season** | A single annual occurrence is labelled "not yet a pattern" with a date to revisit. Never called seasonality |
| **Resolution** | Recomputed each sync; disappears when the condition ceases |

### 8.2 Action-list signals (two in release 1)

| | `usage_module_unused` | `usage_activity_declining` |
|---|---|---|
| **Fires when** | A module in the plan has zero activity in every month on record | M1 falls beyond the §8.1 threshold for ≥2 consecutive complete months |
| **Priority** | High when a recorded use case names that product; otherwise low | Medium |
| **Suppressed when** | `mau_zero` already fired — one account, one message | As left |
| **Evidence retained** | Module, months checked, use cases naming it | Both period values, the delta, the months |
| **Deep link** | Usage tab with the period and metric preselected, scrolled to the relevant section | As left |
| **Cooldown** | 30 days after resolution before it may fire again | As left |
| **Resolution** | Auto-resolves via the deterministic-id reconcile when the condition clears | As left |

---

## 9. P0 — `client_usage_monthly` writer

**Blocks §7's chart, §8.1's observations and both signals.** The table has a reader, a
backfill script and 448 rows (Nov 2025 – Jul 2026, 82 clients) — and **no recurring writer**.

Requirements:

1. **Idempotent recurring writer** on the usage sync. Primary key `(client_id, month)`;
   re-running the same day updates in place.
2. **Backfill and reconciliation** for months since July, and a reconcile that corrects an
   existing row rather than skipping it.
3. **Source and sync timestamps** — `recorded_at` plus the source `environment_id` and
   `region`, so a re-pointed client does not silently re-attribute history.
4. **Stale-data monitoring** — alert when the newest row is more than one period old.
5. **Uniqueness** on client + source + period.
6. **Complete versus incomplete periods** — the current month is written and flagged
   incomplete; comparisons skip incomplete rows.
7. **Region-routing protection** — a client's rows must not mix AWS (`4`) and KSA (`5`)
   readings. A change of environment starts a new series rather than continuing the old one.
8. **No partial writes** — a failed sync writes nothing for that month.

---

## 10. Data coverage and definitions

**Only limitations affecting the interpretation of *this* account appear on the page.**
A global list of instrumentation debt does not belong on a CSM surface.

| Shown inline | Not shown inline |
|---|---|
| This account's environment is unlinked | "Signal does not pull per-user activity" |
| The last sync failed and the data is N days old | "Core-action definitions do not exist" |
| A metric is suppressed for this account (small population) | "Target populations are free text" |
| The selected period is in progress | Anything true of every account equally |

Everything else lives in a collapsed **"Data coverage and definitions"** section: metric
contracts from §3, last successful sync, source database, the record's start date, and the
known instrumentation limits.

**Absolute rule.** No metric renders `0` when the true state is "not instrumented",
"no entitlement", "no eligible population" or "sync failed". Each has its own presentation.

---

## 11. Signals and the tab are complementary

Settled, and no longer an open question:

- **Today and the Action list** bring meaningful usage changes to the CSM. A CSM should never
  have to open every account's Usage tab hunting for problems.
- **The Usage tab** carries the evidence, history and diagnosis behind those signals.
- **Every signal deep-links** into the tab with the period, metric and section preselected.

---

## 12. Acceptance criteria

- [ ] `AC-01` Every metric renders numerator, denominator and comparison, or states why it cannot.
- [ ] `AC-02` No metric renders `0` for an uninstrumented, unentitled or failed-sync state.
- [ ] `AC-03` Selecting the current month labels it "In progress" and disables comparisons.
- [ ] `AC-04` No comparison ever pairs a complete period with an incomplete one.
- [ ] `AC-05` No historical active-seat percentage is computed anywhere.
- [ ] `AC-06` M2 is suppressed below 20 monthly actives; M4 below 20 started enrolments.
- [ ] `AC-07` Mirrored learning enrolments are deduplicated by id in M3 and M4.
- [ ] `AC-08` At most three observations render; each names its periods and links to them.
- [ ] `AC-09` A single occurrence is never described as seasonal.
- [ ] `AC-10` Neither new signal fires while `mau_zero` is active for that account.
- [ ] `AC-11` Each signal deep-links to the tab with period and metric preselected.
- [ ] `AC-12` A telemetry failure does not render the account Not Assessed; Product Adoption's weight redistributes and data confidence drops.
- [ ] `AC-13` No composite score appears on the tab.
- [ ] `AC-14` The use-case section makes no adoption, date or causal claim.
- [ ] `AC-15` Re-running a usage sync in the same month updates the monthly row, never duplicates it.
- [ ] `AC-16` A client whose environment changes region starts a new series.
- [ ] `AC-17` Only account-specific limitations appear inline; the rest are collapsed.

---

## 13. Open decisions

| # | Decision | Recommendation | Blocking? |
|---|---|---|---|
| `D-1` | Is production health reading `AdoptionScore.score` or the engine's raw fields? | Confirm before touching either (§4) | **Yes** |
| `D-2` | Does Product Adoption become non-mandatory, or does mandatory-with-confidence stay? | Non-mandatory. A telemetry outage is not a client signal | **Yes** |
| `D-3` | Which accounts form the shadow-mode comparison set? | 10 accounts across tiers, chosen with CS | Before §5 ships |
| `D-4` | Is the 10% / 10-user threshold right? | Ship it, review after one month of signal volume | No |
| `D-5` | Does M3/M4 wait for `started_at`, or does release 1 ship with two metrics? | Ship with two and add M3/M4 when the sync lands — better than four metrics where two are wrong | No |

---

## 14. Phasing

**Release 1** — §9 P0 · condition and freshness · M1 and M2 · activity chart · up to three
observations · use-case evidence · seat utilisation · collapsed definitions · both signals.

**Release 2** — `started_at` in the sync, enabling M3, M4 and the assigned → started →
completed funnel.

**Release 3** — per-user activity joined to role and department, enabling population
breakdown, concentration and lifecycle.

**Deferred indefinitely** — composite scoring on the page, prediction, seasonality,
intervention attribution, portfolio benchmarks.
