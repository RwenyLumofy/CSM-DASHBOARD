# Product note — <what changes, stated as an outcome>

> **Level 1.** For a small, isolated change inside one product area. If the change touches
> another area, a business rule, the data model, permissions or a calculation, use
> [`feature-brief.md`](feature-brief.md) instead.
>
> Copy to `docs/product-notes/YYYY-MM-DD-<slug>.md`.
> Written by `signal-product-manager`. This describes **intended** behaviour, not shipped
> behaviour.

**Status:** Proposed | Approved | Implemented | Withdrawn
**Date:** YYYY-MM-DD
**Product area:**
**Author:**

## Product judgement

Proceed | Proceed with changes | Validate first | Do not build | Already sufficiently
addressed — and one sentence of reason.

## Problem

Who has it, when it occurs, what they do today, and why that is not enough. One paragraph.
If you cannot name the person and the moment, this is not a problem yet.

## Recommendation

What should change, stated as a decision.

## Behaviour

What the system does after the change. Include the states or values involved and who can
trigger it. Name the server-side permission gate if one applies.

## Acceptance criteria

- [ ] Observable, testable, role-aware statements. Given/When/Then where it helps.

## Impact

Pages, components, entities or documents this touches. "None beyond this area" is a valid
and useful answer — but only after you have checked.

---

**Evidence:** files read to verify the current behaviour (repository-relative paths).
**Documenter handoff:** which `docs/` documents need updating once this ships.
