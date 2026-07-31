# <Exact product-facing feature name>

> Copy this file to `docs/product/<area>/<feature>.md`. Keep the section order.
> Write "None found" or "Not documented — see Open questions" rather than deleting a
> section. Omit a section only when it is genuinely inapplicable, and say why.

**Status:** Verified | Partially verified | Unverified | Proposed | Contradictory

## Summary

One or two sentences. What the feature does.

## Purpose

The problem it solves, and the decision or action it enables. Not the mechanism.

## Intended users

Which roles: CSM (operator) · Manager · Administrator · Super Admin · Product · Support ·
Implementation · Revenue · Leadership. Name the ones that actually apply.

## Entry points

- **Route:** `/…`
- **Navigation path:** e.g. Sidebar → Clients → account → tab
- **Links in from:** other features that navigate here
- **Contextual actions:** buttons, drawers, or modals that open it

## Information architecture

The major sections of the surface, in the order a user meets them, and what each is for.

## Primary workflows

For each end-to-end flow:

1. **Trigger** — what starts it
2. **Preconditions** — what must be true first
3. **User actions** — what the person does
4. **System behaviour** — what Signal does, including writes and side effects
5. **Result** — the end state
6. **Failure / exception behaviour** — what happens when it does not work

## Fields and data

| Label | Meaning | Type | Required | Default | Editable by | Source | Validation | Downstream effects |
|---|---|---|---|---|---|---|---|---|

Skip decorative UI. Include anything that affects behaviour or another record.

## States and statuses

| State | Meaning | Entered by | Exited by | Who can change it | What it affects |
|---|---|---|---|---|---|

## Business rules

Rules enforced in the interface or the backend. Say which. Link to
`docs/business-rules/` where the rule is cross-product.

## Permissions

- View:
- Create:
- Edit:
- Delete / archive:
- Protected actions:
- **Server-side enforcement:** the actual gate and its call site (`file.ts:line`)

## Automations and side effects

Notifications · generated tasks or action items · background jobs · recalculations ·
audit events · updates to related records.

## Empty, loading and error states

What is implemented, and what is missing.

## Data model

Entities involved and their relationships. Include JSONB storage keys where product
state lives inside `clients.properties` or `workspace_config`.

## Technical implementation

Routes · components · services · API handlers · schemas · database models · migrations ·
tests · configuration. Repository-relative paths. Explain, do not transcribe.

## Analytics and observability

Events · metrics · logs · monitoring · blind spots. **Only what exists.**

## Dependencies

Related product areas and external systems.

## Known limitations

Honest. Including the ones nobody has filed.

## Open questions

Uncertainties that cannot be resolved from the code, and who could answer them.

## Source references

The principal files and tests used to verify this document.

---

**Documentation status:** Verified | Partially verified | Unverified
**Last verified:** YYYY-MM-DD
**Verified against commit:** `<short-sha>`
**Documentation owner:** <name, or "Unassigned">
