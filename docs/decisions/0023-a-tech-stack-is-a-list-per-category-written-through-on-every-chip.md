# 0023. A tech stack is a list per category, written through on every chip

**Status:** Accepted
**Date:** 2026-09-09
**Affected product areas:** Client Profile → General information · `clients.properties` data
model

## Context

Every other editable field on the General information tab is a **single value behind a
click-to-edit control**: `EditableField` renders a label, the user clicks, an input appears,
one value is committed. The fields themselves are admin-defined rows in
`property_definitions`, grouped and ordered from the database.

Recording the systems an account already runs does not fit that shape, and the reasons are
stated in the code rather than inferred:

- An account runs **several tools per category** — commonly two learning platforms at once,
  mid-migration.
- A CSM records a stack **during a call**, in a burst, and a discovery note routinely
  arrives as `Workday, BambooHR, Personio` in one line.
- Roughly half of what accounts run is an **in-house tool nobody outside the company has
  heard of**, so no picklist can be closed.
- `clients.properties` has **several concurrent writers** on the same row (CS Pulse, health,
  churn, the scheduled usage sync), which is why every write already goes through the atomic
  `properties || patch` merge.

## Decision

**Each tech-stack category is its own top-level key in `clients.properties` holding a
`string[]`, and each chip is written through the moment it is added or removed.**

Concretely:

1. **One key per category** — `tech_stack_hris`, `tech_stack_lms`, `tech_stack_performance`,
   `tech_stack_ats`, `tech_stack_sso`, `tech_stack_collaboration`, `tech_stack_bi`,
   `tech_stack_other`, plus a free-text `tech_stack_notes`. One edit patches one key, so two
   CSMs filling in different categories on the same account cannot clobber each other, and
   the sync's merge preserves all of them without knowing they exist.
2. **A chip box, always live** — not the click-to-edit treatment the rest of the tab uses.
   Recording a stack is list-building, not single-value correction.
3. **No Save button.** Every add and removal persists immediately, optimistically, and rolls
   back if the write fails. There is no dirty state, so there is nothing to lose.
4. **Suggestions are a typing aid, never a closed vocabulary.** Known tools surface as you
   type; free text is always accepted.
5. **These are code-defined fields, not `property_definitions` rows** — the categories and
   their suggestion lists live in `lib/tech-stack.ts`.

## Alternatives considered

- **A comma-separated text field on the existing `EditableField`.** Rejected in the commit
  message: a CSM on a call would have to open and close an editor once per tool, and a
  pasted list would land as one long value. (The same commit did plumb an optional
  `placeholder` prop into `EditableField` — evidence the existing control was examined
  before being set aside. No call site uses it.)
- **A single `tech_stack` object under one key.** Rejected in the module header of
  `lib/tech-stack.ts`: one key per category is what makes a save a one-key patch and keeps
  two concurrent editors from overwriting each other.
- **A closed picklist of known tools.** Rejected in both module headers — "the in-house
  portal is exactly the thing worth writing down".
- **Admin-defined `property_definitions` rows, curated in Settings → Properties.** Not
  evidenced anywhere in the repository as a considered option; the categories were written
  as code constants. *Whether this was weighed requires confirmation from the team.*

## Consequences

**Easier**
- No migration, no schema change, no property-definition seeding to ship the feature.
- Concurrent editing is safe by construction, and no sync or re-import can clear a recorded
  stack.
- A pasted list, a corrected typo and a removal all behave the way a chip box leads people
  to expect.

**Harder**
- **Not queryable across accounts.** Eight untyped JSONB keys of free text mean "which
  accounts run Workday?" is a database query with a normalisation problem attached, not a
  product question. Any future aggregation has to reconcile spelling first.
- **Not admin-curatable.** Adding a category, or a tool to a suggestion list, is a code
  change.
- **Outside the profile-completeness model**, which reads a hard-coded field list — so an
  account with no stack recorded is never flagged for it.
- **One HTTP write per chip**, each triggering a `recomputeClient` for the account.
- The always-live box has no permission affordance: a user who cannot save still gets an
  input, and the refusal arrives as a chip that disappears.

**Commits Signal to** treating the tech stack as *reference data on the account* — something
a person reads while working the account — rather than as structured data any calculation
depends on. Changing that later means normalising values that were entered as free text.

## Implementation references

- [`lib/tech-stack.ts`](../../lib/tech-stack.ts) — module header states the storage and
  open-vocabulary rationale; category definitions and `normalizeTools`.
- [`components/clients/ToolChipInput.tsx`](../../components/clients/ToolChipInput.tsx) —
  module header states the always-live rationale.
- `TechStackSection` in
  [`components/clients/ClientProfileTabs.tsx`](../../components/clients/ClientProfileTabs.tsx).
- Commit `d45a6cd`.
- Feature documentation:
  [client-profile → tech-stack](../product/client-profile/tech-stack.md).
- **Tests:** none.

## Superseded decisions

None. Related: the `clients.properties`-over-tables pattern is still an unwritten decision
candidate — see [decisions/README](README.md#decisions-that-are-evident-but-not-yet-recorded).

---

**Rationale evidence:** module header + commit message. The one point that is inferred is
the `property_definitions` alternative — *that part requires confirmation from the team.*
