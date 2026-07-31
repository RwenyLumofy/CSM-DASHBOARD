# Insights

**Status:** Partially verified

## Summary

Four read-only subpages that report the book: retention and revenue movement (Overview),
health distribution (Health), CS Pulse coverage (Pulse), and churn structure (Churn).

## Purpose

Answers the questions leadership and revenue ask about the portfolio rather than about one
account: how did the quarter go, what is our NRR, where is the concentration risk, what is
dragging health down, and who do we lose.

## Intended users

Leadership, Revenue, CS management. Guests can read all of it. Operators see it scoped to
the accounts they can see, which makes it their own-book report.

## Entry points

- **Routes:** `/reports` · `/reports/health` · `/reports/pulse` · `/reports/churn`
- **Navigation path:** Sidebar → Insights, then the sub-nav.

## Information architecture

Subpages, **not tabs over one dataset** — each answers a different question on a different
clock (`components/reports/InsightsNav.tsx`):

| Subpage | Question | Time base |
|---|---|---|
| Overview | How did the period go? | Selected period, defaults to the **last complete quarter** |
| Health | What is our health distribution, and what is dragging it? | As of today — no history exists |
| Pulse | Which accounts have a current CS Pulse? | Now |
| Churn | Who do we lose, and when? | Own picker, defaults to **all time** |

The nav deliberately carries **no clock in the label**. It used to read "Churn · all time",
which baked a choice into the nav and made it look like a law. Churn being all-time is a
*choice* (its events are dated; "who churned in Q2" is a fine question). Health being
as-of-today is a real *data limit*. Only the second belongs in the page.

**Every nav link carries the current query string forward.** A plain `<Link>` would drop
"Zainab's enterprise accounts" on navigation — no error, just quietly different numbers.

## Primary workflows

### Read a report
1. **Trigger** — open `/reports`.
2. **System behaviour** — period, filters and compare mode are parsed **from the URL**
   (`parseFilters`, `parseCompare`, `defaultExecPeriod`), then `getExecutiveReport()` builds
   the report over role-scoped clients and the ARR ledger.
3. **Result** — summary row, headline, revenue waterfall, retention trend, movement,
   concentration, at-risk, forward outlook.
4. **Failure** — a data-quality banner surfaces gaps rather than hiding them.

**Period and every filter live in the URL**, so a filtered view is a link an exec can paste
into a board pack and re-open unchanged next quarter. That is the stated design intent.

The Overview defaults to the **last complete quarter** — opening on a 16-day-old quarter
showed a flat, empty report. An in-progress period is flagged with its progress
(`periodInProgress`, `periodProgress`), and provisional figures are tagged
(`ProvisionalTag.tsx`).

### Overview panels

| Panel | Shows | Source |
|---|---|---|
| Summary row | Headline portfolio metrics | `lib/metrics/exec.ts` |
| Revenue waterfall | Opening → new business → expansion → contraction → churn → closing | `lib/metrics/movement.ts`, `arr.ts` |
| Retention trend | NRR/GRR over 6 periods | `lib/metrics/retention.ts` |
| Movement | Period revenue movement by type | `lib/metrics/movement.ts` |
| Concentration | ARR concentration risk | `lib/metrics/portfolio.ts` |
| At risk | Accounts classified at risk | `lib/metrics/*` |
| Forward outlook | Upcoming renewals and expected movement | `lib/metrics/exec.ts` |
| Takeaways | Generated plain-language reads of ARR and retention | `lib/metrics/takeaways.ts` |

### Health subpage
Distribution across tiers plus **health drag** — the accounts pulling the portfolio score
down (`lib/metrics/health-drag.ts`). Explicitly as-of-today; there is no health history to
trend.

### Pulse subpage
CS Pulse coverage across the book — who has a current pulse, who has lapsed. Reads the same
`pulse-queue` that drives Today's nudge, so the two cannot disagree.

