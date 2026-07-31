# Business rule — Use-case associations and lifecycle

**Status:** Partially verified — five modules are **tested**; page-level behaviour is not
**Last verified:** 2026-07-31 · **Commit:** `15329e3`

Narrative: [use-case-universe](../product/use-case-universe/README.md).

---

## R1 — Definition and implementation are separate records

**Definition.**

| | Lives | Scope |
|---|---|---|
| **Use-case definition** | The Universe (taxonomy + library) | Organisation-wide, reusable |
| **Client implementation** | `clients.properties.use_case_implementations` | One account |

**The invariants.**

1. Editing a client's implementation **never** alters the canonical definition.
2. Editing the canonical definition **never** overwrites client-specific data.
3. The Universe shows definitions and their associated accounts.
4. The Client Profile explains how the selected use cases apply to *that* client.

**Why the implementation is stored on the client** (three stated reasons):
it is account data and inherits the account's permission scope for free; the atomic JSONB
array helpers already exist for `clients.properties`; and a use case that gets retired
**must not take a client's recorded objective with it**.

**Code.** `lib/use-case-implementation.ts`. **Tests.** `lib/use-case-implementation.test.ts`
exists but covers bucketing (R2a) and URL safety (R7a) — **the four invariants above are
still unpinned by any test** and are protected only by code structure.

---

## R2 — Retire, never orphan

**Status: Verified** (implementation read end to end, and pinned by tests in
`lib/use-case-transfer.test.ts` and `lib/use-case-implementation.test.ts`).

**Definition.** A use case is **retired**, not deleted — and "retired" means the id keeps
**resolving to a named entry**, not merely that a marker was written somewhere.

**Why.** An account's implementation record
(`clients.properties.use_case_implementations[].useCaseId`) points at a use-case id. If
that id stops resolving, the account's record is orphaned: the profile renders the raw id
or nothing at all, and `/use-cases/[id]` 404s. The record itself is not deleted — it simply
becomes unreadable, which is worse, because nothing reports it.

### The mechanism, and the trap

`resolveTaxonomy(overlay, includeRetired)` emits **only** from `overlay.added`
(`lib/use-case-overlay.ts`). `overlay.retired[id]` is a *marker*, not a row. So:

> Writing `retired[id]` without keeping `added[id]` is a hard delete from the
> application's point of view.

Any path that removes a use case must therefore write **both**: keep the `added` row *and*
set the `retired` marker.

### The four paths that can remove a use case, and how each honours the rule

| Path | Code | How it keeps the id resolving |
|---|---|---|
| Retire / merge a single entry | [`retireUseCaseAction`](../../app/%28app%29/use-cases/taxonomy-actions.ts) | Writes only `retired[id]`; `added[id]` is never touched, so it survives by default |
| `replace` import | [`planImport`](../../lib/use-case-transfer.ts) removal loop | Re-states `added[id]` (label, summary, groups, original `createdAt`/`createdBy`) alongside `retired[id]`, because a `replace` rebuilds the overlay from empty |
| Reset the whole database | [`resetTaxonomyAction`](../../app/%28app%29/use-cases/taxonomy-actions.ts) | Keeps `added[id]` **and** its categories for every id an implementation still references; everything unreferenced really is wiped |
| Delete a category | [`deleteCategoryAction`](../../app/%28app%29/use-cases/taxonomy-actions.ts) | Refuses while any use case (live **or** retired) still lists it, so a delete that succeeds is genuinely empty |

**Fixed in commit `7f731b7`.** The `replace` and reset paths previously wrote the marker
alone. Three assertions in `lib/use-case-transfer.test.ts` had pinned that shape as
correct — two of them contradicting their own comments — and were rewritten. The
end-to-end guarantee is now asserted through the reader the app actually uses:
`resolveTaxonomy(plan.taxonomy)` must not list the entry, and
`resolveTaxonomy(plan.taxonomy, true)` must still return it, named and marked retired.

### Reset keeps the row but not the definition

`resetTaxonomyAction` retains the taxonomy row so the id resolves to a **name**. It wipes
`workspace_config.use_case_library` unconditionally: a retained row does not need to carry
a customer problem and desired outcome nobody maintains any more.

**Ids are never reused.** New entries get `uc_<random>` / `grp_<random>`.

