# 0013. Record-keeping alone is not a health score

**Status:** Accepted
**Date:** 2026-08-03
**Affected product areas:** Health and CS Pulse · Clients directory

## Context

`computeHealthScore` renormalises over whichever metrics produced a value for an account, so a
missing signal is skipped rather than faked with a neutral filler. That rule exists for a good
reason — it stops one universally-empty signal from dragging every score down — but it has a
consequence nobody had looked at.

Four of the ten health metrics describe **Signal's own records** rather than the customer:
`profile_complete`, `use_case_set`, `stakeholder_mapping` and `onboarding_period`. When an
account has no usage data, no survey responses, no support history and no CS Pulse, those four
are the *only* metrics with values — and the score is computed entirely from how completely a
CSM has filled Signal in. The number that comes out is a real number in the wrong units, and
nothing on screen distinguished it from a score built on customer evidence.

Both directions of the error were live in production on 2026-08-03 and are recorded in the
module header: one account reading **"Healthy 76"** on profile and onboarding data alone, and
another reading **"At risk 0"** on profile fields alone. The commit message records eight
accounts in this state, six of them inflating the At-risk headline on `/clients`.

The false green is the dangerous one: *"Healthy, 76"* on an account nobody has any evidence
about is a reason not to call them.

## Decision

**An account whose health score rests on no customer evidence is shown as "Not assessed",
not as a score.**

Evidence means at least one of six metrics contributed: `usage`, `csat`, `platform_csat`,
`nps`, `sla_breaches`, `cs_pulse`. Anything else describes Lumofy's own record-keeping. Those
metrics are worth tracking and they legitimately contribute to a score — they just cannot *be*
the score.

Two properties of the rule are deliberate and load-bearing:

**Zero usage is evidence.** A usage snapshot showing seats and no monthly actives is not a gap
— it is the loudest churn signal the product holds. **Only an *absent* metric is missing
evidence, never a low or zero value.** Inverting this would hide every dormant account behind
"we don't know", which is the opposite of useful. Tests pin it.

**Derived at read time, never persisted.** `isAssessed()` inspects the components already
stored on the health row.

## Alternatives considered

*No alternatives are evidenced in the repository as having been weighed against each other.*
The module header argues for the read-time derivation specifically, against the implied
alternative of storing an "assessed" flag on the score: deriving it meant every health row
already written got the correct treatment with **no migration and no recompute**, and the rule
can be retuned without rewriting any rows.

## Consequences

**Makes easy.** Retuning what counts as evidence is a one-line change to a `Set`. No migration,
no backfill, no recompute. Because the rule is applied inside the shared `HealthPill`
component, every health readout in the product behaves identically — a number shown in one
place and withheld in another would be worse than always showing it.

**Makes hard, and this is the honest cost.** The underlying score is untouched in the database.
`clients.health` still holds a number and a tier for an unassessed account, so anything reading
it directly — an export, a SQL query, a Metabase question — still sees a score the product
declines to show. The ambiguity was moved off the screen, not out of the data.

**Incomplete application.** Three surfaces consult `isAssessed`: the shared health pill, the CS
Pulse panel, and the `/clients` At-risk headline count. `healthBand` in `lib/metrics/exec.ts`,
`lib/actions/signals.ts` and the Insights at-risk panel do not. (lib/metrics/health-drag.ts *(deleted)*
was replaced by `lib/health/drag.ts` on 2026-08-05.)
An unassessed account is therefore withheld from one at-risk count and still reachable through
the others. This is a known inconsistency, not a designed exception —
[health-scoring](../business-rules/health-scoring.md#known-inconsistencies).

**Commits Signal to** a stated distinction between *what the customer did or said* and *what we
wrote down about them*. Any new health metric has to be classified on that axis, and
`CUSTOMER_EVIDENCE_METRICS` is where that classification lives. An unknown metric key does not
silently count as evidence — a test pins that too.

## Implementation references

- `CUSTOMER_EVIDENCE_METRICS`, `hasCustomerEvidence()`, `isAssessed()`, `NOT_ASSESSED_LABEL` —
  [`lib/metrics/health-evidence.ts`](../../lib/metrics/health-evidence.ts)
- Seven tests, including the zero-usage case —
  [`lib/metrics/health-evidence.test.ts`](../../lib/metrics/health-evidence.test.ts)
- Surfaces — [`components/ui/HealthPill.tsx`](../../components/ui/HealthPill.tsx),
  [`components/clients/CsPulsePanel.tsx`](../../components/clients/CsPulsePanel.tsx),
  [`components/clients/ClientsTable.tsx`](../../components/clients/ClientsTable.tsx)
- Commit `2dbffe0`
- Rule: [health-scoring R11](../business-rules/health-scoring.md#r11--no-customer-evidence-no-score-not-assessed)

## Superseded decisions

None. It refines [0007](0007-define-health-risk-renewal-and-churn-separately.md) by making
"health is a current condition" mean *a condition we have evidence for*.

---

**Rationale evidence:** module header **and** commit message **and** tests. The header of
`lib/metrics/health-evidence.ts` states the problem, names the two production examples and
argues the read-time derivation; the commit message for `2dbffe0` states the zero-usage rule in
capitals; the tests pin both directions.
