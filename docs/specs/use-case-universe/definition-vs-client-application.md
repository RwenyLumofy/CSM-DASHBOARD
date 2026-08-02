# Feature brief — a client's use-case application is a governed record, not a checkbox

> **Level 2.** Written by `signal-product-manager`. Describes **intended** behaviour.
> Not product documentation. Do not cite as evidence of what Signal does today.

**Status:** Proposed
**Date:** 2026-08-01
**Product area:** Use Case Universe · Client Profile
**Author:** `signal-product-manager` (agent validation run)
**Verified against commit:** `4ec0810`

## Product judgement

**Proceed with changes.** The canonical/client split is the strongest piece of product
modelling in Signal — decision `0001` is real, the two records live in different stores,
carry different permission gates, and survive retirement independently. Nothing about the
model needs redesigning. What needs fixing is that the *client application* record is
currently created empty from two surfaces, has no field for the outcome it is supposed to
measure, and shares a tab with a second, unrelated "Use case" list from HubSpot. The model
is right; the record it produces is not yet worth reading. Close that gap before adding
anything to either surface.

## Problem

- **Who has it:** CSMs recording what a client is doing with a use case; CS Managers and
  Revenue trying to read adoption as evidence.
- **When it occurs:** at association time — the moment a use case is linked to an account
  from either the Universe directory or the Client Profile.
- **What they do today:** toggle a checkbox. Both surfaces then create a record with an id,
  a `useCaseId`, and status `exploring`
  ([`UseCaseDirectory.tsx:481`](../../../components/reports/UseCaseDirectory.tsx),
  [`UseCasePortfolio.tsx:291`](../../../components/clients/UseCasePortfolio.tsx)). Objective
  and scope are empty. Filling them is a separate, optional, second action.
- **Why that is insufficient:** `implementationGaps()` immediately classifies every such
  record as *"no objective, scope not defined"*
  ([`lib/use-case-implementation.ts:154`](../../../lib/use-case-implementation.ts)) — and
  nothing anywhere acts on that verdict. The result is an adoption count that looks like
  evidence and is only a checkbox. The Universe orders its card grid by adoption
  ([`PRODUCT_MAP.md §4`](../../PRODUCT_MAP.md)) and `use_case_set` feeds health as a binary
  metric ([business rule R9](../../business-rules/use-case-associations.md)) — so an empty
  association already moves a health score and a directory ranking.
- **Operational consequence:** a CSM cannot answer "what is this client actually trying to
  achieve?" from Signal. A manager cannot distinguish a live programme from a checkbox.
- **Commercial consequence:** associated ARR is already not attribution
  ([R8](../../business-rules/use-case-associations.md)); built on empty associations it is
  not even association of anything meaningful.
- **Evidence available:** the implementation, five tested modules, and eleven decision
  records.
- **Evidence still missing:** how many existing implementation records have an objective. A
  one-off count over `clients.properties.use_case_implementations` would settle the size of
  this problem in minutes and should run before the foundation scope is fixed.

## Product outcome

A CSM can record what one client is doing with one use case — the objective, who it is for,
who owns it, what stage it is at and how success will be judged — and a manager or Revenue
reader can tell, at a glance and across the portfolio, which associations are real
programmes and which are only recorded intent.

## Current state

**The model is correctly represented.** Verified end to end:

| Concept | Where it lives | Gate |
|---|---|---|
| `UseCaseDefinition` (canonical) | `workspace_config.use_case_taxonomy` + `use_case_library` | `isAdminOrSuper()` |
| `ClientUseCase` (application) | `clients.properties.use_case_implementations` | `denyClientWrite(clientId)` |

- The two never write to each other's store. Editing an objective cannot touch canonical
  wording; editing a definition cannot overwrite client data
  ([R1](../../business-rules/use-case-associations.md)).
- The gate does not move with the surface — linking from the Universe and linking from the
  profile both call `saveImplementationAction`, both checked by `denyClientWrite`
  ([`use-case-implementation-actions.ts:64`](../../../app/%28app%29/clients/%5Bid%5D/use-case-implementation-actions.ts)).
  A CSM can record their own account's use case without being able to redefine what it means
  for everyone. **This is exactly right and must not regress.**
- One implementation per (account, use case), refused rather than split
  ([`use-case-implementation-actions.ts:83`](../../../app/%28app%29/clients/%5Bid%5D/use-case-implementation-actions.ts)).
- Retirement keeps the taxonomy row so a client's record stays readable
  ([R2](../../business-rules/use-case-associations.md), decision `0008`); a merge rebuckets
  accounts on read without rewriting stored ids
  ([R2a](../../business-rules/use-case-associations.md)).

**Five things contradict or fall short of the stated model.**

