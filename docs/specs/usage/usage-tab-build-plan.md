# Usage tab — what to build now

> Written by `signal-product-manager`. Nine tickets, dependency-ordered, all buildable
> against data Signal already holds. Everything requiring per-user activity is explicitly
> out of scope — see [usage-tab-mockup-brief](usage-tab-mockup-brief.md) for the wider design
> and the review at [usage-tab-mockup-review](usage-tab-mockup-review.md).

**Status:** Proposed
**Date:** 2026-08-08

---

## Order

```
T1  ──►  T2 ──► T3
     ├─► T4
     ├─► T5        ──►  T8
     ├─► T6
     ├─► T7
     └─► T9
```

**T1 is the only blocker.** Everything else is parallel; T8 wants the others in place so it
can name what is missing.

---

## T1 · Keep `client_usage_monthly` current — **do this first**

**Why.** The table is backfilled Nov 2025 – Jul 2026 (448 rows, 82 clients) and **nothing
writes it**. `lib/repo/drizzle.ts` has a reader and no writer; the usage sync never touches
it. T2 and T3 would ship working and silently rot.

**Work**
- Add a writer beside the existing reader in [`lib/repo/drizzle.ts`](../../../lib/repo/drizzle.ts).
- In [`lib/usage/sync.ts`](../../../lib/usage/sync.ts), after a successful snapshot, upsert
  the current month: `{ clientId, month: "YYYY-MM", mau, wau, environmentId, region }`.
  Primary key is `(clientId, month)`, so a same-day re-sync updates in place.
- Re-run [`scripts/backfill-usage-monthly.mts`](../../../scripts/backfill-usage-monthly.mts)
  to pick up the months since July.

**Acceptance**
- After a sync, the current month's row exists and later syncs the same month update it
  rather than inserting.
- A failed sync writes no row — a partial month is worse than a missing one.

**Size.** Smallest ticket here.

---

## T2 · Render the record

**Work.** Extend [`app/(app)/clients/[id]/usage-actions.ts`](../../../app/%28app%29/clients/%5Bid%5D/usage-actions.ts)
to return the client's monthly rows; render them as a table in
[`components/clients/UsageTab.tsx`](../../../components/clients/UsageTab.tsx).

Rows: monthly actives · weekly actives · return rate (WAU ÷ MAU) · one module row.

**No activation-percentage row.** Seat history is not stored — `client_usage_monthly` holds
`mau` and `wau` only — so any monthly percentage would divide past logins by today's seat
count. State that under the table rather than showing a misleading row.

**Acceptance**
- A client with no history shows the reason, not an empty table.
- The table scrolls horizontally rather than forcing the page to.

---

## T3 · Patterns over the record

**Work.** New `lib/usage/patterns.ts` — a **pure** function over
`{ month, mau, wau }[]` plus module usage, returning
`{ kind, title, evidence, months[] }`.

Three kinds to start:

| Kind | Fires when |
|---|---|
| `streak` | Two or more consecutive falls, compared against the longest previous run |
| `unchanged` | A ratio has stayed inside a narrow band for the whole record |
| `never_started` | A module owned in the plan with zero activity in every month on record |

**Two rules, both non-negotiable**
1. **Every pattern names the months it came from.** A pattern a CSM cannot check against the
   row above is a claim, and they will stop believing the ones that are true.
2. **One occurrence is not a season.** A single December is labelled *"not yet a pattern"*
   with a date to revisit — never called seasonality.

**Acceptance.** Unit tests. This is the only genuinely testable piece of usage logic here —
pure in, pure out, no I/O.

---

## T4 · Usage condition narrative

**Work.** [`lib/usage/score.ts`](../../../lib/usage/score.ts) already computes
`parts: { activation, breadth, recency }` and a `verdictFor` sentence. Extend it to return a
condition plus its reasons rather than one string.

States: `Healthy` · `Watch` · `At risk` · `Insufficient data`.

**Acceptance.** Each state names what caused it, which period was assessed, and what to look
at. No bare score at the top of the page.

---

## T5 · Four metrics, honestly labelled

Monthly actives (with denominator) · return rate · modules in use · completion rate.

**Acceptance**
- Every metric shows numerator **and** denominator.
- Monthly actives is **not** labelled "engaged users". It counts logins. Until core-action
  definitions exist, the honest label is the one that ships.

---

## T6 · Use cases versus usage

**Work.** New `lib/usage/use-case-adoption.ts` joining:
`clients.properties.use_case_implementations` → each definition's `products[]` from
[`lib/use-case-library.ts`](../../../lib/use-case-library.ts) → `AdoptionScore.modules`.

Three states: **Running** · **Not started** · **Can't tell**.

**Acceptance**
- A definition with an empty `products[]` renders **Can't tell**, never "Not started" —
  the two mean opposite things.
- The inverse read is stated: modules in the plan, unused, with a recorded use case
  expecting them.
- No date claims. Nothing records when a module entered the plan or when an implementation
  went live.

---

## T7 · Two Action-list signals

**Work.** [`lib/actions/signals.ts`](../../../lib/actions/signals.ts), alongside `mau_zero`
and `wau_zero` — which today are the only usage signals and fire only on total dormancy.

| Signal | Priority |
|---|---|
| `module_unused` — owned in the plan, zero activity | **High** when a recorded use case expects it, **low** otherwise |
| `activation_declining` — sustained fall over the record | Medium |

**Acceptance**
- Neither fires for an account already caught by `mau_zero` — one account, one message.
- Both auto-resolve when the condition clears, per the deterministic-id reconcile.
- The decline threshold is a stated product decision, not a magic number. Set it too low and
  the channel dies.

---

## T8 · "Not measurable yet" panel, and data freshness

**Work.** A panel naming what cannot be computed and why: per-user activity, meaningful
action versus login, concentration, use-case target populations. Plus `fetchedAt` and
`syncError`, which are already stored.

**Why it earns space.** It stops an absence being read as a zero — the failure mode that
makes a CS analytics page actively misleading. Each line doubles as a sync ticket.

**Acceptance.** No metric anywhere on the tab renders `0` when the true state is "not
instrumented".

---

## T9 · The five numeric fixes

Carry the corrections from
[usage-tab-mockup-review](usage-tab-mockup-review.md) into the built version: the
seats-with-no-activity definition, the activation sub-line, the month-over-month direction,
the content-mix heading, and the fabricated seats delta.

---

## Out of scope, deliberately

Population adoption by role or department · concentration · lifecycle (new / returning /
resurrected / dormant) · engagement meaning anything beyond a login · use-case target
populations · portfolio benchmarks.

All of it waits on **per-user activity joined to role and department** — one sync addition
that unlocks all six together. That is the next project, not this one.
