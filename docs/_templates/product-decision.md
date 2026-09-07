# Product decision — <the decision, stated as a question to be settled>

> **Forward-looking.** Use this when a decision is *open* and needs to be made before
> implementation: options, recommendation, and the cost of not deciding.
>
> This is **not** [`decision-template.md`](decision-template.md). That one is retrospective —
> `signal-product-documenter` writes numbered records into the decisions folder to record a
> decision that was already made and is evidenced in the code. This template is what
> `signal-product-manager` writes *before* that exists.
>
> Copy to `docs/decisions/proposed/<slug>.md`. When the decision is accepted **and
> implemented**, it graduates into a numbered record in [`../decisions/`](../decisions/README.md)
> written with `decision-template.md`.

**Status:** Open | Recommended | Accepted | Deferred | Rejected | Graduated to `NNNN`
**Date raised:** YYYY-MM-DD
**Decision owner:** who can actually settle this
**Product areas affected:**
**Blocking:** which specification or work item is waiting on this

## The decision

State it as one specific question with a determinate answer. Not *"how should use cases
work?"* but *"may a client hold more than one active application of the same canonical use
case?"*

## Why it has to be decided now

What is blocked, and what would be built wrong if this were guessed.

## Current state

What the code does today, with file references. Often the code has already made this
decision by accident — say so, because ratifying an accident is different from choosing.

## Options

### Option A — <name>
- **Behaviour:**
- **Consequences:**
- **Cost to change later:**

### Option B — <name>
- **Behaviour:**
- **Consequences:**
- **Cost to change later:**

## Recommendation

One option, chosen, with the reasoning. Not a summary of the table above.

## What would change this recommendation

The evidence or constraint that would flip it. If nothing would, say so — that is a strong
signal the decision is easier than it looks.

## Consequence of delaying

What happens if this stays open: work that proceeds on an assumption, records created under
the wrong shape, or a migration that gets more expensive each week.

## Reversibility

Is this a one-way door? If existing records will be created under this decision, say how
many and what unwinding them costs.

---

**Evidence:** files, tests and commits read.
**On acceptance:** graduate to a numbered record in [`../decisions/`](../decisions/README.md),
and hand the affected documents to `signal-product-documenter`.
