# Documentation coverage

The index of what is documented, how well, and against what. The
`signal-product-documenter` agent updates this whenever it creates or substantially revises
a document.

**Statuses:** `Verified` · `Partially verified` · `Missing` · `Stale` · `Proposed only` ·
`Deprecated`

**Baseline established:** 2026-07-31 against commit `4214349` (branch `exec-dashboard`).
**Last change pass:** 2026-07-31 against commit `15329e3` — covering `7f731b7` (Use Case
Universe directory, orphaning fixes, adoption backfill) and `15329e3` (documentation set,
no-database notice).

A row still showing `4214349` was **not re-verified in that pass** and is not stale by
implication — it simply has not been read again. Only rows the change touched were moved.

---

## Product areas

| Product area | Route | Document | Status | Last verified | Commit | Known gaps | Owner |
|---|---|---|---|---|---|---|---|
| Today | `/today` | [product/today](product/today/README.md) | Partially verified | 2026-07-31 | `4214349` | Priority ranking function not read end to end; commitments are mock-backed | Unassigned |
| Clients | `/clients` | [product/clients](product/clients/README.md) | Partially verified | 2026-07-31 | `4214349` | `ClientsTable` filter/sort behaviour not traced | Unassigned |
| Client Profile | `/clients/[id]` | [product/client-profile](product/client-profile/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-tab workflows not individually documented | Unassigned |
| Action list | `/inbox` | [product/action-list](product/action-list/README.md) | Partially verified | 2026-07-31 | `4214349` | Un-dismiss path unconfirmed; `enrich.ts` prompt not reviewed | Unassigned |
| Users & permissions | `/settings?tab=members` | [product/users-and-permissions](product/users-and-permissions/README.md) | Partially verified | 2026-07-31 | `15329e3` | No tests exist to raise this to Verified. Only the crown-only action list re-verified at this commit | Unassigned |
| Health & CS Pulse | `/reports/health`, profile | [product/health](product/health/README.md) | **Contradictory** | 2026-07-31 | `4214349` | Two systems; override behaviour in the live path unverified | Unassigned |
| Insights | `/reports` | [product/insights](product/insights/README.md) | Partially verified | 2026-07-31 | `4214349` | Individual panels not traced; at-risk definition unresolved | Unassigned |
| Churn | `/reports/churn` | [product/churn](product/churn/README.md) | Partially verified | 2026-07-31 | `4214349` | `ChurnPanel` internals not traced | Unassigned |
| Use Case Universe | `/use-cases` | [product/use-case-universe](product/use-case-universe/README.md) | Partially verified | 2026-07-31 | `15329e3` | Two taxonomies unresolved. Transfer role gate and the replace/reset paths **are now traced**; none of them has been run in a browser. Live-entry count is a database observation, not repo-verifiable | Unassigned |
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
| [PRODUCT_MAP.md](PRODUCT_MAP.md) | Verified | 2026-07-31 | `15329e3` | Page-section lists are summaries, not exhaustive. Only the `/use-cases` rows and the access table were re-read at this commit |
| [GLOSSARY.md](GLOSSARY.md) | Partially verified | 2026-07-31 | `4214349` | Usage and support vocabulary thin |
| [data-model](data-model/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-entity field lists incomplete; health tables not individually documented |
| [architecture](architecture/README.md) | Partially verified | 2026-07-31 | `4214349` | `instrumentation.ts` unverified |
| [known-limitations](known-limitations/README.md) | Partially verified | 2026-07-31 | `15329e3` | Now carries outstanding-work and never-browser-tested sections |
| [contradictions](known-limitations/contradictions.md) | Verified | 2026-07-31 | `15329e3` | — |
| [releases/CHANGELOG.md](releases/CHANGELOG.md) | Partially verified | 2026-07-31 | `15329e3` | Only covers 2026-07-26 onward. Backfill run figures are reported from an execution, not repo-verifiable |
| [BACKLOG.md](BACKLOG.md) | Verified | 2026-07-31 | `4214349` | — |

## Business rules

| Rule family | Document | Status | Last verified | Commit | Known gaps |
|---|---|---|---|---|---|
| Permissions, ownership, scoping | [permissions-and-scoping](business-rules/permissions-and-scoping.md) | Partially verified | 2026-07-31 | `15329e3` | No tests. R6a and R11 added for `7f731b7`; R1–R10 last read end to end at `4214349` |
| ARR, revenue movement, retention | [arr-and-revenue-movement](business-rules/arr-and-revenue-movement.md) | Partially verified | 2026-07-31 | `4214349` | No tests; "renewal requiring attention" untraced |
| Health scoring, at-risk | [health-scoring](business-rules/health-scoring.md) | **Contradictory** | 2026-07-31 | `4214349` | Two systems; at-risk definition unresolved |
| Churn | [churn](business-rules/churn.md) | Partially verified | 2026-07-31 | `4214349` | Full default taxonomy not enumerated |
| Profile completeness | [profile-completeness](business-rules/profile-completeness.md) | Partially verified | 2026-07-31 | `4214349` | Full field list not enumerated |
| Assignment and routing | [assignment](business-rules/assignment.md) | Partially verified | 2026-07-31 | `4214349` | No tests |
| Use-case associations | [use-case-associations](business-rules/use-case-associations.md) | Partially verified | 2026-07-31 | `15329e3` | Two taxonomies unresolved. **R2, R2a and R7a are now `Verified`** (tested); R1's four invariants and every server action remain untested |
| Task assignment and ownership | [permissions-and-scoping R6a](business-rules/permissions-and-scoping.md#r6a--assigning-a-task-to-someone-else-is-admin-only-and-refused-rather-than-downgraded) | Partially verified | 2026-07-31 | `15329e3` | Documented as a rule within permissions; `today_tasks` priority semantics still `Missing` |
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
| [0006](decisions/0006-two-unlinked-use-case-taxonomies.md) | Uncouple the overlay | Accepted; end state unresolved; **corrected 2026-07-31** on ids |
| [0007](decisions/0007-define-health-risk-renewal-and-churn-separately.md) | Health/risk/renewal/churn separated | Accepted; implementation contradictory |
| [0008](decisions/0008-a-retirement-marker-is-not-enough-keep-the-taxonomy-row.md) | A retirement marker is not enough — keep the taxonomy row | Accepted |
| [0009](decisions/0009-validate-outbound-urls-on-read-not-only-on-write.md) | Validate an outbound URL on read | Accepted |
| [0010](decisions/0010-transfer-the-universe-by-name-never-by-id.md) | Transfer by name, never by id | Accepted |

## Pre-existing documents retained

| Document | Status | Note |
|---|---|---|
| [health-engine.md](health-engine.md) | Retained as-is | High quality. Documents the **unwired** engine — do not read it as current behaviour. Minor drift: it says "20 tests". Its schema (`lib/db/health-schema.ts`, `drizzle/health-tables.sql`) became *tracked* in `15329e3`; it still has no writer |
| [employees-consolidation-spec.md](employees-consolidation-spec.md) | **Proposed only** | A spec, not implemented behaviour. Not verified in this baseline |
| `../README.md` | **Stale** | Sample mode, crons, `recharts`, ARR baseline all out of date. Outside this documentation set's remit |

---

## Coverage summary

- **16 product areas documented**, 6 `Missing`.
- **9 business-rule families documented**, 4 `Missing`. Three individual rules
  (use-case-associations R2, R2a, R7a) reached `Verified` on 2026-07-31 — the first rules in
  Signal pinned by tests written specifically for the invariant rather than for the module.
- **10 decision records.**
- **1 area verified non-functional** and documented as such.
- **Zero product areas at `Verified`** except `PRODUCT_MAP` and `contradictions` — a direct
  consequence of seven test files covering the whole product, none of which touch a server
  action, a page, or a permission gate. This is the honest state, not a gap in the
  documentation effort.

### What would move the needle

Not more documentation. Tests on: the permission gates (every one is read-only-verified),
the destructive Use Case Universe server actions, and `lib/use-case-implementation.ts`'s
four separation invariants (R1), which are the most important rules in the product and are
currently protected only by code structure.
