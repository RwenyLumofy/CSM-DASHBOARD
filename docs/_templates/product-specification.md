# Specification — <capability, stated as an outcome>

> **Level 3.** For a change affecting several product areas, business logic, the data model,
> permissions, calculations, existing records, multiple roles, or commercial outcomes.
> Anything smaller belongs in [`feature-brief.md`](feature-brief.md) or
> [`product-note.md`](product-note.md).
>
> Copy to `docs/specs/<area>/<slug>.md`.
> Written by `signal-product-manager`. This describes **intended** behaviour. It is not
> product documentation. It must never be cited as evidence of what Signal does today.
>
> Sections are mandatory in order. Write "None" or "Not applicable — <why>" rather than
> deleting one.

**Status:** Proposed | Approved | In implementation | Implemented | Superseded | Withdrawn
**Date:** YYYY-MM-DD
**Product areas affected:**
**Author:**

---

## 1. Executive decision

One paragraph: what should be built, why, for whom, and the recommended scope. A reader who
stops here should be able to approve or reject.

**Product judgement:** Proceed | Proceed with changes | Validate first | Do not build |
Already sufficiently addressed.

## 2. Problem

- **User problem:**
- **Current behaviour:** verified from the implementation, with file references
- **Consequence:** operational and commercial
- **Evidence:** what we actually know, and how we know it
- **Assumptions:** what we are treating as true without evidence

## 3. Product outcome

The capability created, stated as a user or business capability.

## 4. Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround | Desired result |
|---|---|---|---|---|---|

## 5. Recommendation

The recommended solution, and why it is better than the credible alternatives. Name the
alternatives. Name what would change this recommendation.

## 6. Scope

### Foundation
What must be built now — the smallest **coherent** version, not the smallest collection of
fields.

### Later
Valuable additions that must not block the foundation.

### Non-goals
Deliberately excluded, and why. This section prevents scope returning through the back door.

## 7. Information architecture

Page · section · tab · panel · drawer · modal · navigation · disclosure.

**Only introduce a tab when the content is a genuinely distinct user mode or job.** Say what
belongs on the surface, what belongs behind disclosure, and what belongs on another page.

## 8. End-to-end flows

For each flow: trigger · preconditions · user actions · system behaviour (including writes
and side effects) · result · failure behaviour.

## 9. Functional requirements

| ID | Requirement | Observable behaviour |
|---|---|---|
| `FR-001` | | |

Every requirement describes behaviour a person or a test can observe.

## 10. Business rules

| ID | Rule | Inputs | Exceptions | Enforced where |
|---|---|---|---|---|
| `BR-001` | | | | Server / UI — say which |

Where a rule is cross-product, say which `docs/business-rules/` document it will belong to
once implemented.

## 11. Data requirements

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|

State the storage location, including JSONB keys (`clients.properties.<key>`,
`workspace_config.<key>`). For each field, answer: **who maintains this, and will they?**

## 12. States and transitions

| State | Meaning | Entry condition | Exit condition | Allowed actors | Side effects |
|---|---|---|---|---|---|

## 13. Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|

**Server-side gate:** the function and its call site. Also state how per-user scope
(`all` / `assigned` / `selected`) and account grants apply. A hidden UI control is not a
permission.

## 14. Time behaviour

Selected period · start and end boundaries · comparison period · "as of" date ·
today-relative data · historical completeness · partial-period behaviour · timezone ·
future-dated records · missing periods.

If this specification introduces a metric, state whether it is a point-in-time value, a
period movement, or a forecast — and never let one be read as another.

## 15. Empty, loading and error states

| State | What is shown | Recovery action |
|---|---|---|

## 16. Notifications and automations

| Trigger | Recipient | Channel | Timing | Deduplication | User control | Audit record |
|---|---|---|---|---|---|---|

No automation silently changes a commercial outcome, a financial value, ownership, a
canonical definition, or another person's commitments.

## 17. Analytics

Only events that support a decision.

| Event | Trigger | Properties | Purpose | Associated with |
|---|---|---|---|---|

Signal has no product analytics SDK. If a success measure depends on one, say so here rather
than specifying events that cannot be emitted.

## 18. Dependencies and impacts

Affected pages · components · APIs · database entities · calculations · permissions ·
automations · reporting · documentation · **existing clients and records**.

## 19. Migration and compatibility

Existing-data treatment · backfill · defaults for records created before this change ·
rollback · historical preservation. State explicitly what happens to records that will never
have the new data.

## 20. Acceptance criteria

- [ ] `AC-001` — Given … When … Then …

Observable · testable · specific · role-aware · state-aware · consistent with §11.

## 21. Open decisions

Only decisions that materially affect implementation.

| Decision | Options | Recommendation | Consequence of delaying |
|---|---|---|---|

## 22. Risks and trade-offs

The strongest counterarguments, including against this specification's own recommendation.
What this makes hard. What it commits Signal to.

---

## Coherence check

Confirm this introduces none of the following — or explain why the exception is right:

duplicate concept · duplicate status · second source of truth · conflicting calculation ·
permission bypass · another action-management system · another timeline · another definition
of risk · another definition of health · another representation of renewal · a canonical
field stored per-client · a client-specific field stored as canonical · a metric with no
owner · a field users will not maintain · an unexplained AI recommendation · an output with
no downstream action · a page mixing unrelated jobs.

## Evidence

Files, tests and commits read to establish current behaviour. Repository-relative paths that
exist.

## Documenter handoff

Once implemented, `signal-product-documenter` updates:

- Feature documents:
- Business rules:
- Data model:
- Glossary terms added or changed:
- Decision records to write:
- Changelog entry:
- **Must not be documented until it ships:**
