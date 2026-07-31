# Decision records

Sequential records of deliberate product and architectural decisions in Signal. Use
[`../_templates/decision-template.md`](../_templates/decision-template.md).

**A record is only written when there is real evidence of a deliberate decision** — a module
header stating the reasoning, a commit message explaining a reversal, or a test that pins
the rule. Rationale is never reconstructed from code alone. Where the decision is evident
but the reason is not, the record says *"Rationale requires confirmation from the team."*

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-separate-use-case-definition-from-client-application.md) | Separate the canonical use-case definition from the client's application of it | Accepted | 2026-07-29 |
| [0002](0002-rebuild-the-taxonomy-on-the-published-23-and-alias-hubspot-on-read.md) | Rebuild the taxonomy on the published 23; alias HubSpot values on read | Accepted (partly superseded by 0006) | 2026-07-28 |
| [0003](0003-arr-is-an-event-ledger-not-a-synced-field.md) | ARR is an event ledger, not a synced field | Accepted | Unknown |
| [0004](0004-four-flat-permission-tiers-with-server-side-write-gates.md) | Four flat permission tiers; the write gate is distinct from the read gate | Accepted | 2026-07-29 |
| [0005](0005-drop-draft-and-derive-review-state.md) | Drop "Draft"; derive review state from `lastReviewedAt` | Accepted | 2026-07-29 |
| [0006](0006-two-unlinked-use-case-taxonomies.md) | Uncouple the admin-curated overlay from the shipped taxonomy | Accepted; **end state unresolved** | Unknown |
| [0007](0007-define-health-risk-renewal-and-churn-separately.md) | Define health, risk, renewal confidence and churn separately | Accepted; **implementation contradictory** | Ongoing |

## Decisions that are evident but not yet recorded

Candidates with real evidence, awaiting a pass. Listed here rather than written badly:

- **Product state in `clients.properties` JSONB** rather than dedicated tables — the
  rationale appears in several module headers ("migration-free", "inherits account scope
  for free") but no single change captures the decision.
- **Sample mode removal** — `lib/data.ts` records that the fallback was removed and the
  seed sets kept commented out. The reason is not stated.
- **Deal edits as overrides, never written back to HubSpot** — the mechanism is clear; the
  decision behind one-way sync is not evidenced.
- **Transfer matches by name, not id** — well argued in `lib/use-case-transfer.ts`; arguably
  a consequence of 0006 rather than its own decision.
