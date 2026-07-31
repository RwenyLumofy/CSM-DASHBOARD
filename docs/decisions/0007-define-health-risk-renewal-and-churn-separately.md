# 0007. Define health, risk, renewal confidence and churn as four separate concepts

**Status:** Accepted for the *concepts*; **the implementation is contradictory**
**Date:** Ongoing — the separation is enforced across several modules rather than in one
change
**Affected product areas:** Health · CS Pulse · Insights · Churn · Action list · Today

## Context

"Health", "risk", "renewal confidence" and "churn" are used interchangeably in most CS
tooling. Signal's data makes the conflation expensive: 58% of the book is churned, health
is recomputed daily from eight metrics, CS Pulse is a human judgement, and renewal dates
come from deal records. Treating any two as the same thing produces reports nobody can act
on.

## Decision

Four concepts, kept distinct in code, in the UI, and in this documentation.

| Concept | Nature | Where it lives |
|---|---|---|
| **Health** | The account's **current condition** — a 0–100 weighted score resolved to an admin-named tier | `clients.health`, recomputed daily |
| **Risk signal** | **Evidence** contributing to a read — never a status | CS Pulse risk signals; `lib/actions/signals.ts` |
| **Renewal confidence** | The **commercial outlook** on a renewal | Insights forward outlook |
| **Churn** | A **recorded outcome**, with its own evidence and taxonomy | `arr_events` type `churn` + a reason id |

Supporting rules:

- **A churned account is excluded from health, at-risk and concentration analysis** — a dead
  account has no health and cannot renew.
- **Health separates calculation from application.** A status rule or manual override
  changes the *applied* status but **never destroys the calculated score**.
- **Missing data is not bad data.** A metric with no reading is excluded and the remaining
  weights renormalise; nothing is faked with a neutral value.
- **Signals are not tasks.** A signal says something *may* need attention; a task is
  explicit work. Today's builder names this as a rule and refuses to invent a "plan".
- **Churn cannot answer "why" for historical accounts.** There is no churn-reason field;
  56 of 76 events carry only free text. The module says so rather than guessing.

## Alternatives considered

- **One "risk score" combining all four.** Rejected by the structure of the code, though
  no explicit rejection is recorded.
- **Predicting churn from health.** Not attempted. Signal records churn; it does not
  forecast it.

## Consequences

- Four separate surfaces, which is more UI than a single score would need — and the reason
  Insights is four subpages on four different clocks rather than one dashboard.
- **The implementation contradicts the decision in one place.** Two health systems exist:
  the live weighted formula (`lib/metrics/health.ts`, untested, in production) and a
  config-driven, versioned, explainable engine (`lib/health/`, 25 tests, 19 tables,
  documented as *"inert until wired"*). The engine embodies this decision far more
  completely than the live path does. See
  [contradictions](../known-limitations/contradictions.md#two-health-systems).
- **"At risk" is not confirmed to have one definition.** The Action list hardcodes health
  `< 55`; Insights has its own panel. Until that is resolved, the separation holds
  conceptually but not operationally.

## Implementation references

`lib/metrics/health.ts` · `lib/metrics/health-config.ts` · `lib/health/` ·
`lib/health/pulse.ts` · `lib/metrics/churn.ts` · `lib/metrics/churn-taxonomy.ts` ·
`lib/actions/signals.ts` · `lib/today/repo.ts` · [`docs/health-engine.md`](../health-engine.md)

## Superseded decisions

None.

---

**Rationale evidence:** module headers across `lib/metrics/churn.ts`, `lib/health/pulse.ts`,
`lib/today/repo.ts`, and `docs/health-engine.md`. **The decision to keep the health engine
unwired — and whether it is intended to ship — requires confirmation from the team.**
