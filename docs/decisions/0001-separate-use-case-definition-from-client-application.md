# 0001. Separate the canonical use-case definition from the client's application of it

**Status:** Accepted
**Date:** 2026-07-29
**Affected product areas:** Use Case Universe · Client Profile · Insights

## Context

Use cases only ever existed **on the deal**, fed from HubSpot's picklist. The account-level
view (`use_cases_rollup`) was **derived and read-only**, so a CSM who learned in month four
that the account was really doing succession planning had nowhere to record it — the only
writable copy was a field sales filled in before the account existed, and **the sync
rewrote it every four hours anyway**.

The use-case detail page also read as a formatted document rather than a record: it opened
with four quotes and read as a feature list, because nothing stated the customer's problem
or what "working" looks like.

## Decision

A use case is **two records**.

- **`UseCaseDefinition`** — the canonical, organisation-level description. Reusable, lives
  once. Gains two required fields: `customerProblem` (what is wrong at the client, in prose)
  and `desiredOutcome` (what "working" looks like).
- **`UseCaseImplementation`** — one account's application: status, account-specific
  objective, scope, CSM, client owner, target date, next step, notes.

The implementation is **stored on the CLIENT**
(`clients.properties.use_case_implementations`), for three reasons: it inherits the
account's permission scope for free; the atomic JSONB array helpers already exist for
`clients.properties`; and it **survives the use case being retired**.

**Editing one never touches the other.**

Sales-declared and CS-confirmed use cases are kept **apart and compared**, because the gap
is the interesting part: sold-but-never-confirmed is a promise nobody validated;
confirmed-but-never-sold is expansion signal. Merging them into one chip list — what the
rollup did — destroys both facts.

## Alternatives considered

- **Keep the derived rollup.** Rejected: it is read-only and the sync overwrites it.
- **Store the implementation on the use case.** Rejected: it would not inherit account
  permissions, and retiring a use case would take the account's recorded objective with it.
- **Merge declared and confirmed into one list.** Rejected: it destroys both facts.

## Consequences

- Retiring a definition is safe; the account's record survives.
- Implementations are **not queryable across accounts** — they live in JSONB.
- Five implementation statuses were chosen (`exploring`/`planning`/`live`/`paused`/
  `completed`) over a maturity model, because *"a maturity model nobody maintains collapses
  to whatever each record was created as."*
- The Client Profile becomes the place a CSM records what the account is actually doing.

## Implementation references

`lib/use-case-implementation.ts` · `lib/use-case-library.ts` ·
`app/(app)/clients/[id]/use-case-implementation-actions.ts` ·
`components/clients/AccountUseCases.tsx` · commits `8d295cb`, `8e85ced`

## Superseded decisions

None.

---

**Rationale evidence:** commit messages `8d295cb` and `8e85ced`, plus the module header in
`lib/use-case-implementation.ts`.
