# Use Case Universe

**Status:** Partially verified · **Contains a `Contradictory` section — see §2**

## Summary

The organisation-level library of use-case definitions — what Lumofy's customers are trying
to achieve — and the accounts associated with each. Separate from, and never overwritten
by, the way any individual account applies a use case.

## Purpose

Two questions, one place: *"what does this use case actually mean, and how do we describe
it consistently"* (the definition), and *"which accounts are doing it"* (the associations).
Without it, use cases lived only as a HubSpot picklist that had drifted from the published
taxonomy.

## Intended users

Product and CS leadership author and review definitions. CSMs read them and associate them
to accounts. Support, Implementation and Revenue read them.

## Entry points

- **Route:** `/use-cases` (directory), `/use-cases/[id]` (detail),
  `/use-cases/write` (writer)
- **Navigation path:** Sidebar → Use Case Universe
- **Links in from:** the Client Profile's use-case section.

## Information architecture

1. **Directory** — the library list (`components/reports/UseCaseDirectory.tsx`, commit
   `7f731b7`). A compact header, a persistent left rail of checkbox filters (Category,
   Product, Adoption) and a card grid. Each card carries the accounts running that use
   case — initials, count and the ARR behind it — so "who has this" is answerable without
   opening anything. Default order is most-adopted, not alphabetical. Replaced
   `UseCaseWorkbench.tsx`, which was deleted in the same commit.
2. **Detail** — single column, no right rail (commit `076faeb`). Opened in a drawer from
   the directory, or on its own route. Editing is section-level: each block owns its
   Edit/Save/Cancel and sends only its own fields, so two people editing different sections
   do not collide (`components/reports/UseCaseDetail.tsx`).
3. **Taxonomy manager** — categories and use cases, admin-curated.
4. **Transfer** — export/import the Universe as JSON.
5. **Account linking** — a use case can be put on an account from the directory's per-card
   menu as well as from the client profile. Both call the same
   `saveImplementationAction`, so there is one record and one permission check
   (`denyClientWrite`, not the admin gate that guards definitions).

---

## 2. The two-taxonomy contradiction

**Status: Contradictory.** Signal contains two use-case taxonomies that are *deliberately
unlinked and share no ids*.

| | `lib/use-cases.ts` | `lib/use-case-overlay.ts` |
|---|---|---|
| What | The published "Lumofy Use Cases by Category" — 23 use cases across 6 categories, shipped in code | An admin-curated database stored in `workspace_config.use_case_taxonomy` |
| Ships with content | Yes, hardcoded | **No** — a fresh workspace has zero categories and zero use cases |
| Ids | Canonical slugs (`talent_strategy_activation`, …) | `newUseCaseId()` mints `uc_<random>`, but **the ids actually stored are the same canonical slugs** — see below |
| Used by | The account-level "confirmed vs declared" picker | The Use Case Universe pages and the profile's associate feature |
| Tested | Yes (`lib/use-cases.test.ts`) | Yes (`lib/use-case-overlay.test.ts`) |

The overlay's header states this explicitly: *"THIS MODULE IS DELIBERATELY UNLINKED …
A use case created here is invisible to that picker, and vice versa. This was coupled once,
by mistake, and un-coupling it is the reason this file no longer imports anything from
`lib/use-cases.ts`."*