### Churn subpage
See [churn](../churn/README.md). It follows the **shared filters from the layout** (pick a
CSM and every rate recomputes for their book) but has its own period control, which is why
filters live in the layout and the period control does not.

The page requests `trendLength: 1` because it reads only `churnAnalysis` — a 6-period
retention loop would be computed and thrown away.

## Fields and data

All figures derive from the ARR event ledger, `clients`, and health. Nothing on these pages
is stored; every number is computed per request.

## States and statuses

Period states: complete · in progress (with progress %) · all time.
Figures in an in-progress period are marked **provisional**.

## Business rules

- **Retention excludes new business.** New business landed mid-period is not retention.
- **NRR** = `(start + expansion − contraction − churn) / start`;
  **GRR** = `(start − contraction − churn) / start`.
- **The starting base is the exact ARR as of the period's first day**, computed from the
  ledger — not last period's closing figure carried forward.
- **A renewal that went up is expansion; one that went down is contraction.**
- **Churned accounts are excluded** from health, at-risk and concentration analysis.
- Full detail: [arr-and-revenue-movement](../../business-rules/arr-and-revenue-movement.md).

## Permissions

- **View:** everyone. Content is scoped to the accounts the viewer can see, so an operator
  sees their own book's retention.
- **Edit:** nothing. Insights is entirely read-only.
- **Server-side enforcement:** inherited from `getClients()` scoping inside
  `getExecutiveReport()`.

## Automations and side effects

None. No writes, no jobs.

## Empty, loading and error states

`loading.tsx` files exist for `/reports` and `/reports/health` and `/reports/churn`.
`DataQualityBanner.tsx` surfaces data gaps. An empty period renders as a genuinely empty
report rather than an error.

## Data model

Reads `arr_events`, `arr_snapshots`, `clients`, `client_deals`,
`clients.properties.cs_pulse`, and health fields. Writes nothing.

## Technical implementation

| Concern | File |
|---|---|
| Pages | `app/(app)/reports/{page,health/page,pulse/page,churn/page}.tsx`, `layout.tsx` |
| Sub-nav | `components/reports/InsightsNav.tsx` |
| Report builder | `buildExecReport` in `lib/metrics/exec.ts` |
| Retention | `lib/metrics/retention.ts` |
| ARR / periods | `lib/metrics/arr.ts` |
| Movement | `lib/metrics/movement.ts` |
| Portfolio / concentration | `lib/metrics/portfolio.ts` |
| Churn | `lib/metrics/churn.ts`, `churn-taxonomy.ts` |
| Health drag | `lib/metrics/health-drag.ts` |
| Takeaways | `lib/metrics/takeaways.ts` |
| Panels | `components/reports/*.tsx` (25 files) |

## Analytics and observability

None. No tracking of which reports are opened or which filters are used.

## Dependencies

ARR ledger · health · CS Pulse · churn taxonomy · account status · permissions scoping.

## Known limitations

1. **No health history.** The Health page cannot trend.
2. **No export.** Figures cannot be downloaded; the URL is the sharing mechanism.
3. **No scheduled delivery.** Nobody is emailed a report.
4. **NRR/GRR quality depends on the ledger.** On first sync `previousArr = arr`, so early
   retention figures are meaningless until the ledger accrues history (README).
5. **No tests** on any metrics module.
6. **Every figure is recomputed per request** over the whole book; there is no
   materialisation.

## Open questions

- Should health snapshots be persisted so the Health page can trend? The engine's
  `health_score_snapshots` table exists but is unused.
- What defines "at risk" precisely, and is it the same definition on Today, in the Action
  list, and here? Not confirmed to be one shared function.

## Source references

`app/(app)/reports/*` · `components/reports/*` · `lib/metrics/*` · `lib/data.ts`

---

**Documentation status:** Partially verified — page structure and retention formulas read
directly; panel-level behaviour not exhaustively traced
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