**Code.** `lib/use-case-overlay.ts` · `lib/use-case-transfer.ts` ·
`app/(app)/use-cases/taxonomy-actions.ts`.
**Tests.** `lib/use-case-overlay.test.ts` · `lib/use-case-transfer.test.ts` (the
replace-omitted path) · none on `resetTaxonomyAction`, which is a server action.

---

## R2a — A merged use case hands its accounts to its successor

**Status: Verified** (`lib/use-case-implementation.test.ts`, five cases).

**Definition.** Retiring A with `mergedInto: B` moves every account recorded against A into
B's adoption list. The stored `useCaseId` is **not** rewritten — resolution happens on read.

**Condition.** `groupImplementationsByUseCase(clients, overlay)` buckets each
implementation under `resolveThroughMerges(useCaseId, overlay)`. The overlay argument is
optional; without it, links bucket under their raw stored id.

**Exceptions.**
- A retirement **without** a merge target leaves the account on its own id — retired is not
  merged.
- A circular chain (A→B→A) terminates rather than spinning; the link survives wherever it
  lands. The winner of a cycle is not specified, and no rule says which end is correct.

**Callers.** `/use-cases` and `/use-cases/[id]` pass the overlay.
`resetTaxonomyAction` deliberately does **not** — it needs the raw ids accounts are
literally recorded against, so it can decide which rows to keep.

**Fixed in commit `7f731b7`.** `resolveThroughMerges` existed and was tested but had **no
production caller**, while the merge UI promised the behaviour. A merged-away use case
therefore dropped its accounts out of the directory entirely and the successor never
absorbed them.

**Code.** `lib/use-case-implementation.ts` → `groupImplementationsByUseCase`;
`lib/use-case-overlay.ts` → `resolveThroughMerges`.

---

## R3 — Five implementation statuses

`exploring` · `planning` · `live` · `paused` · `completed`.

| Status | Means |
|---|---|
| `exploring` | Discussed with the client, nothing committed |
| `planning` | Agreed in principle; scope and objective being defined |
| `live` | Running in the account |
| `paused` | Started and stopped — the reason belongs in Notes |
| `completed` | Finished. Kept for history |

**The rule behind the rule:** *"A maturity model nobody maintains collapses to whatever
each record was created as. These five are ones a CSM can answer without thinking, which is
the only kind that stays accurate."*

---

## R4 — Two status axes on a definition, one derived

| Axis | Values | Set how |
|---|---|---|
| **Lifecycle** | `active` · `archived` | Deliberately, by a person |
| **Review** | Needs review · Reviewed · Review overdue | **Derived** from `lastReviewedAt` |

Review status is derived precisely so it **cannot drift out of step with reality and nobody
has to maintain it**.

**Display rule:** an active, recently reviewed use case shows **no chip at all**. A chip
should mean "look at this"; if everything wears one, nothing does.

`Draft` was removed — it duplicated "Needs review".

**Code.** `lib/use-case-status.ts` + `use-case-status.test.ts` (**tested**).

---

## R5 — HubSpot values are aliased on read, never migrated

**Definition.** Live HubSpot `use_cases` values resolve to canonical ids **at read time**.

**Consequence.** No migration, nothing rewritten, and every historical value stays
resolvable.

**Exceptions.**
- **"Unclear" and "Other" were removed** from the taxonomy. They record that nobody wrote a
  use case down — a gap in the data, not a use case. They now resolve to nothing and
  surface as **unrecognised**, which states the same fact without pretending it is a
  category.
- **A value with real usage and no canonical home is not folded away.** Qiwa Disclosure
  appears on 8 deals — the second most-used value in the book — and is in none of the
  published 23. Mapping it to Compliance Training would erase a distinct regulatory
  obligation and make the discrepancy invisible. It is carried in `UNRESOLVED`, so it keeps
  working and stays visible as a taxonomy decision somebody has to make.

**Code.** `lib/use-cases.ts` + `use-cases.test.ts` (**tested**).

---

## R6 — A use case may belong to several categories

23 published use cases occupy **26 category slots**. 360° Feedback, Certification
Preparation and TNA each sit in two. Modelling one group per use case would lose the source
deck's own cross-references.

---

## R7 — Transfer matches by name, never by id

**Definition.** Export/import identifies a use case by its **name**, categories by
**label**, related use cases by **name**, and a merge target by **name**. **Nothing in the
file is an id.**

