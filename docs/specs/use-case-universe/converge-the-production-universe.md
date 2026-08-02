# Feature brief — restore the Use Case Universe to one row, one definition, one category

> **Level 2.** Written by `signal-product-manager`. Describes **intended** behaviour and a
> remediation plan. Not product documentation. Do not cite as evidence of what Signal does today.

**Status:** Proposed
**Date:** 2026-08-01
**Product area:** Use Case Universe (with impact on Client Profile, Health, Insights)
**Verified against commit:** `4ec0810`
**Evidence:** production `workspace_config` dump
`.db-dumps/workspace-config-ylzghpqqrikpudjvxlxg-2026-08-01T18-55-16-380Z.json`
(`ylzghpqqrikpudjvxlxg` = `CLONE_SOURCE_URL` in `.env.clone`, i.e. production), taken
2026-08-01 18:55 UTC.

---

## Product judgement

**Do not build. Apply what already exists.**

The Use Case Universe does not need a new structure. The better structure is already
designed (`CATALOGUE` in `scripts/converge-use-case-universe.mjs`), the definitions are
already written, and both are already in the production database. What is missing is that
the two have come apart: 16 written definitions have no taxonomy row to attach to, 11 use
cases exist twice, and 3 categories are duplicated. The convergence script was written for
exactly this state and appears never to have been run against production.

Restructuring the taxonomy before fixing the split state would be designing on top of data
nobody can currently read.

---

## Problem

**Who has it.** Every user of the Universe. CSMs browsing for a use case to record; CS
Managers and Revenue reading adoption; Admins curating definitions.

**When it occurs.** Continuously, on every page load of `/use-cases`.

**What production actually contains.**

| Measure | Value |
|---|---|
| Taxonomy rows marked live | **24** |
| Distinct use cases they represent | **13** |
| Exact-label duplicate pairs | **11** |
| Category checkboxes in the filter rail | **9** |
| Distinct categories they represent | **6** |
| Written definitions in `use_case_library` | **29** |
| Definitions with no live row to attach to | **16** |
| Live rows carrying no definition at all | **11** |
| Retired ids with **no** surviving `added` row | **7 of 8** |
| Entries in the unread `renamed` map | **18** |

**Why that is insufficient — five distinct failures.**

1. **Eleven use cases render twice.** Each duplicated use case exists once under a
   `uc_<random>` id **that holds the definition** and once under its canonical slug **that
   holds nothing**. The directory shows two identically-titled cards, one written and one
   blank.
2. **Adoption is split across the twins.** Two accounts running Training Needs Analysis
   appear as two separate use cases with one client each. Every adoption figure on the page —
   the most-used sort, the client stack, the associated-ARR footer — is computed on halved
   counts.
3. **Sixteen of the published use cases are absent.** Employee Onboarding, Compliance
   Training, Leadership Development, Upskilling & Reskilling, Certification Preparation,
   AI Readiness, Digital Transformation, Technical Skills Training, Job-Role-Specific
   Training, GDP, Succession Development (HiPo), Career Transition Readiness, 360° Feedback,
   Internal Knowledge Base Development, Centralized Learning Academy, End-to-End Talent
   Strategy Activation. Readiness & Transformation held nine; it now holds Qiwa Disclosure
   alone.
4. **Seven retired ids have no surviving `added` row**, which is a hard delete from the
   application's point of view — the exact trap that decision `0008` and business rule R2
   were written to prevent. `resolveTaxonomy` emits only from `overlay.added`
   ([`lib/use-case-overlay.ts:148-157`](../../../lib/use-case-overlay.ts)), so any client
   implementation recorded against those ids is orphaned now.
