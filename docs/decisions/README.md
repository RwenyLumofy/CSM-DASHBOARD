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
| [0006](0006-two-unlinked-use-case-taxonomies.md) | Uncouple the admin-curated overlay from the shipped taxonomy | Accepted; **end state unresolved**; carries a 2026-07-31 correction on ids | Unknown |
| [0007](0007-define-health-risk-renewal-and-churn-separately.md) | Define health, risk, renewal confidence and churn separately | Accepted; **implementation reconciled by [0015](0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md)** | Ongoing |
| [0008](0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md) | A retirement marker is not enough — the taxonomy row has to survive it | Accepted | 2026-07-31 |
| [0009](0009-validate-outbound-urls-on-read-not-only-on-write.md) | Validate an outbound URL on read, not only on the write path that happens to exist | Accepted | 2026-07-31 |
| [0010](0010-transfer-the-universe-by-name-never-by-id.md) | Move the Use Case Universe between environments by name, never by id | Accepted | 2026-07-29 |
| [0011](0011-split-compliance-out-of-readiness-and-transformation.md) | Split Compliance out of Readiness & Transformation | Accepted | 2026-08-01 |
| [0012](0012-a-mention-is-a-reference-not-a-grant.md) | A mention is a reference, not a grant | Accepted | 2026-08-02 |
| [0013](0013-record-keeping-alone-is-not-a-health-score.md) | Record-keeping alone is not a health score | Accepted; **implementation superseded by [0015](0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md)**, principle intact | 2026-08-03 |
| [0014](0014-a-critical-pulse-caps-the-tier-and-leaves-the-score-alone.md) | A Critical CS Pulse on renewal or engagement caps the tier, and leaves the score alone | Accepted; **implementation superseded by [0015](0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md)** | 2026-08-03 |
| [0015](0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md) | The engine scores health, and every surface reads the applied status | Accepted | 2026-08-03 – 05 |
| [0016](0016-remove-auto-assignment-accounts-arrive-unowned.md) | Remove auto-assignment; new accounts arrive unowned | Accepted | 2026-08-03 |
| [0017](0017-stakeholder-profiles-are-the-only-relationship-model.md) | Stakeholder profiles are the only relationship model | Accepted | 2026-08-05 |
| [0018](0018-a-notes-follow-up-is-a-task-not-a-flag-on-the-note.md) | A note's follow-up is a task, not a flag on the note | Accepted; **not yet implemented** — intended behaviour in [specs/notes](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md) | 2026-09-02 |
| [0019](0019-adoption-breadth-counts-capabilities-in-use-not-use-cases-sold.md) | Adoption breadth counts capabilities in use, not use cases sold | Accepted | 2026-09-02 |
| [0020](0020-a-note-is-dated-by-when-it-happened-not-when-it-was-typed.md) | A note is dated by when it happened, not when it was typed — and the meeting is optional context | Accepted; **not yet implemented** — intended behaviour in [specs/notes](../specs/notes/notes-record-when-and-how-it-happened-and-become-tasks.md) | 2026-09-06 |
| [0021](0021-a-note-type-is-a-channel-not-a-category.md) | A note's type is a channel, not a category | Accepted; **not yet implemented**; narrows the earlier blanket refusal of a type column | 2026-09-06 |
| [0022](0022-a-note-is-a-document-a-task-update-is-a-sentence.md) | A note is a document; a task update is a sentence — notes keep HTML and gain mentions anyway | Accepted; **not yet implemented**; applies [0012](0012-a-mention-is-a-reference-not-a-grant.md) to a second surface | 2026-09-06 |

## Decisions that are evident but not yet recorded

Candidates with real evidence, awaiting a pass. Listed here rather than written badly:

- **Product state in `clients.properties` JSONB** rather than dedicated tables — the
  rationale appears in several module headers ("migration-free", "inherits account scope
  for free") but no single change captures the decision.
- **Sample mode removal** — `lib/data.ts` records that the fallback was removed and the
  seed sets kept commented out. The reason is not stated.
- **Deal edits as overrides, never written back to HubSpot** — the mechanism is clear; the
  decision behind one-way sync is not evidenced.
- **Five implementation statuses, not a maturity model** — argued in the header of
  `lib/use-case-implementation.ts` (*"a maturity model nobody maintains collapses to
  whatever each record was created as"*). Currently documented as business rule R3 only.
- **Product state on the client rather than on the entity it describes** — the header of
  `lib/use-case-implementation.ts` gives three reasons (account permission scope inherited
  for free, atomic JSONB helpers already exist, a retired use case must not take a client's
  objective with it). Overlaps the `clients.properties` candidate above; one record should
  cover both.

*Written since this list was last revised:* transfer-matches-by-name is now
[0010](0010-transfer-the-universe-by-name-never-by-id.md).