**Why.** Ids are generated per environment (`uc_<random>`). Exporting locally and importing
to production would make every entry arrive as a duplicate.

**Matching is forgiving, not clever.** Case-insensitive; surrounding and repeated
whitespace ignored. Nothing fuzzier — a near-match is a rename, and silently updating the
wrong definition is worse than reporting an unmatched name.

**Two modes.**

| Mode | Behaviour |
|---|---|
| `merge` *(default)* | A use case present locally but absent from the file is left exactly as it is |
| `replace` | Rebuild the overlay and library from the file. An omitted use case is **retired, not hard-deleted**, and its taxonomy row survives so accounts on it keep resolving (R2) — including one already retired, so a replace can never silently un-retire something |

`replace` starts from an **empty** overlay and an **empty** library. Anything that has to
survive — a retirement marker, the row it points at, a reused category id — is re-stated
explicitly by `planImport`. A definition the file omits is gone.

**`planImport()` is pure.** The preview the user approves and the write that follows are
computed by the same function from the same inputs. The preview states how many accounts
each retirement affects **before** anything is written, and the UI takes a typed
confirmation.

### Apply-time safety (commit `7f731b7`)

1. **The previewed removals are re-validated.** Apply re-plans against a freshly read
   overlay, so a use case added between preview and apply would otherwise be retired beyond
   anything the typed confirmation covered. `applyImportAction` compares the recomputed
   removal list against `expectedRemoved` and refuses on mismatch, naming what would
   *additionally* be retired. The parameter is optional, so an older client still applies —
   just without the check.
2. **Both `workspace_config` keys are written in one transaction**
   (`setWorkspaceConfigManyDb`, `lib/repo/drizzle.ts`). Taxonomy first, then the library:
   a definition keyed on an id whose use case does not exist yet is dropped by
   `mergeLibrary` on the next read. Before this, a failure on the second write left the
   taxonomy rewritten against a stale library.
3. **Duplicate names are reported.** A file naming the same use case twice keeps the first
   and lists the dropped names in the preview warnings, rather than silently lowering the
   "created" count.

**Code.** `lib/use-case-transfer.ts` + `use-case-transfer.test.ts` (**tested**) ·
`app/(app)/use-cases/transfer-actions.ts` (**untested** — server actions).

---

## R7a — `sourceUrl` is validated on read, not only on write

**Status: Verified** (`lib/use-case-implementation.test.ts`).

**Definition.** A use case's `sourceUrl` renders as a bare `<a href>` on the detail page for
every viewer. Only `http:` and `https:` values survive; anything else resolves to `null`.

**Condition.** `safeHttpUrl(v)` — `/^https?:\/\//i`, trimmed, truncated to 500 characters.
Deliberately a scheme check and nothing more: a value that is not plainly http(s) is
**dropped**, never sanitised into something else.

**Applied at three points**, so no write path can bypass it:

| Point | Code |
|---|---|
| On read of the stored library | `mergeLibrary()` in `lib/use-case-library.ts` |
| On transfer import | `parseTransferFile()` in `lib/use-case-transfer.ts` |
| At render | `components/reports/UseCaseDetail.tsx` |

**Why.** The section-edit action checked the scheme, but that is only one of the ways a
value gets in. An imported `javascript:` or `data:` value reached the same field without
passing through it and became a live href for every viewer — stored XSS. Fixed in
`7f731b7`; see [decision 0009](../decisions/0009-validate-outbound-urls-on-read-not-only-on-write.md).

---

## R8 — Associated ARR is not attribution

The ARR shown against a use case is the **sum of the ARR of accounts that have it
recorded**. An account with four use cases contributes its full ARR to all four.

