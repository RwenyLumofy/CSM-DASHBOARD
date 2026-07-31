# 0003. ARR is an event ledger, not a synced field

**Status:** Accepted
**Date:** Unknown — the module predates the commits inspected in this baseline
**Affected product areas:** Client Profile · Insights · Churn · Clients directory

## Context

A client's ARR was taken from HubSpot deals with a hardcoded "active this year" rule.
HubSpot has no single "current ARR" property in this portal, so the sync used
`total_revenue` as a baseline (still described that way in `README.md`).

Two problems. The hardcoded year rule would silently stop being correct. And retention
maths computed from current-vs-previous values cannot distinguish a renewal that went up
from new business that landed — which makes NRR wrong in the direction that flatters.

## Decision

A client's current ARR is the **running balance of its ARR events**, clamped at ≥ 0.

- **HubSpot contributes only `new_business` events** (Closed Won in the Direct and Indirect
  pipelines).
- **Renewals, expansions, contractions and churn are recorded in-app.**
- Account fields (`arr`, `renewalDate`, `startedAt`, `churnedAt`, `status`) are
  **materialised from the ledger** by `deriveClientArr`, not authored.
- Retention works off the ledger, so new business landed mid-period is **excluded** from
  NRR/GRR, a renewal that went up is expansion, one that went down is contraction, and the
  starting base is the exact ARR as of the period's first day.

## Alternatives considered

*No alternatives are explicitly evidenced in the repository.* The module header argues
against the prior approach rather than surveying options.

## Consequences

- **ARR stays correct indefinitely** — 2026, 2027, and beyond.
- **The ledger is the only fully auditable history in Signal.** Everything else is a
  mutable field with no record of change.
- On first sync `previousArr = arr`, so NRR ≈ 100% until `arr_snapshots` accrues real
  history. **Early retention figures are structurally meaningless, not merely imprecise.**
- The balance is clamped at 0, so an over-applied contraction disappears silently rather
  than producing a negative balance somebody would notice.
- Recording revenue movement becomes a CSM responsibility. Nothing outside Signal knows
  about it.

## Implementation references

`lib/metrics/arr.ts` · `lib/metrics/retention.ts` · `lib/metrics/movement.ts` ·
`lib/db/schema.ts:96-125` · `README.md` ("Notes & known follow-ups")

## Superseded decisions

Supersedes the HubSpot-derived ARR baseline. **`README.md` still describes the superseded
approach** — it was not updated.

---

**Rationale evidence:** module header in `lib/metrics/arr.ts` and the doc comment on
`computeRetention`. *The date and the discussion behind it require confirmation from the
team.*
