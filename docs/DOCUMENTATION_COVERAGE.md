# Documentation coverage

The index of what is documented, how well, and against what. The
`signal-product-documenter` agent updates this whenever it creates or substantially revises
a document.

**Statuses:** `Verified` · `Partially verified` · `Missing` · `Stale` · `Proposed only` ·
`Deprecated`

**Baseline established:** 2026-07-31 against commit `4214349` (branch `exec-dashboard`).
**Last change pass:** 2026-08-05 against commit `9d83a22` — covering the health-engine switch
(`9a8ea59` `1aec1a1` `31777c2` `abd355e` `afc55a5` `e6dc235`), the assignment-engine removal
(`07db772`), the stakeholder cutover (`b582d96` `2d55584` `9d83a22`), and the Health signals
profile tab (`009d404` … `131b31c`).
**Previous change pass:** 2026-08-03 against commit `6660fe8` — covering task updates and mentions
(`a9b0382`, `62f673b`, `6d76724`), notifications (`4fe7f17`), the development previews
(`52cdef2`), and three health-scoring rules (`8493a94`/`7b0fa94`, `2dbffe0`,
`e65573f`/`a395ff9`, `6660fe8`).
**Previous change pass:** 2026-07-31 against commit `15329e3` — covering `7f731b7` (Use Case
Universe directory, orphaning fixes, adoption backfill) and `15329e3` (documentation set,
no-database notice).

A row still showing `4214349` was **not re-verified in that pass** and is not stale by
implication — it simply has not been read again. Only rows the change touched were moved.

---

## Product areas

| Product area | Route | Document | Status | Last verified | Commit | Known gaps | Owner |
|---|---|---|---|---|---|---|---|
| Today | `/today` | [product/today](product/today/README.md) | Partially verified | 2026-08-03 | `6660fe8` | Priority ranking function not read end to end; commitments are mock-backed. Only the task thread and `?task=` deep link were re-read at this commit | Unassigned |
| Clients | `/clients` | [product/clients](product/clients/README.md) | Partially verified | 2026-08-05 | `9d83a22` | **New accounts arrive unowned** (assignment removed); the list now reads the applied status. `ClientsTable` filter/sort behaviour still not traced | Unassigned |
| Client Profile | `/clients/[id]` | [product/client-profile](product/client-profile/README.md) | Partially verified | 2026-08-05 | `9d83a22` | Tab list, Communication sub-tabs and the **Health signals** rename re-verified at this commit. Per-tab workflows still not individually documented | Unassigned |
| **Task updates & mentions** | Tasks sidebar, Today drawer | [product/task-updates](product/task-updates/README.md) | Partially verified | 2026-08-03 | `6660fe8` | Only the mention parser is tested. Never exercised with a real session — no Clerk locally. Delete gate runs after the write (defect) | Unassigned |
| Action list | `/inbox` | [product/action-list](product/action-list/README.md) | Partially verified | 2026-08-05 | `9d83a22` | **Health and stakeholder signal rules rewritten** for the engine and profiles; health signals are tested. Un-dismiss path still unconfirmed; `enrich.ts` prompt not reviewed | Unassigned |
| Users & permissions | `/settings?tab=members` | [product/users-and-permissions](product/users-and-permissions/README.md) | Partially verified | 2026-08-05 | `9d83a22` | **The legacy granular roles lost their only consumer** when assignment was removed. Still no tests. Crown-only action list last re-verified at `15329e3` | Unassigned |
| Health & CS Pulse | `/reports/health`, profile | [product/health](product/health/README.md) | Partially verified — **rewritten** | 2026-08-05 | `9d83a22` | **The engine is now the scorer**; §1–§4 rewritten and test-backed. Residues: `lib/metrics/health.ts` is dead code with 21 tests; the 19 `health_*` tables are unwritten so there is no history. The Health signals UI is read, not tested end to end | Unassigned |
| Insights | `/reports` | [product/insights](product/insights/README.md) | Partially verified | 2026-08-05 | `9d83a22` | Health drag re-pointed at the engine (`lib/health/drag.ts`). **Still bands the raw score on 75/55 while the model uses 65/50/25** — the at-risk contradiction now lives here. Individual panels not traced | Unassigned |
| Churn | `/reports/churn` | [product/churn](product/churn/README.md) | Partially verified | 2026-07-31 | `4214349` | `ChurnPanel` internals not traced | Unassigned |
| Use Case Universe | `/use-cases` | [product/use-case-universe](product/use-case-universe/README.md) | Partially verified | 2026-07-31 | `15329e3` | Two taxonomies unresolved. Transfer role gate and the replace/reset paths **are now traced**; none of them has been run in a browser. Live-entry count is a database observation, not repo-verifiable | Unassigned |
| Stakeholders | profile tab | [product/stakeholders](product/stakeholders/README.md) | Partially verified — **rewritten** | 2026-08-05 | `9d83a22` | **Mapping matrix retired; profiles feed health.** Coverage, facts and the migration planner are tested. Profile field list still not enumerated; the migration's live health impact is unmeasured | Unassigned |
| Project Management | profile tab | [product/projects](product/projects/README.md) | Partially verified | 2026-07-31 | `4214349` | Milestone/task field lists not enumerated | Unassigned |
| Expansion | `/expansion` | [product/expansion](product/expansion/README.md) | Verified | 2026-08-16 | working tree | `attention()` is unit tested (25 tests) and the board, client-profile card, Action list and Today lane were each checked in a browser against the seeded pipeline. **Not verified with a real non-super-admin session** — the guest and scoped-operator refusals are read from the gates, not exercised. The close flow's Won/Lost/Dropped paths are traced, not yet run end to end | Unassigned |
| Settings | `/settings` | [product/settings](product/settings/README.md) | Partially verified | 2026-08-05 | `9d83a22` | **Automations tab removed; 6 tabs.** Client health tab restructured around the engine. Per-manager behaviour still not documented individually | Unassigned |
| Integrations & sync | `/settings?tab=integrations` | [product/integrations](product/integrations/README.md) | Partially verified | 2026-07-31 | `4214349` | Per-integration field mapping not documented | Unassigned |
| Import | `/import` | [product/import](product/import/README.md) | Partially verified | 2026-07-31 | `4214349` | Full column list not enumerated | Unassigned |
| Playbooks | `/playbooks` | [product/playbooks](product/playbooks/README.md) | **Deprecated** — verified non-functional | 2026-07-31 | `4214349` | — | Unassigned |
| Notifications | sidebar bell | [product/notifications](product/notifications/README.md) | Partially verified | 2026-08-03 | `6660fe8` | Only `notificationHref()` is tested. Polling, routing on arrival and read-marking never exercised with a real session | Unassigned |
| Notes | profile tab | — | **Missing** | — | — | Sanitisation and permissions undocumented | Unassigned |
| Attachments | profile tab | — | **Missing** | — | — | Supabase Storage path and categories undocumented | Unassigned |
| Usage | profile tab, `lib/usage` | — | **Missing** | — | — | Adoption score formula undocumented | Unassigned |
| Support & satisfaction | profile tabs | — | **Missing** | — | — | SLA rules, CSAT normalisation, survey sync undocumented | Unassigned |
| Communication | profile tab | — | **Missing** | — | — | Email/meeting sync undocumented | Unassigned |
| `scratch-*` prototypes | `/scratch-*` | — | Deliberately **not documented** | 2026-07-31 | `4214349` | Listed in known-limitations | — |