**C1 — A module header states the opposite of what the code does.**
[`UseCasePortfolio.tsx:5-7`](../../../components/clients/UseCasePortfolio.tsx) says *"The
Universe is a pure, preset-free database of definitions with no accounts awareness at all;
account linkage lives only here, on the client page."* Both halves are false:
`app/(app)/use-cases/page.tsx:53` and `app/(app)/use-cases/[id]/page.tsx:54` read adoption
via `groupImplementationsByUseCase`, and
[`UseCaseDirectory.tsx:481`](../../../components/reports/UseCaseDirectory.tsx) **writes**
associations. This repository treats module headers as decision evidence
([CLAUDE.md](../../../CLAUDE.md)) — a false one is worse than none.

**C2 — Two different "use case" concepts sit on the same tab.**
The General information tab renders `UseCasePortfolio`, headed **"Use cases"**
([`ClientProfileTabs.tsx:261`](../../../components/clients/ClientProfileTabs.tsx),
`UseCasePortfolio.tsx:325`), and — further down the same tab, inside the deal card — the
HubSpot-synced multi-select labelled **"Use case"**
([`ClientProfileTabs.tsx:349`, rendered `:3238`](../../../components/clients/ClientProfileTabs.tsx)).
They draw on the two unlinked taxonomies of decision `0006`. `UseCasePortfolio.tsx:9` claims
to be *"THE ONLY 'use cases' BLOCK ON THIS PAGE"*; it removed the component, not the concept.
A CSM sees two lists, differing by one character in their labels, that can disagree, with no
stated relationship between them.

**C3 — "Success measures" does not exist.** The record carries `objective`, `scope`,
`csmEmail`, `clientOwner`, `targetDate`, `nextStep`, `missionId`, `notes`
([`lib/use-case-implementation.ts:52-74`](../../../lib/use-case-implementation.ts)). There is
no success measure, no baseline, and no outcome. Signal's purpose statement includes
*measurable outcomes*; for use cases it is currently unrepresentable. `targetDate` is a
deadline, not a measure.

**C4 — "Stakeholder" is a copied name, not a reference.** `clientOwner` is a string, picked
from the account's mapped stakeholders but stored as text
([`UseCasePortfolio.tsx:479-481`](../../../components/clients/UseCasePortfolio.tsx)). Rename
or remove that stakeholder profile and the implementation keeps a name that no longer
resolves — silently, with nothing reporting it. The picker makes it look like a relationship.

**C5 — Two dead fields.** `nextStep` is deliberately retired and preserved, and this is
documented and correct. `missionId` is not: it is normalised, defended against being wiped
on save ([`use-case-implementation-actions.ts:104-107`](../../../app/%28app%29/clients/%5Bid%5D/use-case-implementation-actions.ts)),
and **no surface in Signal ever sets or reads it** — there is no Missions feature. It is
scaffolding for something that does not exist.

**Documentation gap.** [`docs/product/client-profile/README.md`](../../product/client-profile/README.md)
lists ten tabs and never mentions `UseCasePortfolio`, which is the account's entire
use-case surface.

## Recommendation

**Make the association carry its own justification, and give the record one home.**

Three changes, in this order:

1. **An association must be created with an objective.** Replace the bare checkbox toggle on
   both surfaces with a small create step requiring objective and scope. The gate, the
   duplicate refusal, and the storage location all stay exactly as they are — only the
   entry point changes.
2. **Add a success measure to the record**, so the thing Signal claims to enable is
   representable.
3. **Resolve C2 by deciding which "use case" a client has.** This is the decision that
   actually blocks the others (§ Open decisions).

**Why this over the alternatives.** Two were rejected:

- *Keep the fast toggle and chase completeness afterwards with an Action-list signal.* This
  is how the current gap arose — `implementationGaps()` already computes exactly that verdict
  and nothing consumes it. Adding a second unconsumed signal repeats the mistake, and it
  converts a signal into work without a stated rule ([principle 4.6](../../../.claude/agents/signal-product-manager.md)).
- *Move association entirely to the Client Profile and make the Universe read-only.* Clean,
  and it would make the module header in C1 true. Rejected because bulk-linking one use case
  across accounts is a genuine job — but the Universe should create the *same quality of
  record*, not a lesser one.

**What would change this recommendation:** the pre-work count. If most existing records
already carry an objective, the toggle is not the problem and this drops to a Level 1 note
covering C1, C2 and C5 only.

## Scope

**Foundation**

- Objective and scope required at creation, on both surfaces.
- One `successMeasure` field on the implementation record.
- C2 resolved: one "use cases" concept visible on the Client Profile.
- C1 corrected: the module header states what the code does.

**Later**

- `clientOwner` as a stakeholder reference rather than a copied name (C4).
- A structured success measure — baseline, target, current, source — instead of free text.
- Portfolio-level reading of use-case programmes for managers and Revenue.

**Non-goals**

