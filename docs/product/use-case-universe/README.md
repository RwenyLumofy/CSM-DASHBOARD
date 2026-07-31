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
| Ids | Canonical slugs (`talent_strategy_activation`, …) | `newUseCaseId()` mints `uc_<random>`, but **most ids actually stored are the same canonical slugs** — see below |
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

**Status: Partially verified.** The *mechanism* below is verifiable from the repository.
The *count* is a database observation and cannot be reproduced from the code.

`newUseCaseId()` generates `uc_<random>`, so this document previously recorded the two id
spaces as disjoint. **They are not.** The live `use_case_taxonomy` is keyed largely by the
same canonical slugs `lib/use-cases.ts` uses — `certification_prep`, `employee_onboarding`,
`competency_framework` and so on.

**Why, and this is the part the code proves.** The overlay used to be a *delta layered on
top of the code-shipped list*, not a database. At commit `4214349`
`lib/use-case-overlay.ts` imported `USE_CASES` and said so in its header: *"the code list
is a SEED, and everything the team does is recorded as a delta in `workspace_config`"* —
`renamed[id]` overrode a shipped entry, `added[id]` held team-created ones, `retired[id]`
took entries out of the picker. Definitions written by the team were therefore keyed on
**shipped ids**, i.e. canonical slugs.

Commit `7f731b7` rewrote the overlay as a flat, preset-free database: no seed, no
`renamed`, `resolveTaxonomy` emitting only from `added`. That left every definition keyed
on a shipped id with no taxonomy row to attach to.
[`scripts/restore-orphaned-use-cases.mjs`](../../../scripts/restore-orphaned-use-cases.mjs)
promotes each of those into a real `added` row **reusing the same id**, precisely so the
definition stays attached and any account association recorded against that id keeps
resolving. The canonical slugs in `workspace_config` are the fossil of the old delta model.

So the overlap is a property of the *data*, inherited, not a guarantee of the *code*:
anything created through **Add use case** from now on gets `uc_<random>`, so the overlap
erodes from here. `29` live entries were counted by reading
`workspace_config.use_case_taxonomy` directly; that figure is **not verifiable from this
repository** and will change.

It is recorded because one thing already depends on it —
[`scripts/backfill-use-case-implementations.mjs`](../../../scripts/backfill-use-case-implementations.mjs)
resolves HubSpot deal values through `lib/use-cases.ts` aliases and then looks the result up
in the taxonomy. That only works while the slugs coincide, and the script checks each
resolved id against the live taxonomy rather than assuming it (skipping, and reporting,
anything that misses). **A workspace whose Universe was built through the UI rather than
inherited from the delta model would resolve nothing and the backfill would be a no-op** —
correctly, and visibly.

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

**`sourceUrl` is validated on read, not only on write.** It renders as a bare `<a href>` on
the detail page for every viewer, so a stored `javascript:` or `data:` value is stored XSS.
`safeHttpUrl()` in `lib/use-case-library.ts` accepts only `http`/`https` and is applied at
three points — on read of the stored library (`mergeLibrary`), on transfer import
(`parseTransferFile`), and at render (`UseCaseDetail`) — so no write path can bypass it.
Anything else resolves to `null` and no link renders. Added in commit `7f731b7`;
**tested** in `lib/use-case-implementation.test.ts`. See
[decision 0009](../../decisions/0009-validate-outbound-urls-on-read-not-only-on-write.md).

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

### Retire, never orphan
A use case is **retired**, not deleted, because the profile's associate feature records an
account's implementation against a use-case id — deleting the id would silently orphan that
record. Retiring removes it from the active picker while the id keeps resolving to a
**named** entry, so the account's profile and `/use-cases/[id]` still work. It can be
restored.