## Cross-product documents

| Document | Status | Last verified | Commit | Known gaps |
|---|---|---|---|---|
| [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md) | Partially verified | 2026-08-05 | `9d83a22` | §9's limitations rewritten; §1–§8 last read at `4214349` |
| [PRODUCT_MAP.md](PRODUCT_MAP.md) | Verified | 2026-08-05 | `9d83a22` | Settings tabs (6), profile tabs, scratch routes (12) and the dependency graph re-read. Page-section lists are summaries, not exhaustive |
| [GLOSSARY.md](GLOSSARY.md) | Partially verified | 2026-08-05 | `9d83a22` | Health, assignment and stakeholder vocabulary rewritten. Usage and support vocabulary still thin |
| [data-model](data-model/README.md) | Partially verified | 2026-08-05 | `9d83a22` | Stakeholder storage and `csmSource` re-verified. Per-entity field lists incomplete; the 19 health tables still not individually documented — and still unwritten |
| [architecture](architecture/README.md) | Partially verified | 2026-08-05 | `9d83a22` | Stack, testing and boundaries re-verified. `instrumentation.ts` still unverified |
| [known-limitations](known-limitations/README.md) | Partially verified | 2026-08-05 | `9d83a22` | Re-read in full; one defect marked fixed, three widened |
| [contradictions](known-limitations/contradictions.md) | Verified | 2026-07-31 | `15329e3` | — |
| [releases/CHANGELOG.md](releases/CHANGELOG.md) | Partially verified | 2026-07-31 | `15329e3` | Only covers 2026-07-26 onward. Backfill run figures are reported from an execution, not repo-verifiable |
| [BACKLOG.md](BACKLOG.md) | Verified | 2026-07-31 | `4214349` | — |

## Business rules