- Changing where implementations are stored. `clients.properties` is right, for the three
  reasons in the module header, and it inherits the account permission scope for free.
- Allowing more than one implementation per (account, use case). The refusal at
  `use-case-implementation-actions.ts:83` is correct — ratify it as a rule.
- Removing `missionId` or `nextStep`. Dead, but harmless and cheap to keep; deleting stored
  values to tidy a type is not worth a migration.
- Unifying the two taxonomies of decision `0006`. Much larger, and C2 can be resolved on the
  page without it.
- Any AI assistance on objectives. A generated objective nobody wrote is exactly the
  unmaintained field this brief exists to prevent.

## Flow

**Associate a use case with an account** (identical from both surfaces)

1. **Trigger** — CSM selects a use case in the Client Profile picker, or an account in the
   Universe directory.
2. **Preconditions** — `denyClientWrite(clientId)` passes; the `useCaseId` resolves in the
   taxonomy, including retired entries; no existing implementation for this pair.
3. **User actions** — states the objective and the scope. Status defaults to `exploring`.
   Stakeholder, target date, success measure and notes remain optional.
4. **System behaviour** — `saveImplementationAction` writes one record into
   `clients.properties.use_case_implementations`.
5. **Result** — the account appears in the Universe's adoption list and the profile's card,
   with an objective attached.
6. **Failure behaviour** — a duplicate pair is refused with the existing message; an
   unresolvable `useCaseId` is refused; a write failure leaves no partial record.

## Business rules

| ID | Rule | Enforced where |
|---|---|---|
| `BR-001` | An implementation cannot be created without an objective and a scope | Server — `saveImplementationAction` |
| `BR-002` | One implementation per (account, use case). A second is refused, never split | Server — already at `use-case-implementation-actions.ts:83`; ratify |
| `BR-003` | Curating a definition and linking an account are different permissions and stay so | Server — `isAdminOrSuper()` vs `denyClientWrite()`; unchanged |
| `BR-004` | Editing an implementation never alters the canonical definition, and the reverse | Structural — separate stores; **untested, see R1** |
| `BR-005` | An association with no objective is not counted as adoption in any ranking or health input | Not yet implemented — decide with `D-002` |

## States

Unchanged. The five statuses of [R3](../../business-rules/use-case-associations.md) —
`exploring` · `planning` · `live` · `paused` · `completed` — are the right granularity and a
CSM can answer them without thinking. **Terminology note:** the product language says
*stage*; the code and UI say *status*. Pick one. This brief recommends **status**, because it
is what ships today and a rename touches every surface for no user gain.

## Data

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|
| `objective` | What **this** client is trying to achieve | string | **Yes (new)** | — | CSM | non-empty, ≤1000 | Gap check, profile card, Universe adoption list |
| `scope` | Which population, how many | string | **Yes (new)** | — | CSM | non-empty, ≤300 | Gap check |
| `successMeasure` | How this client will judge it worked | string | No | `""` | CSM | ≤500 | **New.** Profile card; later, portfolio reporting |
| `status` | Stage of the application | enum(5) | Yes | `exploring` | CSM | one of `IMPLEMENTATION_STATUSES` | Card, filters |
| `clientOwner` | Named contact client-side | string | No | `""` | Stakeholder picker | ≤200 | Card. **Copied name, not a reference — C4** |

Stored in `clients.properties.use_case_implementations`. `normalizeImplementations()` already
drops records missing `id` or `useCaseId`; extend it to tolerate — not delete — legacy
records with no objective, since they predate `BR-001`.

## Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|
| View a definition and its adoption | Yes | Yes | Yes | Yes |
| Create / edit / retire a definition | Yes | Yes | No | No |
| Associate a use case with an account | Yes | Yes (scope permitting) | Owned accounts only | **No** |
| Edit or remove an implementation | Yes | Yes (scope permitting) | Owned accounts only | **No** |

**Server-side gate:** `denyClientWrite(clientId)` for every implementation write;
`isAdminOrSuper()` for every definition write. Unchanged by this brief, and the identical
behaviour from both surfaces is a feature — say so in the code, not only here.

## Empty, loading and error states

| State | What is shown | Recovery |
|---|---|---|
| No implementations | Prompt to associate a use case, naming what the record is for — not a bare empty box | Open the picker |
| Legacy record, no objective | Card shows the existing gap chip, with an inline edit | Add an objective |
| Duplicate pair | The existing refusal message, naming the use case | — |
| Use case retired after association | Record stays editable, entry marked retired | Re-point or complete |

## Acceptance criteria

- [ ] `AC-001` — Given an Operator on an account they own, When they associate a use case
      without entering an objective, Then the write is refused **server-side** and the record
      is not created.