The trap, and the reason this was broken on three paths until commit `7f731b7`:
`resolveTaxonomy` emits **only** from `overlay.added`. Writing the `retired` marker without
keeping the `added` row is a hard delete as far as the application is concerned. Both the
`replace` import and the database reset now keep the row. Merged use cases hand their
accounts to the successor. Full rule and code paths:
[use-case-associations R2 / R2a](../../business-rules/use-case-associations.md#r2--retire-never-orphan).

**Categories may be deleted outright** — `TaxonomyManager` refuses to delete one while any
use case, live or retired, still lists it, so a delete that succeeds is genuinely empty.

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

`lib/use-case-transfer.ts` — **tested** (`lib/use-case-transfer.test.ts`).

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

### Apply-time safety (commit `7f731b7`)

Three problems in the apply path were closed:

1. **The taxonomy could be rewritten against a stale library.** The two `workspace_config`
   keys were written as separate statements; a failure on the second reported failure while
   the first had already landed — and in `replace` mode the taxonomy rewrite has retired
   things by then. Both keys now go through `setWorkspaceConfigManyDb` in **one
   transaction**, taxonomy first.
2. **The typed confirmation could be outrun.** Apply re-plans against a freshly read
   overlay, so a use case someone added between preview and apply would be retired beyond
   what was confirmed. Apply now compares the recomputed removal list against the previewed
   one and refuses on mismatch, naming what would additionally be retired.
3. **`sourceUrl` was only scheme-checked on the section-edit path**, so an imported
   `javascript:` value became a live href for every viewer of the detail page. See §3.

A file that names the same use case twice keeps the first and **reports** the dropped
names, rather than silently lowering the "created" count.

### What a `replace` still costs

Retiring is not free. The entry keeps its id, name, summary and categories, but its
**written definition is cleared** — customer problem, desired outcome, capabilities, success
indicators, everything — because the library is rebuilt from the file alone. That loss is
real and has no undo other than the automatic backup.

Before a `replace` writes anything, `UseCaseTransfer` exports the current Universe and
downloads it as `use-case-universe-BACKUP-before-replace-<date>.json`. **If the backup
cannot be produced, the import is refused** rather than proceeding. The confirmation is the
exact case-sensitive phrase `DELETE YES I AM SURE`; the button stays disabled until it is
typed, and it is red rather than blue.

### Resetting the database

`resetTaxonomyAction` clears both keys the Universe owns. There is no shipped baseline to
reset *to*, so this is a genuine wipe — with one exception, which is the whole point:
**any id an account is still recorded against keeps its taxonomy row** (and its categories),
marked retired, so the association keeps resolving. The definitions go regardless. Super
Admin only.

---

## 6. Permissions

**Status: Partially verified** — every gate below was read at its call site; Signal has no
permission tests.

| Action | Server gate |
|---|---|
| View definitions and adoption | Session only |
| Create / edit / retire / restore a definition; add, rename, delete a category | `isAdminOrSuper()` — `guard()` in `taxonomy-actions.ts` |
| Edit a definition section | `isAdminOrSuper()` — `actions.ts` |
| Export the Universe | `isAdminOrSuper()` |
| **Preview** an import | `isAdminOrSuper()` |
| **Apply** an import (`merge` or `replace`) | `isAdminOrSuper()` |
| **Reset** the whole database | `isAdminOrSuper()` — `guard()` |
| Link a use case to an account; edit or remove the implementation | `denyClientWrite(clientId)` |

**One gate for every Universe write, including the destructive ones.** Commit `7f731b7`
briefly narrowed apply and reset to `isSuperAdmin`; `498db1f` reverted that by product
decision — curating the taxonomy is the Admin's job, and importing or resetting it is part
of curating it. The protection on those paths is procedural rather than role-based: preview
before apply, a typed confirmation naming how many accounts each retirement costs, an
automatic backup export before a replace (the import is abandoned if the backup fails), and
apply-time re-validation of the previewed removals. See
[permissions-and-scoping R11](../../business-rules/permissions-and-scoping.md#r11--destructive-use-case-universe-actions-stay-admin-by-product-decision).

**The account-linking gate does not move with the surface.** Linking from the directory's
per-card menu and linking from the client profile both call `saveImplementationAction` and
are both checked by `denyClientWrite`. The directory's client list is itself role-scoped by
`getClients()`, so a CSM only sees — and can only link — their own book; the action
re-checks per client regardless.

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
| Client implementations | `lib/use-case-implementation.ts` + `lib/use-case-implementation.test.ts` |
| Transfer | `lib/use-case-transfer.ts` + `lib/use-case-transfer.test.ts` |
| Pages | `app/(app)/use-cases/page.tsx`, `app/(app)/use-cases/[id]/page.tsx`, `app/(app)/use-cases/write/page.tsx` |
| Actions | `app/(app)/use-cases/actions.ts`, `app/(app)/use-cases/taxonomy-actions.ts`, `app/(app)/use-cases/transfer-actions.ts` |
| UI | `components/reports/UseCaseDirectory.tsx`, `UseCaseDetail.tsx`, `UseCaseTransfer.tsx`, `UseCaseWriter.tsx`, `TaxonomyManager.tsx` |
| Profile side | `components/clients/UseCasePortfolio.tsx`, `components/clients/AccountUseCases.tsx`, `app/(app)/clients/[id]/use-case-actions.ts`, `app/(app)/clients/[id]/use-case-implementation-actions.ts` |
| Scripts | `scripts/load-use-case-definition-library.mjs` (definition loader) · `scripts/restore-orphaned-use-cases.mjs` (one-off repair) · `scripts/backfill-use-case-implementations.mjs` (adoption backfill) |

**Deleted in commit `7f731b7`** — `UseCaseWorkbench.tsx`, `UseCaseLibrary.tsx` and
`UseCaseAccounts.tsx` under `components/reports/`, and the `use-case-adoption` module under
`lib/`. Any document or comment still naming them is stale.

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
6. **The destructive paths have never been exercised in a browser.** `replace` import,
   apply-time re-validation and the database reset are covered by unit tests over
   `planImport` and by reading the server actions. The guards, the transaction and the
   revalidation have no test and no manual run against a real workspace.
7. **Adoption is only as good as the implementation records.** A card reads "No clients yet"
   for a use case that accounts genuinely run but nobody has recorded. The backfill
   (`scripts/backfill-use-case-implementations.mjs`) closes most of that gap — **it has
   been run against the clone database only, not production.**
8. **The industry concentration read-out** ("3 of 4 are Financial Institutions") renders
   only at two or more accounts and has not been exercised against real data.
9. **Two module headers are now stale** and describe boundaries the code no longer has —
   see [contradictions](../../known-limitations/contradictions.md#use-case-module-headers-describe-gates-and-boundaries-the-code-no-longer-has).

## 12. Open questions

- Which taxonomy is canonical? Until answered, every downstream document must hedge.
- Should Qiwa Disclosure become a 24th published use case?
- Is `delivers` intended to return to the UI, or should it be exported and dropped?
- Should a circular merge chain be rejected when it is written, rather than tolerated when
  it is read?
- Does an Admin losing import-apply and reset (§6) match the intended operating model, or
  should there be a middle tier?

**Answered since the baseline:** the server-side gates on definition editing and on a
destructive transfer replace are enumerated in §6.

## Source references

`lib/use-cases.ts` · `lib/use-case-overlay.ts` · `lib/use-case-library.ts` ·
`lib/use-case-status.ts` · `lib/use-case-implementation.ts` · `lib/use-case-transfer.ts` ·
their five test files · `app/(app)/use-cases/page.tsx` ·
`app/(app)/use-cases/taxonomy-actions.ts` · `app/(app)/use-cases/transfer-actions.ts` ·
`app/(app)/clients/[id]/use-case-implementation-actions.ts` ·
`components/reports/UseCaseDirectory.tsx` · `components/reports/UseCaseDetail.tsx`

---

**Documentation status:** Partially verified — the five tested modules are `Verified`;
page-level behaviour and permissions are read-only-verified, with no tests
**Last verified:** 2026-07-31 · **Commit:** `15329e3` · **Owner:** Unassigned