5. **Three categories are duplicated** — `engagement` / `grp_03270e95` (both "Engagement &
   Culture"), `assessment` / `grp_4bb8faeb`, `performance` / `grp_9c093310`. The filter rail
   lists each twice, and members are split across the pair.

**A sixth, separate loss.** `use_case_taxonomy.renamed` holds 18 entries with materially
better summaries than what renders — *"Deliver and evidence mandatory learning so relevant
employees understand and complete the organisation's compliance requirements on time"*
against the shipped *"Meet evolving regulatory needs."* `normalizeOverlay` parses only
`added` and `retired` ([`lib/use-case-overlay.ts:91-118`](../../../lib/use-case-overlay.ts)),
so none of it is visible. It is a fossil of the delta model the overlay used before `7f731b7`.

**Consequence.** Operationally, a CSM cannot trust the picker and cannot find the use case
they want. Commercially, adoption and associated ARR are wrong in a direction nobody can
estimate, and `use_case_set` feeds health as a binary input (R9) — so a split taxonomy is
already moving health scores.

**Evidence available.** The production dump above, read directly.
**Evidence still missing.** How many client implementation records point at the seven
hard-deleted ids. This is the one number that decides whether step 1 below is urgent or
merely important.

---

## Product outcome

Every use case in the Universe appears exactly once, in exactly one category, carrying its
written definition and its true adoption count — so that "which use cases are landing, and
where" is a question the page answers correctly.

---

## Current state

The remediation is already built and is good. `scripts/converge-use-case-universe.mjs`
(commit `8650283`):

- creates the seven categories with the document's labels;
- ensures one row per catalogue use case, **keyed by its canonical slug**, so the alias table
  in `lib/use-cases.ts` keeps resolving onto it;
- restores a row for any definition that has lost one;
- **de-duplicates by name** — the row holding the definition wins, the other is retired with
  `mergedInto` set, so an account on the loser still reads as the winner;
- **folds a duplicate category into its canonical twin**, moving members first;
- copies a definition onto the canonical id where a duplicate holds the content;
- writes both `workspace_config` keys in **one transaction**;
- never deletes, and leaves anything the catalogue does not mention untouched;
- is **dry-run by default**; `--yes` applies, `--prod` targets `CLONE_SOURCE_URL`.

`scripts/inspect-use-case-taxonomy.mjs` is read-only with no write path at all, and exists
to check an environment's shape before and after.

---

## Recommendation

**Run the convergence. Do not redesign the taxonomy.**

Ship the target as written: **29 use cases across 7 categories.**

| Category | Count | Use cases |
|---|---|---|
| **Enablement** | 5 | Centralized Learning Academy · End-to-End Talent Strategy Activation · Internal Knowledge Base Development · Competency Framework & Job Architecture Design · Training Needs Analysis |
| **Readiness & Transformation** | 7 | Succession Development (HiPo) · Employee Onboarding · Certification Preparation · Graduate Development Program (GDP) · Career Transition Readiness · AI Readiness · Digital Transformation |
| **Capability Building** | 7 | Job-Role-Specific Training · Product & Service Knowledge Enablement · Leadership Development · Technical Skills Training · Upskilling & Reskilling · Expertise Sharing · Career Coaching & Development Conversations |
| **Performance & Talent** | 3 | Comprehensive Performance Management · Individual Development Plans (IDPs) · Performance Improvement Plans (PIPs) |
| **Assessment & Workforce Intelligence** | 3 | Hiring & Role-Based Assessments · Building In-House Assessment Centers · 360° Feedback |
| **Compliance & Regulatory** | 2 | Qiwa Training Disclosure · Compliance Training |
| **Engagement & Culture** | 2 | Employee Engagement & Feedback Measurement · Team-Building & Culture Development |

**Three things this target gets right, worth stating so they are not undone later:**

1. **Compliance split out of Readiness** (decision `0011`). Correct, and for the right
   reason: a compliance programme has a different trigger (a regulator and a deadline, not a
   strategy), a different buyer, and revenue that behaves differently because it is rarely
   discretionary. It also breaks up a nine-entry category that was doing three jobs.
2. **One use case, one category.** This removes the cross-listing that `lib/use-cases.ts`
   carries (26 category slots over 23 use cases). It is not only a content decision — it
   *resolves a live UI defect*: the directory card labels a use case with `groups[0]` while
   the filter matches on any group, so filtering by one category returns cards labelled with
   another. Removing cross-listing removes the cause rather than patching the card.
   `4ec0810` already did this for 360° Feedback.
3. **Qiwa Disclosure, Expertise Sharing and Internal Knowledge Base promoted** out of the
   `unresolved` tail into the real catalogue. This closes the standing open question *"should
   Qiwa Disclosure become a 24th published use case?"* — yes, as a Compliance entry.

**Why this over the alternatives.**

- *Redesign the taxonomy first.* Rejected: adoption data is currently split across 11
  duplicate pairs, so every input to a restructuring argument is wrong. Fix the data, then
  argue with it.
- *Hand-fix production through the Universe UI.* Rejected: the current state is partly the
  result of hand editing in the production UI (stated in the script header). It is also
  ~40 individual operations with no preview and no transaction.
- *Rebuild from a `replace` import.* Rejected: a `replace` clears written definitions for
  anything the file omits (R7), which is the one asset here that is intact.

---

## Scope

### Foundation

1. Confirm the production state with `inspect-use-case-taxonomy.mjs --prod` (read-only).
2. Count client implementations pointing at the seven hard-deleted ids.
3. Dry-run the convergence against **test**, read the diff, spot-check the UI.
4. Dry-run against production, read the diff.
5. Apply to production.
6. Re-inspect and verify against the acceptance criteria below.

### Later

- Resolve the `renamed` map: migrate its 18 summaries into `added`, or delete the key. Dead
  data that reads as content is a trap for the next person.
- Reconcile `lib/use-cases.ts` with the catalogue — it still ships the old 23, the old six
  category ids (no `compliance`), and labels that no longer match.
- The three content overlaps below, argued with corrected adoption data.

### Non-goals

- Changing storage, permissions, the five implementation statuses, retire-never-orphan,
  or transfer-by-name. None of the failures trace to them.
- Unifying the two taxonomies of decision `0006`. Larger, and not required here.
- Touching client implementation records. The convergence works on `workspace_config` only;
  account links are preserved by `mergedInto`, never rewritten.

---

## Where the content still needs an argument

Not blocking. Raised because a taxonomy people cannot discriminate between stops being used
honestly — they pick whichever they saw last, and adoption becomes noise.

**O-1. Three names for one thing, all in Capability Building** (joint-largest at 7).
*Job-Role-Specific Training* — "the technical, functional and behavioural capabilities
employees need to perform a defined role". *Technical Skills Training* — "the technical
capabilities employees need to perform specialised work". *Upskilling & Reskilling* — "new
or deeper capabilities so employees can meet changing role requirements". These are
paraphrases. **Recommend collapsing to two:** role-readiness now, and capability change over
time.

**O-2. Three overlapping routes to "help someone reach their next role"**, split across three
categories: *Career Coaching & Development Conversations* (Capability), *Career Transition
Readiness* (Readiness), *Individual Development Plans* (Performance). Defensible as
distinct instruments; confusing as three separate catalogue entries.

**O-3. A naming collision.** *Employee Engagement & Feedback Measurement* (Engagement) and
*360° Feedback* (Assessment) share a word for two different instruments in adjacent
categories. Rename one.

---

## Business rules

| ID | Rule | Enforced where |
|---|---|---|
| `BR-001` | A use case belongs to exactly one category | Convergence catalogue; not yet enforced in `TaxonomyManager` |
| `BR-002` | A retired id always keeps its `added` row, so it still resolves to a named entry | R2 / decision `0008` — **violated in production today** |
| `BR-003` | De-duplication retires the loser with `mergedInto`, never deletes | `converge-use-case-universe.mjs`; read path `resolveThroughMerges` |
| `BR-004` | Catalogue rows are keyed by canonical slug, so the `lib/use-cases.ts` alias table keeps resolving onto them | Convergence catalogue |
| `BR-005` | Both `workspace_config` keys are written in one transaction | `setWorkspaceConfigManyDb` |

---

## Acceptance criteria

- [ ] `AC-001` — Given production after convergence, When `/use-cases` is loaded, Then 29
      cards render and no two share a label.
- [ ] `AC-002` — Given the same page, When the Category rail is read, Then 7 checkboxes
      appear and no two share a label.
- [ ] `AC-003` — Given any of the 29 live rows, When its card is read, Then it carries a
      written definition — no live row has an empty library entry.
- [ ] `AC-004` — Given the 16 previously stranded definitions, When their use case is opened,
      Then the definition renders. None is lost.
- [ ] `AC-005` — Given an account previously linked to a de-duplicated id, When the Universe
      adoption list is read, Then that account appears once, under the surviving use case.
- [ ] `AC-006` — Given every id in `retired`, When `resolveTaxonomy(overlay, true)` is
      called, Then each returns a **named** entry — zero retired ids without an `added` row.
- [ ] `AC-007` — Given the Client Profile of an account with implementations, When the use
      case block is read, Then every implementation resolves to a named use case and no
      objective, scope or status has changed.
- [ ] `AC-008` — Given `use_case_set` health inputs, When health is recomputed, Then no
      account's use-case flag flips as a result of convergence. *(Guardrail: convergence must
      not move health.)*

