# Business rules

Cross-product rules that govern Signal regardless of which page you are on. Feature
documents link here rather than restating them.

| Rule family | Document | Status |
|---|---|---|
| Roles, permissions, ownership, scoping | [permissions-and-scoping.md](permissions-and-scoping.md) | Verified (no tests) |
| ARR, revenue movement, retention, renewals | [arr-and-revenue-movement.md](arr-and-revenue-movement.md) | Partially verified |
| Health scoring, tiers, at-risk | [health-scoring.md](health-scoring.md) | Contradictory (two systems) |
| Churn classification and evidence | [churn.md](churn.md) | Partially verified |
| Profile completeness and data quality | [profile-completeness.md](profile-completeness.md) | Partially verified |
| Owner assignment and routing | [assignment.md](assignment.md) | Partially verified |
| Use-case associations and lifecycle | [use-case-associations.md](use-case-associations.md) | Partially verified |
| Date filtering and period comparison | [dates-and-periods.md](dates-and-periods.md) | Partially verified |
| Archiving, deletion and audit | [archiving-and-audit.md](archiving-and-audit.md) | Partially verified |

## Rule families not yet documented

Recorded in [BACKLOG.md](../BACKLOG.md), not invented here:

- **Attention prioritisation** — how Today ranks priorities. The ranking function has not
  been read end to end.
- **Task priority** — `today_tasks.priority` and `project_tasks` priority semantics.
- **Stakeholder role rules** beyond coverage.
- **Data reconciliation** — what happens when HubSpot and Signal disagree, beyond the
  override mechanism.

## How to read a rule document

Each states: plain-language definition · formula or condition · inputs and their sources ·
exceptions · worked examples · relevant code · relevant tests · known inconsistencies.

Where the interface says one thing and the backend does another, the document says so and
does not pick a winner. Those also appear in
[known-limitations/contradictions.md](../known-limitations/contradictions.md).