**Rule:** never describe it as revenue attributed to a use case. See
[arr-and-revenue-movement R8](arr-and-revenue-movement.md#r8--associated-arr-is-not-revenue-attribution).

---

## R9 — Use cases feed health

`use_case_set` is a **binary** health metric: 100 if the account has use cases recorded,
0 if not. It is also Action-list signal input.

---

## R10 — Curating a definition and linking an account are different permissions

**Status: Partially verified** (every gate read at its call site; no permission tests
exist anywhere in Signal).

**Definition.** Deciding what a use case *means* is a taxonomy decision and is
admin-curated. Recording that *your* account is doing it is account work and follows the
account write gate.

| Action | Server gate | Call site |
|---|---|---|
| View definitions and adoption | Session only | `app/(app)/use-cases/page.tsx`, `…/[id]/page.tsx` |
| Create / edit / retire / restore a definition; add, rename or delete a category | `isAdminOrSuper()` | `guard()` in `app/(app)/use-cases/taxonomy-actions.ts` |
| Edit a definition section | `isAdminOrSuper()` | `app/(app)/use-cases/actions.ts` |
| Export the Universe | `isAdminOrSuper()` | `exportUseCaseUniverseAction` |
| **Preview** an import | `isAdminOrSuper()` | `previewImportAction` — reading a plan harms nothing |
| **Apply** an import | `isAdminOrSuper()` | `applyImportAction` |
| **Reset the whole database** | `isAdminOrSuper()` | `resetTaxonomyAction` — via `guard()` |
| Link a use case to an account, edit or remove the implementation | `denyClientWrite(clientId)` | `app/(app)/clients/[id]/use-case-implementation-actions.ts` |

**The gate does not move with the surface.** Linking from the Use Case Universe directory
and linking from the client profile both call `saveImplementationAction`, so both are
checked by `denyClientWrite`. A CSM can put a use case on their own account without being
able to rewrite what it means for everyone. Conversely, an admin who has been narrowed by
`app_users.scope` cannot link a use case to an account outside that scope, even though they
may edit the definition.

**A second guard on linking.** `saveImplementationAction` re-reads the taxonomy and rejects
a `useCaseId` that does not exist. It checks with `includeRetired = true`, so a **retired**
use case is still an acceptable target — deliberately, since an existing implementation on
a retired id must remain editable. No UI offers one: the directory and the profile picker
both list live entries only. One implementation per (account, use case); a second is
refused rather than splitting the objective across two records.

**Every Universe write is one gate — `isAdminOrSuper`.** The destructive paths are not
narrowed to super-admin, deliberately: curating the taxonomy is the Admin's job, and the
safety on a replace or a reset is procedural (preview, typed confirmation, automatic
backup, removal re-validation) plus the orphan-preserving behaviour in R2. See
[permissions-and-scoping R11](permissions-and-scoping.md#r11--destructive-use-case-universe-actions-stay-admin-by-product-decision).

---

## Known inconsistencies

1. **Two unlinked taxonomies** — `lib/use-cases.ts` (shipped 23 + 3 unresolved) and
   `lib/use-case-overlay.ts` (admin-curated, `workspace_config`). The **code** intends
   disjoint id spaces; the **live data** does not have them (see
   [use-case-universe §2](../product/use-case-universe/README.md)). An entry created in one
   is still invisible to the other, and **which is canonical is unanswerable from the
   code**. See
   [contradictions](../known-limitations/contradictions.md#two-use-case-taxonomies).
2. **Unresolved HubSpot values** are visible and unresolved — an open decision, correctly
   surfaced rather than hidden.
3. **`delivers` holds imported content that is never rendered.**
4. **The destructive paths have no browser verification.** `replace` import, apply-time
   re-validation and `resetTaxonomyAction` are covered by unit tests over `planImport` and
   by reading the server actions. Nobody has run them against a real workspace through the
   UI.
5. **`resetTaxonomyAction` and the transfer actions are untested** as server actions. The
   pure functions underneath them are tested; the guards, the transaction and the
   revalidation are not.
6. **A circular merge chain has no defined winner.** `resolveThroughMerges` terminates and
   the link survives, but which id it lands on is an artefact of iteration order, not a
   rule.

## Open questions

- Which taxonomy is canonical?
- Should R1's invariants be pinned by tests? They are currently protected only by code
  structure. R2 and R2a now are.
- Should a circular merge chain be rejected at write time rather than tolerated at read
  time?

## Source references

`lib/use-cases.ts` · `lib/use-case-overlay.ts` · `lib/use-case-library.ts` ·
`lib/use-case-status.ts` · `lib/use-case-implementation.ts` · `lib/use-case-transfer.ts` ·
`app/(app)/use-cases/taxonomy-actions.ts` · `app/(app)/use-cases/transfer-actions.ts` ·
`app/(app)/clients/[id]/use-case-implementation-actions.ts` ·
`lib/use-cases.test.ts` · `lib/use-case-overlay.test.ts` · `lib/use-case-status.test.ts` ·
`lib/use-case-transfer.test.ts` · `lib/use-case-implementation.test.ts`
