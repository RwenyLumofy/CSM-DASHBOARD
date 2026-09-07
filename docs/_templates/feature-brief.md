# Feature brief — <capability, stated as an outcome>

> **Level 2.** For a moderate feature inside one product area. If the change spans several
> areas, business logic, the data model, permissions, calculations, existing records,
> multiple roles or commercial outcomes, use
> [`product-specification.md`](product-specification.md).
>
> Copy to `docs/specs/<area>/<slug>.md`.
> Written by `signal-product-manager`. This describes **intended** behaviour. It is not
> product documentation and must never be cited as current behaviour.

**Status:** Proposed | Approved | In implementation | Implemented | Withdrawn
**Date:** YYYY-MM-DD
**Product area:**
**Author:**

## Product judgement

Proceed | Proceed with changes | Validate first | Do not build | Already sufficiently
addressed. One paragraph of reason.

## Problem

- **Who has it:**
- **When it occurs:**
- **What they do today:**
- **Why that is insufficient:**
- **Operational or commercial consequence:**
- **Evidence available:**
- **Evidence still missing:**

## Product outcome

The capability this creates, as a user or business capability — not an artefact.
Not *"build a panel"*. Yes: *"a CSM can see which of their accounts have a renewal inside
90 days with no owner action recorded, and assign one without leaving the page."*

## Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround |
|---|---|---|---|---|

## Current state

What exists today, verified from the implementation. Cite files. Include what already
almost does this — the reason to build is usually narrower once you have read the code.

## Recommendation

The chosen direction, and why it beats the credible alternatives. State the alternatives
you rejected and what would make you change your mind.

## Scope

**Foundation** — what must be built now.
**Later** — valuable, but must not block the foundation.
**Non-goals** — deliberately excluded, and why.

## Flow

Step by step, end to end. Entry point → user actions → system behaviour → result →
failure behaviour.

## Business rules

| ID | Rule | Enforced where |
|---|---|---|
| `BR-001` | | Server / UI — say which |

## States

| State | Meaning | Entered by | Exited by | Who may change it | Side effects |
|---|---|---|---|---|---|

## Data

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|

Say where it is stored. In Signal a great deal of product state lives in
`clients.properties` JSONB or `workspace_config`, not in its own table — name the key.

## Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|

**Server-side gate:** the actual function and call site. A hidden button is not a permission.

## Empty, loading and error states

What each state shows, and what recovery action it offers.

## Acceptance criteria

- [ ] `AC-001` — Given … When … Then …

## Risks and trade-offs

The strongest counterarguments, including against this brief's own recommendation.

## Open decisions

| Decision | Options | Recommendation | Consequence of delay |
|---|---|---|---|

---

**Evidence:** files and tests read (repository-relative paths).
**Coherence check:** confirm this introduces no duplicate concept, second source of truth,
conflicting calculation, permission bypass, unmaintained field, or output with no downstream
action.
**Documenter handoff:** which `docs/` documents change once this ships, and what must not be
documented until it does.
