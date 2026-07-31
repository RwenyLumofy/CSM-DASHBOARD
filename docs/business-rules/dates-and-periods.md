# Business rule — Dates, periods and comparison

**Status:** Partially verified · **No tests**
**Last verified:** 2026-07-31 · **Commit:** `4214349`

---

## R1 — Periods are half-open

**Definition.** A period is `[start, end)` — **start inclusive, end exclusive**.

**Consequence.** An event on the last day of a quarter belongs to that quarter; an event on
the first day of the next belongs to the next. No event is double-counted at a boundary.

**Code.** `periodBounds`, `periodMovement` in [`lib/metrics/arr.ts`](../../lib/metrics/arr.ts).

---

## R2 — Dates are compared as day strings

**Definition.** Comparison uses `day(iso) = iso.slice(0, 10)` — the `YYYY-MM-DD` prefix —
and string comparison.

**Consequence.** Time-of-day and timezone are **ignored** for period membership. An event
stamped late on 31 March UTC and one stamped early on 31 March local are the same day.

**Trade-off.** Simple and stable, but it means Signal has no timezone model for period
boundaries. For a company operating across regions this is a simplification worth knowing
about, not a bug that has bitten anything observed here.

---

## R3 — Event ordering

**Definition.** Events sort by effective date, then by **creation order** as the tiebreak.

**Why it matters.** The running balance depends on order, so two events on the same day
resolve deterministically by when they were entered.

---

## R4 — Insights defaults to the last complete quarter

**Definition.** `/reports` opens on `defaultExecPeriod()` — the last **complete** quarter.

**Why.** Opening on a 16-day-old quarter showed a flat, empty report.

**In-progress periods** are detected (`periodInProgress`) and their progress reported
(`periodProgress`); figures are marked **provisional** (`ProvisionalTag.tsx`).

---

## R5 — Churn defaults to all time

`/reports/churn` defaults to `ALL_TIME`, which is one period value among many, not a fixed
property of the page. See [churn R5](churn.md#r5--period-scoping-defaults-to-all-time-but-is-not-fixed-to-it).

---

## R6 — Filters and period live in the URL

**Definition.** Period, comparison mode and every filter are parsed from `searchParams`
(`parseFilters`, `parseCompare`).

**Why.** A filtered view is a link an exec can paste into a board pack and re-open unchanged
next quarter.

**The thing that breaks silently.** Insights sub-navigation links must carry the current
query string forward. A plain `<Link href="/reports/churn">` drops a filter like "this
CSM's enterprise accounts" on navigation — **no error, just quietly different numbers**.
`InsightsNav.tsx` appends the query string for exactly this reason.

---

## R7 — Onboarding period

**Definition.** Days from the relevant deal date to launch, scored as a health metric:
100 at or under `targetDays` (default 30), 0 at or over `maxDays` (default 90), linear
between. Null when the day count is unavailable.

**Code.** `lib/metrics/onboarding.ts`, consumed by `lib/metrics/health.ts`.

---

## R8 — Renewal date is last-write-wins

The client's `renewalDate` is taken from the **most recent** ARR event that carries one.
There is no renewal record with its own lifecycle.

---

## R9 — Deal dates are overrides, not synced writes

Seven deal dates (invoice sent, kick-off, launch, platform start/end, global library
start/expiry) are editable in-app and stored as **overrides** under `DEAL_DATES_KEY` on
`clients.properties`. They are applied on read and **never written back to HubSpot**.

Profile completeness treats them with `requiredWhen` refinements — e.g. a global-library
date is not required on a deal that has no global library.

---

## Known inconsistencies

1. **No timezone model** (R2).
2. **No tests** on period bounds, movement windows, or comparison parsing.
3. **`ALL_TIME` cumulative rates** need a caveat that is carried in prose rather than
   enforced by the data structure.

## Open questions

- Should period boundaries respect a workspace timezone?

## Source references

`lib/metrics/arr.ts` · `lib/metrics/exec.ts` · `lib/metrics/onboarding.ts` ·
`lib/deal-overrides.ts` · `components/reports/InsightsNav.tsx` ·
`components/reports/PeriodControls.tsx`
