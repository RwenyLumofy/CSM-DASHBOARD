# Business rule — ARR, revenue movement and retention

**Status:** Partially verified (formulas read end to end; **no tests**)
**Last verified:** 2026-07-31 · **Commit:** `4214349`

---

## R1 — ARR is a ledger balance, not a field

**Definition.** A client's current ARR is the **running balance of its ARR events**.

**Formula.** Events sorted by effective date, then creation order as tiebreak. Balance
accumulates and is **clamped at ≥ 0**:
`bal = max(0, bal + event.amount)`.

**Why.** The previous model scraped a value from HubSpot deals with a hardcoded
"active this year" rule. The ledger keeps ARR correct indefinitely — 2026, 2027, and beyond.

**Inputs.** `arr_events` (source: HubSpot for `new_business`; the app for everything else).

**Exception.** HubSpot only ever contributes `new_business` events (Closed Won in the
Direct and Indirect pipelines). Renewals, expansions, contractions and churn are recorded
in-app and never come from HubSpot.

**Code.** `withRunningBalance`, `deriveClientArr` in
[`lib/metrics/arr.ts`](../../lib/metrics/arr.ts). **Tests.** None.

---

## R2 — Event types

| Type | Sign | Meaning |
|---|---|---|
| `new_business` | + | First-time landed contract |
| `renewal` | ± | A renewal; the **sign of the delta** decides expansion vs contraction |
| `expansion` | + | ARR increase |
| `reactivation` | + | Counted as expansion in movement |
| `contraction` | − | ARR decrease |
| `churn` | − | The account ended |

---

## R3 — Derived account fields

`deriveClientArr(events)` collapses the ledger into the materialised fields on the client
row:

| Field | Rule |
|---|---|
| `arr` | Final running balance |
| `renewalDate` | The **most recent** event carrying a `renewalDate` |
| `startedAt` | Effective date of the **first** `new_business` event |
| `status` | `churned` when `balance ≤ 0` **and** the last event is `churn`; else `active` |
| `churnedAt` | Effective date of that last churn event |
| `lastEventAt` | Effective date of the last event |

**Edge case worth knowing:** an account whose balance reaches 0 via contraction, without a
churn event, is **still `active`**. Both conditions must hold.

---

## R4 — ARR as of a date

**Definition.** The balance at the *start* of a date — events **strictly before** it.

**Formula.** `arrAsOf(events, dateISO)`: accumulate every event where
`day(effectiveDate) < day(dateISO)`.

This is what makes the retention starting base exact, rather than carrying forward the
previous period's closing figure.

---

## R5 — Period movement

**Definition.** Movement within `[start, end)` — start inclusive, **end exclusive**.

| Bucket | Rule |
|---|---|
| `newBusiness` | Sum of `new_business` amounts. **Reported separately so it never inflates NRR.** |
| `expansion` | `expansion` + `reactivation` amounts (positive part), **plus** positive `renewal` deltas |
| `contraction` | Negative part of `contraction`, **plus** negative `renewal` deltas. Stored **positive** |
| `churn` | Negative part of `churn`. Stored **positive** |
| `churnedLogos` | Count of churn events |

**A renewal is split by the sign of its delta** — up is expansion, down is contraction. A
renewal is never a bucket of its own in movement.

**Code.** `periodMovement` in `lib/metrics/arr.ts`.

---

## R6 — NRR and GRR

**Definition.** Net and gross revenue retention for a period, computed from the event
ledger rather than current-vs-previous deltas.

```
NRR = (start + expansion − contraction − churn) / start
GRR = (start − contraction − churn) / start
```

`start` = `arrAsOf(events, periodStart)` — the exact ARR on the period's first day.

**Exception — the rule people get wrong:** **new business is excluded.** ARR landed
mid-period is not retention.

**Worked example.** An account opens a quarter at $100k, expands by $20k, and another
account with $30k churns. Portfolio start = $130k.
NRR = (130 + 20 − 0 − 30) / 130 = **92.3%**.
GRR = (130 − 0 − 30) / 130 = **76.9%**.
A $50k new logo landed in the same quarter changes **neither**.

**Code.** `computeRetention` in [`lib/metrics/retention.ts`](../../lib/metrics/retention.ts).
**Tests.** None.

---

## R7 — Retention history quality

**Definition.** On first sync `previousArr = arr`, so NRR ≈ 100% until the ledger accrues
history.

**Consequence.** Early retention figures are structurally meaningless, not merely
imprecise. `arr_snapshots` accumulates monthly history so period-over-period retention
becomes real over time.

**Source.** `README.md`, "Notes & known follow-ups".

---

## R8 — Associated ARR is **not** revenue attribution

**Definition.** "Associated ARR" on a use case is the **sum of the ARR of the accounts that
have that use case recorded**.

**Consequence.** An account with four recorded use cases contributes its **full** ARR to
all four. The figures across use cases sum to far more than portfolio ARR.

**Rule for documentation and UI copy:** do not call this revenue attributed to a use case.
Signal contains no attribution model, and building one would require a defensible split of
an account's ARR across its use cases — which nothing in the data supports.

---

## R9 — The ARR vocabulary

| Term | Meaning in Signal |
|---|---|
| **Account ARR** | The ledger balance for one client |
| **Opening ARR** | `arrAsOf(periodStart)` |
| **Closing ARR** | `arrAsOf(periodEnd)`, or the balance at period end |
| **New business** | First-time landed ARR; excluded from retention |
| **Expansion** | Increase on an existing account |
| **Contraction** | Decrease on an existing account (a "downgrade") |
| **Churn** | The account ended |
| **Associated use-case ARR** | See R8 — an overlapping sum, not attribution |
| **Renewal ARR requiring attention** | Upcoming renewals surfaced in the forward outlook. **Not confirmed to be a single named calculation** — see Open questions |

---

## R10 — Churned accounts are excluded downstream

A churned account has no health and cannot renew, so it is excluded from health, at-risk
and concentration analysis. It is **included** in churn analysis and in the periods where
its churn event falls.

---

## Known inconsistencies

1. **No tests on any ARR or retention function** — the numbers leadership reads are
   unverified by assertion.
2. **The README still describes `total_revenue` as the ARR baseline.** The ledger has
   superseded it; the README was not updated.
3. **Balance is clamped at 0**, so an over-applied contraction silently disappears rather
   than producing a negative balance somebody would notice.
4. **`renewalDate` is last-write-wins** across events; there is no renewal record with its
   own lifecycle.
5. **"Renewal ARR requiring attention"** is used as a concept in the forward outlook but was
   not traced to a single definition in this pass.

## Open questions

- Is there one canonical definition of "renewal requiring attention", or does each surface
  compute its own?
- Should the ledger reject an event that would drive a balance negative, rather than
  clamping?

## Source references

`lib/metrics/arr.ts` · `lib/metrics/retention.ts` · `lib/metrics/movement.ts` ·
`lib/metrics/exec.ts` · `lib/db/schema.ts:96-125` (`arr_snapshots`, `arr_events`) ·
`README.md`