| Rule family | Document | Status | Last verified | Commit | Known gaps |
|---|---|---|---|---|---|
| Permissions, ownership, scoping | [permissions-and-scoping](business-rules/permissions-and-scoping.md) | **Contradictory** | 2026-08-03 | `6660fe8` | No tests. R12–R14 added for the task-update work; **R14's stated rule and executed behaviour differ** (delete before the check). R6a/R11 added at `15329e3`; R1–R10 last read at `4214349` |
| ARR, revenue movement, retention | [arr-and-revenue-movement](business-rules/arr-and-revenue-movement.md) | Partially verified | 2026-07-31 | `4214349` | No tests; "renewal requiring attention" untraced |
| Health scoring, at-risk | [health-scoring](business-rules/health-scoring.md) | **Contradictory** | 2026-08-03 | `6660fe8` | Two code bases; at-risk definition unresolved and now reachable two ways (score band, and tier cap). **R10, R11, R12 are `Verified`** — 21 tests; R1–R9 remain untested |
| Churn | [churn](business-rules/churn.md) | Partially verified | 2026-07-31 | `4214349` | Full default taxonomy not enumerated |
| Profile completeness | [profile-completeness](business-rules/profile-completeness.md) | Partially verified | 2026-07-31 | `4214349` | Full field list not enumerated |
| Owner assignment and routing | [assignment](business-rules/assignment.md) | **Removed** | 2026-08-05 | `9d83a22` | Feature deleted `07db772`. Document retained to explain historical `csmSource: 'auto'` rows and the legacy roles' lost justification |
| Use-case associations | [use-case-associations](business-rules/use-case-associations.md) | Partially verified | 2026-07-31 | `15329e3` | Two taxonomies unresolved. **R2, R2a and R7a are now `Verified`** (tested); R1's four invariants and every server action remain untested |
| Task assignment and ownership | [permissions-and-scoping R6a](business-rules/permissions-and-scoping.md#r6a--assigning-a-task-to-someone-else-is-admin-only-and-refused-rather-than-downgraded) | Partially verified | 2026-07-31 | `15329e3` | Documented as a rule within permissions; `today_tasks` priority semantics still `Missing`. Reassignment still notifies nobody |
| Task updates, mentions and access | [permissions-and-scoping R12–R14](business-rules/permissions-and-scoping.md#r12--a-mention-grants-nothing) | Partially verified | 2026-08-05 | `9d83a22` | **R14 is now enforced as stated** (`4ed593d` — the author predicate gates the write). R12 holds by construction and the parser is tested. R13 still excludes Guests from *reading*, against the specification — an open product question |
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
| [0011](decisions/0011-split-compliance-out-of-readiness-and-transformation.md) | Split Compliance out of Readiness & Transformation | Accepted |
| [0012](decisions/0012-a-mention-is-a-reference-not-a-grant.md) | A mention is a reference, not a grant | Accepted |
| [0013](decisions/0013-record-keeping-alone-is-not-a-health-score.md) | Record-keeping alone is not a health score | Accepted |
| [0014](decisions/0014-a-critical-pulse-caps-the-tier-and-leaves-the-score-alone.md) | A Critical Pulse caps the tier, and leaves the score alone | Accepted |

## Pre-existing documents retained

| Document | Status | Note |
|---|---|---|
| [health-engine.md](health-engine.md) | Retained as-is | High quality. Documents the **unwired** engine — do not read it as current behaviour. Minor drift: it says "20 tests". Its schema (`lib/db/health-schema.ts`, `drizzle/health-tables.sql`) became *tracked* in `15329e3`; it still has no writer |
| [employees-consolidation-spec.md](employees-consolidation-spec.md) | **Proposed only** | A spec, not implemented behaviour. Not verified in this baseline |
| `../README.md` | **Stale** | Sample mode, crons, `recharts`, ARR baseline all out of date. Outside this documentation set's remit |

---

## Coverage summary

- **18 product areas documented**, 5 `Missing`. No area changed status this pass; **four were
  rewritten** (health, stakeholders, settings, action list) because the behaviour changed
  under them.
- **11 business-rule families documented**, 4 `Missing`. One — **assignment** — is now
  `Removed`; the document is retained to explain historical data and the legacy roles.
  **health-scoring was rewritten end to end** (R1–R11) for the engine; its previous R10–R12
  are superseded, their *principles* surviving as the evidence rule and the status rules.
- **17 decision records.** Three added this pass: [0015](decisions/0015-the-engine-scores-health-and-every-surface-reads-the-applied-status.md),
  [0016](decisions/0016-remove-auto-assignment-accounts-arrive-unowned.md),
  [0017](decisions/0017-stakeholder-profiles-are-the-only-relationship-model.md). 0007's open
  question is **answered**; 0013 and 0014 are superseded as implementations.
- **1 area verified non-functional** and documented as such.
- **Zero product *areas* at `Verified`.** Twenty test files, **233 tests** (up from 157 on
  2026-08-03), and still none touches a page, a permission gate, or — with the exception of
  the task-update rules — a server action. **21 of the 233 test dead code**
  (`lib/metrics/health.ts`). This is the honest state, not a gap in the documentation effort.
- **Contradictions moved, net −1.** *Two health systems* and *the task-update delete* are
  **resolved**; *"at risk" has two definitions* was **widened** — the two definitions now use
  different cutoffs on different fields (65/50/25 on the applied status vs 75/55 on the raw
  score) — and the `CsPulsePanel` header contradiction got worse, not better.

### What would move the needle

Not more documentation. Tests on: the permission gates (every one is read-only-verified — and
this pass found one, R14, that does not do what it says), the destructive Use Case Universe
server actions, and `lib/use-case-implementation.ts`'s four separation invariants (R1).

The 2026-08-03 health work is the counter-example worth copying: three rules, 21 tests written
against the *invariant* (zero usage is evidence; stakeholder Critical must not cap; a lapsed
Pulse stops capping), and they are the only health rules in this documentation set that are not
`Unverified`.