- [ ] `AC-002` — Given the same Operator on an account they do not own, When they attempt the
      association from **the Universe directory**, Then it is refused by `denyClientWrite` —
      identically to attempting it from the Client Profile.
- [ ] `AC-003` — Given a client implementation with an edited objective, When an Admin edits
      the canonical definition's summary, Then the client's objective is unchanged; and the
      reverse. *(This pins `BR-004`/R1, which today is protected only by code structure.)*
- [ ] `AC-004` — Given an account already associated with use case X, When a second
      association to X is attempted from either surface, Then it is refused and the original
      record is untouched.
- [ ] `AC-005` — Given a Client Profile, When a CSM opens General information, Then exactly
      one block presents the account's use cases.
- [ ] `AC-006` — Given a use case retired with a merge target, When the successor's adoption
      list is read, Then it includes the accounts recorded against the retired id, and their
      objectives are unchanged. *(Already true — pin it before touching this area.)*

## Risks and trade-offs

- **A required objective slows the fast path.** Real cost: bulk-linking from the Universe
  becomes several steps instead of one click. The counterargument is that the fast path
  produces records nobody can use, and adoption counts that mislead a manager. If the
  pre-work count shows objectives are usually filled in anyway, this risk is theoretical and
  the requirement is cheap.
- **`successMeasure` is a new field, and this brief argues against fields nobody maintains.**
  It is defensible only because it is optional, and because the alternative is that Signal
  cannot express the outcome it exists to produce. If it sits empty on most records after a
  quarter, remove it — do not add a reminder to fill it in.
- **C2's resolution may be unpopular.** Whichever list is removed, someone relies on it. That
  is why it is a decision (`D-001`) and not a recommendation in this brief.
- **This brief adds no user-visible capability.** It makes an existing one trustworthy.
  That trade is correct here and would not be for most features.

## Open decisions

| Decision | Options | Recommendation | Consequence of delay |
|---|---|---|---|
| `D-001` Which "use cases" does a client have? | (a) The implementation record is authoritative; the HubSpot deal field moves under disclosure, labelled as sales-declared. (b) Show both, explicitly labelled *CS-recorded* and *Sales-declared*, with disagreement visible. (c) Keep as-is. | **(a)** — one concept, one owner, one place. (b) is honest but asks every CSM to reconcile two taxonomies forever. | Every new association is recorded against a page that contradicts itself. Blocks C2 and the module-header correction. |
| `D-002` Does an objective-less association count as adoption? | (a) Yes, count everything. (b) No — exclude from ranking and from the `use_case_set` health input. | **(a) for the foundation.** Changing what feeds health changes Today, the Action list and Insights ([PRODUCT_MAP §5](../../PRODUCT_MAP.md)). Do it as a deliberate health change, not a side effect of this one. | Low. Safe to defer. |
| `D-003` Is `missionId` scaffolding for a planned Missions feature, or dead? | (a) Planned — leave it. (b) Dead — stop normalising it. | **Ask.** This is the one question the repository genuinely cannot answer, and it is not blocking. | None. |

---

**Evidence:** `lib/use-case-implementation.ts` · `lib/use-case-overlay.ts` ·
`app/(app)/clients/[id]/use-case-implementation-actions.ts` · `app/(app)/use-cases/page.tsx` ·
`app/(app)/use-cases/[id]/page.tsx` · `components/clients/UseCasePortfolio.tsx` ·
`components/clients/ClientProfileTabs.tsx` · `components/reports/UseCaseDirectory.tsx` ·
`lib/use-case-implementation.test.ts` · `docs/decisions/0001`, `0006`, `0008` ·
`docs/business-rules/use-case-associations.md` · `docs/PRODUCT_MAP.md` ·
`docs/product/client-profile/README.md`

**Coherence check:** introduces one new field (`successMeasure`, optional, with a removal
condition stated) and no new concept, status, source of truth, calculation, timeline or
action-management system. It **removes** one duplicate concept (C2) rather than adding one.
No permission changes. No AI. `BR-005` is deliberately deferred because it would silently
change a health input.

**Documenter handoff — after implementation, not before:**

- `docs/product/client-profile/README.md` — add the use-case portfolio to the General
  information tab; it is currently absent entirely.
- `docs/product/use-case-universe/README.md` — the directory writes associations as well as
  reading them.
- `docs/business-rules/use-case-associations.md` — R1 gains test coverage (`AC-003`); add the
  one-per-pair rule as `BR-002`; correct the C1 header claim in the Known inconsistencies list.
- `docs/known-limitations/contradictions.md` — C1 and C2 belong here **now**, before any of
  this is built. They describe today.
- `docs/GLOSSARY.md` — settle *stage* vs *status*; add `ClientUseCase` success measure.
- Decision record — `D-001`, once answered.
- **Must not be documented until it ships:** the required objective, `successMeasure`, and
  any change to what the General information tab shows.
