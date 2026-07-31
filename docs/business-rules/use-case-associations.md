# Business rule — Use-case associations and lifecycle

**Status:** Partially verified — four modules are **tested**; page-level behaviour is not
**Last verified:** 2026-07-31 · **Commit:** `4214349`

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

**Code.** `lib/use-case-implementation.ts`. **Tests.** None on the implementation module
itself.

---

## R2 — Retire, never delete

**Definition.** A use case is **retired**, not deleted.

**Why.** An account's implementation record points at a use-case id. A hard delete would
silently orphan it.

**Behaviour.** Retiring keeps the id resolving (through `resolveThroughMerges` for the
merge case) and removes it from the active picker. It can be restored later.

**Exception — categories.** A category **may** be deleted outright, because
`TaxonomyManager` refuses to delete one while any live use case still lists it. A delete
that succeeds is therefore genuinely empty.

**Ids are never reused.** New entries get `uc_<random>` / `grp_<random>`.

**Code.** `lib/use-case-overlay.ts` + `use-case-overlay.test.ts`.

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
| `replace` | Rebuild from the file. An omitted use case is **retired, not hard-deleted** — including one already retired, so a replace can never silently un-retire something |

**`planImport()` is pure.** The preview the user approves and the write that follows are
computed by the same function from the same inputs. The preview states how many accounts
each retirement affects **before** anything is written, and the UI takes a typed
confirmation.

**Code.** `lib/use-case-transfer.ts` + `use-case-transfer.test.ts` (**tested**).

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

## Known inconsistencies

1. **Two unlinked taxonomies** — `lib/use-cases.ts` (shipped 23) and
   `lib/use-case-overlay.ts` (admin-curated, workspace_config). They share no ids; an entry
   in one is invisible to the other. The uncoupling was a deliberate fix for an accidental
   coupling, but **which is canonical is unanswerable from the code**. See
   [contradictions](../known-limitations/contradictions.md#two-use-case-taxonomies).
2. **Unresolved HubSpot values** are visible and unresolved — an open decision, correctly
   surfaced rather than hidden.
3. **`delivers` holds imported content that is never rendered.**
4. **The "delete everything and re-import" path** added in commit `4214349` is unverified.
5. **No test** on `lib/use-case-implementation.ts`, the module holding the account-side
   invariants (R1) — the most important rules in this family.

## Open questions

- Which taxonomy is canonical?
- Should R1's invariants be pinned by tests? They are currently protected only by code
  structure.

## Source references

`lib/use-cases.ts` · `lib/use-case-overlay.ts` · `lib/use-case-library.ts` ·
`lib/use-case-status.ts` · `lib/use-case-implementation.ts` · `lib/use-case-transfer.ts` ·
`lib/use-cases.test.ts` · `lib/use-case-overlay.test.ts` · `lib/use-case-status.test.ts` ·
`lib/use-case-transfer.test.ts`
