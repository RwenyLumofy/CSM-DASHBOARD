# Documentation coverage

The index of what is documented, how well, and against what. The
`signal-product-documenter` agent updates this whenever it creates or substantially revises
a document.

**Statuses:** `Verified` · `Partially verified` · `Missing` · `Stale` · `Proposed only` ·
`Deprecated`

**Baseline established:** 2026-07-31 against commit `4214349` (branch `exec-dashboard`).

---

## Product areas

| Product area | Route | Document | Status | Last verified | Commit | Known gaps | Owner |
|---|---|---|---|---|---|---|---|
| Today | `/today` | [product/today](product/today/README.md) | Partially verified | 2026-07-31 | `4214349` | Priority ranking function not read end to end; commitments are mock-backed | Unassigned |
| Clients | `/clients` | [product/clients](product/clients/README.md) | Partially verified | 2026-07-31 | `4214349` | `ClientsTable` filter/sort behaviour not traced | Unassigned |
| Client Profile | `/clients/[id]` | [product/client-profile](product/client-profile/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-tab workflows not individually documented | Unassigned |
| Action list | `/inbox` | [product/action-list](product/action-list/README.md) | Partially verified | 2026-07-31 | `4214349` | Un-dismiss path unconfirmed; `enrich.ts` prompt not reviewed | Unassigned |
| Users & permissions | `/settings?tab=members` | [product/users-and-permissions](product/users-and-permissions/README.md) | Partially verified | 2026-07-31 | `4214349` | No tests exist to raise this to Verified | Unassigned |
| Health & CS Pulse | `/reports/health`, profile | [product/health](product/health/README.md) | **Contradictory** | 2026-07-31 | `4214349` | Two systems; override behaviour in the live path unverified | Unassigned |
| Insights | `/reports` | [product/insights](product/insights/README.md) | Partially verified | 2026-07-31 | `4214349` | Individual panels not traced; at-risk definition unresolved | Unassigned |
| Churn | `/reports/churn` | [product/churn](product/churn/README.md) | Partially verified | 2026-07-31 | `4214349` | `ChurnPanel` internals not traced | Unassigned |
| Use Case Universe | `/use-cases` | [product/use-case-universe](product/use-case-universe/README.md) | Partially verified | 2026-07-31 | `4214349` | Two taxonomies unresolved; transfer role gate and HEAD's re-import path unverified | Unassigned |
| Stakeholders | profile tab | [product/stakeholders](product/stakeholders/README.md) | Partially verified | 2026-07-31 | `4214349` | Profile field list not enumerated | Unassigned |
| Project Management | profile tab | [product/projects](product/projects/README.md) | Partially verified | 2026-07-31 | `4214349` | Milestone/task field lists not enumerated | Unassigned |
| Settings | `/settings` | [product/settings](product/settings/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-manager behaviour not documented individually | Unassigned |
| Integrations & sync | `/settings?tab=integrations` | [product/integrations](product/integrations/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-integration field mapping not documented | Unassigned |
| Import | `/import` | [product/import](product/import/README.md) | Partially verified | 2026-07-31 | `4214349` | Full column list not enumerated | Unassigned |
| Playbooks | `/playbooks` | [product/playbooks](product/playbooks/README.md) | **Deprecated** — verified non-functional | 2026-07-31 | `4214349` | — | Unassigned |
| Notifications | sidebar bell, `/inbox` | — | **Missing** | — | — | Not yet documented as its own area | Unassigned |
| Notes | profile tab | — | **Missing** | — | — | Sanitisation and permissions undocumented | Unassigned |
| Attachments | profile tab | — | **Missing** | — | — | Supabase Storage path and categories undocumented | Unassigned |
| Usage | profile tab, `lib/usage` | — | **Missing** | — | — | Adoption score formula undocumented | Unassigned |
| Support & satisfaction | profile tabs | — | **Missing** | — | — | SLA rules, CSAT normalisation, survey sync undocumented | Unassigned |
| Communication | profile tab | — | **Missing** | — | — | Email/meeting sync undocumented | Unassigned |
| `scratch-*` prototypes | `/scratch-*` | — | Deliberately **not documented** | 2026-07-31 | `4214349` | Listed in known-limitations | — |

## Cross-product documents

| Document | Status | Last verified | Commit | Known gaps |
|---|---|---|---|---|
| [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md) | Partially verified | 2026-07-31 | `4214349` | — |
| [PRODUCT_MAP.md](PRODUCT_MAP.md) | Verified | 2026-07-31 | `4214349` | Page-section lists are summaries, not exhaustive |
| [GLOSSARY.md](GLOSSARY.md) | Partially verified | 2026-07-31 | `4214349` | Usage and support vocabulary thin |
| [data-model](data-model/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-entity field lists incomplete; health tables not individually documented |
| [architecture](architecture/README.md) | Partially verified | 2026-07-31 | `4214349` | `instrumentation.ts` unverified |
| [known-limitations](known-limitations/README.md) | Partially verified | 2026-07-31 | `4214349` | — |
| [contradictions](known-limitations/contradictions.md) | Verified | 2026-07-31 | `4214349` | — |
| [releases/CHANGELOG.md](releases/CHANGELOG.md) | Partially verified | 2026-07-31 | `4214349` | Only covers 2026-07-26 onward |
| [BACKLOG.md](BACKLOG.md) | Verified | 2026-07-31 | `4214349` | — |

## Business rules

| Rule family | Document | Status | Last verified | Commit | Known gaps |
|---|---|---|---|---|---|
| Permissions, ownership, scoping | [permissions-and-scoping](business-rules/permissions-and-scoping.md) | Partially verified | 2026-07-31 | `4214349` | No tests |
| ARR, revenue movement, retention | [arr-and-revenue-movement](business-rules/arr-and-revenue-movement.md) | Partially verified | 2026-07-31 | `4214349` | No tests; "renewal requiring attention" untraced |
| Health scoring, at-risk | [health-scoring](business-rules/health-scoring.md) | **Contradictory** | 2026-07-31 | `4214349` | Two systems; at-risk definition unresolved |
| Churn | [churn](business-rules/churn.md) | Partially verified | 2026-07-31 | `4214349` | Full default taxonomy not enumerated |
| Profile completeness | [profile-completeness](business-rules/profile-completeness.md) | Partially verified | 2026-07-31 | `4214349` | Full field list not enumerated |
| Assignment and routing | [assignment](business-rules/assignment.md) | Partially verified | 2026-07-31 | `4214349` | No tests |
| Use-case associations | [use-case-associations](business-rules/use-case-associations.md) | Partially verified | 2026-07-31 | `4214349` | Two taxonomies unresolved |
| Dates and periods | [dates-and-periods](business-rules/dates-and-periods.md) | Partially verified | 2026-07-31 | `4214349` | No tests |
| Archiving, deletion, audit | [archiving-and-audit](business-rules/archiving-and-audit.md) | Partially verified | 2026-07-31 | `4214349` | — |
| Attention prioritisation | — | **Missing** | — | — | Today's ranking function |
| Task priority | — | **Missing** | — | — | `today_tasks` / `project_tasks` priority semantics |
| Stakeholder role rules | — | **Missing** | — | — | Beyond coverage |
| Data reconciliation | — | **Missing** | — | — | Source disagreement beyond the override mechanism |

## Decision records

| # | Decision | Status |
|---|---|---|
| [0001](decisions/0001-separate-use-case-definition-from-client-application.md) | Definition vs client application | Accepted |
| [0002](decisions/0002-rebuild-the-taxonomy-on-the-published-23-and-alias-hubspot-on-read.md) | Published 23; alias on read | Accepted (partly superseded) |
| [0003](decisions/0003-arr-is-an-event-ledger-not-a-synced-field.md) | ARR is an event ledger | Accepted |
| [0004](decisions/0004-four-flat-permission-tiers-with-server-side-write-gates.md) | Four permission tiers; write gate | Accepted |
| [0005](decisions/0005-drop-draft-and-derive-review-state.md) | Drop Draft; derive review state | Accepted |
| [0006](decisions/0006-two-unlinked-use-case-taxonomies.md) | Uncouple the overlay | Accepted; end state unresolved |
| [0007](decisions/0007-define-health-risk-renewal-and-churn-separately.md) | Health/risk/renewal/churn separated | Accepted; implementation contradictory |

## Pre-existing documents retained

| Document | Status | Note |
|---|---|---|
| [health-engine.md](health-engine.md) | Retained as-is | High quality. Documents the **unwired** engine — do not read it as current behaviour. Minor drift: it says "20 tests"; `engine.test.ts` now has 25 |
| [employees-consolidation-spec.md](employees-consolidation-spec.md) | **Proposed only** | A spec, not implemented behaviour. Not verified in this baseline |
| `../README.md` | **Stale** | Sample mode, crons, `recharts`, ARR baseline all out of date. Outside this documentation set's remit |

---

## Coverage summary

- **16 product areas documented**, 6 `Missing`.
- **9 business-rule families documented**, 4 `Missing`.
- **7 decision records.**
- **1 area verified non-functional** and documented as such.
- **Zero areas at `Verified`** except `PRODUCT_MAP` and `contradictions` — a direct
  consequence of six test files covering the whole product. This is the honest state, not a
  gap in the documentation effort.