---

## Risks and trade-offs

- **I am reading a dump, not live production.** It is timestamped today at 18:55 UTC, but if
  the convergence ran after that, this brief is already satisfied. One read-only command
  settles it. **Verify before acting on anything here.**
- **The destructive paths have never been exercised in a browser.** The product doc records
  this. `resolveThroughMerges` is tested; the server actions around it are not. Dry-run,
  read the diff, and apply to test first.
- **De-duplication picks a winner by "which row holds the definition".** Where a *pair* both
  hold content, or neither does, that heuristic needs a human. Read the dry-run output rather
  than trusting the count.
- **Convergence changes what the Universe shows, which changes adoption, which feeds health
  and Insights.** `AC-008` exists to catch that. Expect adoption figures to *rise* as split
  pairs merge — that is a correction, not growth, and should be said out loud before anyone
  reads it as a trend.
- **Against my own recommendation:** if the team has deliberately been curating production by
  hand toward a different catalogue, convergence will overwrite that intent. The dry-run diff
  is the check. If it shows changes nobody expected, stop and reconcile the catalogue first.

---

## Open decisions

| Decision | Options | Recommendation | Consequence of delay |
|---|---|---|---|
| `D-001` Apply convergence to production now, or after O-1/O-2/O-3 are settled? | (a) Now; content questions after. (b) Settle content first, converge once. | **(a).** The content questions need adoption data, which is unreadable until convergence runs. | Every day, more implementations are recorded against duplicate and orphaned ids. |
| `D-002` What happens to the 18 `renamed` summaries? | (a) Migrate into `added`. (b) Delete the key. | **(a)** — they are better than what ships, and migration is cheap. | Low, but it is a loaded gun for the next migration. |
| `D-003` Does `lib/use-cases.ts` get reconciled to the catalogue, or formally frozen as the HubSpot alias layer only? | (a) Reconcile labels and categories. (b) Freeze it as an alias table, and say so in its header. | **(b).** It has one real job — resolving HubSpot text onto canonical ids — and it does that well. Making it a second catalogue is what created decision `0006`. | Terminology drift between the picker and the Universe widens. |

---

## Coherence check

Introduces no new concept, status, source of truth, calculation, timeline or field. It
**removes** 11 duplicate concepts and 3 duplicate categories, and restores 16 that were lost.
No permission changes. No AI. `BR-001` (one category per use case) narrows an existing
freedom rather than adding a mechanism.

## Documenter handoff — after the convergence is applied, not before

- `docs/product/use-case-universe/README.md` — §2 (the two-taxonomy contradiction) needs the
  post-convergence id story; the "23 published across 6 categories" framing becomes 29 across 7.
- `docs/business-rules/use-case-associations.md` — R6 (multi-category) is superseded by
  one-use-case-one-category; add `BR-002`'s production violation to Known inconsistencies.
- `docs/known-limitations/contradictions.md` — record the split state **now**, with the
  numbers above. It describes today, independent of whether the fix ships.
- `docs/decisions/` — a record for "converge rather than chain fixes", evidenced by the
  script header and commit `8650283`.
- `docs/releases/CHANGELOG.md` — user-facing: the Universe now lists every use case once,
  with its definition, and adoption counts are no longer split.
- **Must not be documented until it ships:** the 29/7 structure, and any claim that the
  stranded definitions are visible.
