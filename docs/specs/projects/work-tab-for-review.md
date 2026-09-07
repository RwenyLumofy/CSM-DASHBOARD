# Work — a prototype to look at and argue with

**Signal · Client Profile** · 8 August 2026 · **Prototype, not a decision**

---

## The problem

Project Management today is a delivery tracker with three gaps:

- **A project cannot tell you whether it is slipping.** There is no baseline — change a
  delivery date and the previous one is gone. A project can move four times and still read
  "on track", because on-track is measured against the date it was last moved to.
- **"At risk" is a status that does nothing.** A CSM marks it and the system ignores it: no
  signal, no effect on anything.
- **There are two things called Tasks on one page.** Project tasks live inside a project; the
  Tasks sheet holds standalone ones. Different tables, no relationship.

## What we are proposing

Rename the tab to **Work**, holding **Projects** and **Tasks** together. Three changes sit
inside that:

**1 · Lifecycle and delivery health become separate.**
A project can be *Active and Off track*, or *Completed and On track*. Today those are one
field, so "at risk" competes with "active" for the same slot.

**2 · Every project carries a baseline and a forecast.**
The date first committed, the date now expected, and the gap between them. This is what makes
slippage visible instead of invisible.

**3 · One task list, sources kept.**
Project tasks, standalone tasks, tasks created from a signal, tasks created from a Pulse — one
table, each keeping where it came from. **No table merge**, no migration. A presentation
change, not a schema change.

## And a fourth, smaller one

Project tasks reach the **Today** board only when they are **blocked, overdue or due today**.
Everything else stays in Work. On a realistic board that surfaces one row, not the plan —
narrow on purpose, because Today is a queue of what needs attention now.

Today a blocked project task holding up a milestone is invisible until the milestone slips.

---

## Look at it

```bash
npm run dev
```

| | |
|---|---|
| **`/scratch-work`** | The Work tab — projects, tasks, and the project drawer |
| **`/scratch-work/today`** | Which project tasks reach Today. **The date is editable**, so you can move it and watch rows appear and drop out |

Sample data on one account. Nothing reads or writes the database. Buttons are inert.

---

## Deliberately not in it

No portfolio or team views · no capacity or workload · no filters, sorting or search · no
Gantt, dependencies or effort estimates · no risk-capture panel · no summary cards.

This is one clear place to see the work on one client. It is not a project-management
platform, and the scope was cut twice to keep it that way.

---

## What would help

Three questions the prototype cannot settle on its own:

1. **Does the Forecast column earn its place?** At profile width, six columns plus a two-line
   project name overflow. Would next-milestone-and-forecast work better as one column?
2. **Should a blocked task show on Today every day until it is unblocked**, even if it is not
   due for two months? Or does that become noise?
3. **"Not assessed"** is a delivery-health state here and an account-health state elsewhere,
   meaning different things. Which one gets renamed?

Anything else — click it and say what feels wrong. It is quicker to change now than after the
schema is agreed.

---

## If you want the detail

`docs/specs/projects/project-management-review.md` — the findings behind this, each marked
verified-from-code or from-docs.
`docs/specs/projects/work-prototype-qa-plan.md` — around 40 checks, and the list of what is
deliberately absent so it is not raised as broken.
`lib/work/today-rule.ts` — the Today rule, with 15 unit tests pinning the edge cases.