So the uncoupling was a deliberate fix, but **which taxonomy is canonical long-term is not
answerable from the code.** Two pickers exist and a use case in one is invisible in the
other. Tracked in
[contradictions](../../known-limitations/contradictions.md#two-use-case-taxonomies).

### The ids overlap in practice, even though the code does not

`newUseCaseId()` generates `uc_<random>`, so this document previously recorded the two id
spaces as disjoint. **They are not.** Every one of the 29 entries in the live
`use_case_taxonomy` is keyed by the same canonical slug `lib/use-cases.ts` uses —
`certification_prep`, `employee_onboarding`, `competency_framework` and so on — because the
library was imported from the same published source rather than created one at a time
through **Add use case**. Verified by reading `workspace_config.use_case_taxonomy` directly
and comparing its keys against `USE_CASES`.

This is a property of the *data*, not a guarantee of the *code*: anything created through
the UI from now on gets a random id, so the overlap will erode. It is recorded because one
thing already depends on it —
[`scripts/backfill-use-case-implementations.mjs`](../../../scripts/backfill-use-case-implementations.mjs)
resolves HubSpot deal values through `lib/use-cases.ts` aliases and then looks the result up
in the taxonomy. That only works while the slugs coincide, and the script checks each
resolved id against the live taxonomy rather than assuming it (skipping, and reporting,
anything that misses).

### What `lib/use-cases.ts` gets right (worth preserving in any resolution)

- A use case can belong to **several** categories — 26 category slots over 23 use cases.
- Live HubSpot values are **aliased onto canonical ids on read**. No migration, nothing
  rewritten, every historical value stays resolvable.
- **"Unclear" and "Other" were removed.** Neither names something a client is trying to
  achieve; they record that nobody wrote one down. They now resolve to nothing and surface
  as unrecognised.
- **A value with real usage and no canonical home is not silently folded away.** Qiwa
  Disclosure appears on 8 deals — the second most-used value in the book — and is in none
  of the published 23. It is carried in `UNRESOLVED` so it keeps working and stays visible
  as a decision somebody has to make.

---

## 3. Definitions

### Fields
`lib/use-case-library.ts` owns what is recorded. The field set is deliberately small —
enough to define a use case consistently, find it, and attach it to an account. No delivery
blueprint, no evidence repository, no maturity model.

Two fields carry the weight:

| Field | Meaning |
|---|---|
| `customerProblem` | What is wrong at the client, in prose — one paragraph, not inferred from quotes |
| `desiredOutcome` | What "working" looks like. Its absence was why the page read as a feature list |

Plus: products (`Foundation`, `Perform`, `Develop`, `Engage`, `Analyze` — the first and
last are library-only; the middle three match HubSpot's deal `products` picklist),
capabilities (each with the role it plays *for this specific use case* — the second half is
the point), related use cases, and stakeholder roles.

`delivers` is retained but **no longer rendered**. It holds the Deliverables column
imported from the written Notion pages; dropping the field would destroy real content for a
layout change.

Delivery descriptors (advisory services, Authoring, reporting, integrations, custom
content) are deliberately **not** products — they are *how* the work is done, and the
capability list already says so.

### Status model
`lib/use-case-status.ts` — **tested**.

| Axis | Values | Set how |
|---|---|---|
| **Lifecycle** | `active` · `archived` | Deliberately, by a person |
| **Review** | Needs review · Reviewed · Review overdue | **Derived** from `lastReviewedAt` |

"Draft" was removed: it was a hedge from when the library shipped empty. Every page read
"Draft · Needs review" — two labels for one fact, which trains people to ignore both.

**An active, recently reviewed use case shows no chip at all.** A chip should mean "look at
this"; if everything wears one, nothing does.

### Retire, never delete
A use case is **retired**, not deleted, because the profile's associate feature records an
account's implementation against a use-case id — deleting the id would silently orphan that
record. Retiring keeps the id resolving (via `resolveThroughMerges`) and removes it from
the active picker; it can be restored.

**Categories may be deleted outright** — `TaxonomyManager` refuses to delete one while any
live use case still lists it, so a delete that succeeds is genuinely empty.

**Ids are never reused.**

---

## 4. Client implementations — the account side

`lib/use-case-implementation.ts`, storage key `use_case_implementations` on
`clients.properties`.

**The distinction the page previously collapsed:** a definition is reusable and lives once;
an implementation is one client's version and lives per account.

**Stored on the client, not on the use case**, for three stated reasons: it is account data
and inherits the account's permission scope for free; the atomic JSONB array helpers
already exist for `clients.properties`; and a retired use case must not take a client's
recorded objective with it.

### Implementation statuses — five, not ten

| Status | Meaning |
|---|---|
| `exploring` | Discussed with the client, nothing committed |
| `planning` | Agreed in principle; scope and objective being defined |
| `live` | Running in the account |
| `paused` | Started and stopped — the reason belongs in Notes |
| `completed` | Finished. Kept for history |

*"A maturity model nobody maintains collapses to whatever each record was created as. These
five are ones a CSM can answer without thinking, which is the only kind that stays
accurate."*

An implementation may carry a linked project/mission id when one exists.

### The invariants — enforce and test these

1. Editing a client's implementation **never** alters the canonical definition.
2. Editing the canonical definition **never** overwrites client-specific data.
3. The Universe shows definitions and their associated accounts.
4. The Client Profile explains how the selected use cases apply to *that* client.

---

## 5. Transfer — moving the Universe between environments

`lib/use-case-transfer.ts` (419 lines) — **tested** (`lib/use-case-transfer.test.ts`).

**Matched by name, never by id.** Ids are generated per environment; exporting locally and
importing to production would make every entry arrive as a duplicate. So a use case is
identified by its **name**, categories by **label**, related use cases by **name**, and a
merge target by **name**. Nothing in the file is an id.

**Matching is forgiving, not clever.** Case-insensitive; surrounding and repeated
whitespace ignored. Nothing fuzzier — a near-match is a rename, and silently updating the
wrong definition is worse than reporting an unmatched name.

### Two modes

| Mode | Behaviour |
|---|---|
| `merge` *(default)* | A use case present here but absent from the file is left exactly as it is. "Apply these definitions." |
| `replace` | Rebuild the overlay and library **from the file**. An omitted use case disappears from the picker — but is **retired, not hard-deleted**, including one that was already retired, so a replace can never silently un-retire something. |

`planImport()` is **pure**: the preview the user approves and the write that follows are
computed by the same function from the same inputs. The preview states how many accounts
each retirement affects **before** anything is written, and the UI takes a typed
confirmation.

A newer capability, "delete everything and re-import", was added in the current HEAD commit
(`4214349`) — **its behaviour has not been verified in this baseline.**

---

## 6. Permissions

- **View definitions:** everyone.
- **Create / edit / retire definitions, manage categories:** Admin and Super Admin via the
  Universe pages. *Not separately verified for operator restriction — see Open questions.*
- **Associate a use case to an account, record an implementation:** the client write gate —
  operators on their own accounts, not Guests.
- **Export / import the Universe:** a destructive replace takes a typed confirmation. The
  server-side role gate on transfer actions was **not verified in this pass**.

## 7. Business rules

See [use-case-associations](../../business-rules/use-case-associations.md).

## 8. Data model

- Definitions and categories: `workspace_config.use_case_taxonomy` (overlay) plus the
  definition library.
- Account associations: `client_deals.use_cases` (JSONB `string[]`, HubSpot-sourced) and
  `clients.properties.use_case_implementations` (authored in Signal).
- The shipped taxonomy: code, `lib/use-cases.ts`.

## 9. Technical implementation

| Concern | File |
|---|---|
| Shipped taxonomy | `lib/use-cases.ts` + `lib/use-cases.test.ts` |
| Admin overlay | `lib/use-case-overlay.ts` + `lib/use-case-overlay.test.ts` |
| Definition fields | `lib/use-case-library.ts` |
| Status model | `lib/use-case-status.ts` + `lib/use-case-status.test.ts` |
| Client implementations | `lib/use-case-implementation.ts` |
| Transfer | `lib/use-case-transfer.ts` + `lib/use-case-transfer.test.ts` |
| Pages | `app/(app)/use-cases/{page,write/page,[id]/page}.tsx` |
| Actions | `app/(app)/use-cases/{actions,taxonomy-actions,transfer-actions}.ts` |
| UI | `components/reports/UseCase{Workbench,Detail,Directory,Transfer,Writer}.tsx`, `TaxonomyManager.tsx` |
| Profile side | `components/clients/{AccountUseCases,UseCasePortfolio}.tsx`, `app/(app)/clients/[id]/use-case-*.ts` |
| Loader script | `scripts/load-use-case-definition-library.mjs` |

## 10. Analytics and observability

None. No events on definition creation, review, or association.

## 11. Known limitations

1. **Two unlinked taxonomies** (§2).
2. **"Associated ARR" is not attribution.** It is the sum of the ARR of accounts that have
   the use case recorded — an account with four use cases contributes its full ARR to all
   four. Do not present it as revenue attributed to a use case.
3. **`delivers` holds content that is never displayed.**
4. **Unresolved HubSpot values** (Qiwa Disclosure and others) are visible but unresolved —
   an open taxonomy decision.
5. **The Universe has no review workflow** beyond the derived review status — nothing
   assigns a reviewer or a due date.
6. The current HEAD commit's "delete everything and re-import" path is unverified.

## 12. Open questions

- Which taxonomy is canonical? Until answered, every downstream document must hedge.
- What is the server-side role gate on definition editing and on a destructive transfer
  replace?
- Should Qiwa Disclosure become a 24th published use case?
- Is `delivers` intended to return to the UI, or should it be exported and dropped?

## Source references

`lib/use-cases.ts` · `lib/use-case-overlay.ts` · `lib/use-case-library.ts` ·
`lib/use-case-status.ts` · `lib/use-case-implementation.ts` · `lib/use-case-transfer.ts` ·
their four test files · `app/(app)/use-cases/*` · `components/reports/UseCase*.tsx`

---

**Documentation status:** Partially verified — the four tested modules are `Verified`;
page-level behaviour and permissions are not
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
