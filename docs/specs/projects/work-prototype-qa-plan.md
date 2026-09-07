# Work prototype — QA plan

> For a QA agent or tester. Everything here runs locally with no Clerk session and no
> database. Nothing reads or writes real data.

**Date:** 2026-08-08 · **Status:** Prototype under review — **not** a release candidate

---

## What this is

Two local routes plus one unit-tested pure function, prototyping the proposed
**Client Profile → Work** experience and the rule deciding which project tasks reach the
Today board.

| Route | Purpose |
|---|---|
| `/scratch-work` | The Work tab: Projects and Tasks, with a project detail drawer |
| `/scratch-work/today` | Which project tasks reach Today, with a movable "today" date |

Both are guarded with `notFound()` outside development.

## Setup

```bash
npm run dev
```

Then open `http://localhost:3000/scratch-work`.

```bash
npm test          # 248 tests, 15 of them for the Today rule
npm run typecheck
```

---

## 1 · Work tab — `/scratch-work`

### 1.1 Header

| # | Check | Expected |
|---|---|---|
| 1.1.1 | Two tabs are present | `Projects` and `Tasks`, each with an inline count |
| 1.1.2 | Counts are correct | Projects 4 · Tasks 20 (4 standalone + 16 project tasks) |
| 1.1.3 | Two actions are present | `Add task` (secondary) and `Add project` (primary) |
| 1.1.4 | Actions are inert | Prototype only — clicking does nothing. **Not a bug** |
| 1.1.5 | Switching tabs preserves the header | Counts and buttons do not move or reflow |

### 1.2 Projects table

| # | Check | Expected |
|---|---|---|
| 1.2.1 | Columns, in order | Project · Lifecycle · Delivery · Owner · Next milestone · Forecast |
| 1.2.2 | Linked use case | Shown under the project name when present; absent for *Engage pilot* and *Recovery* |
| 1.2.3 | Lifecycle and Delivery are separate | *Perform rollout* reads **Active** and **Off track** together |
| 1.2.4 | Delivery states render | On track (green), At risk (amber), Off track (red), Not assessed (grey) |
| 1.2.5 | Next milestone | The first milestone with unfinished tasks. *Recovery* has none → `—` |
| 1.2.6 | Row opens the drawer | Clicking anywhere on a row |
| 1.2.7 | Horizontal scroll | Below ~720px the table scrolls inside its own container; **the page must not scroll sideways** |

### 1.3 Tasks table

| # | Check | Expected |
|---|---|---|
| 1.3.1 | Columns, in order | Task · Context · Owner · Due · Status |
| 1.3.2 | Context for a project task | Project name, with the milestone beneath |
| 1.3.3 | Context for a standalone task | `Standalone`, with the origin beneath for signal and Pulse tasks |
| 1.3.4 | Ordering | Blocked first, then In progress, then To do, then Done; by due date within each |
| 1.3.5 | Done styling | Struck through and muted |
| 1.3.6 | Nothing is lost | All 16 project tasks and all 4 standalone tasks appear |

### 1.4 Project drawer

| # | Check | Expected |
|---|---|---|
| 1.4.1 | Opens with the intended outcome first | Before any date or field |
| 1.4.2 | Fields present | Linked use case · Owner · Implementer · Baseline delivery · Forecast delivery |
| 1.4.3 | Empty fields are honest | "None linked" / "Unassigned" in muted text, never blank |
| 1.4.4 | Milestones list tasks | Each milestone shows `done/total`, its date, and its task rows |
| 1.4.5 | Escape closes it | — |
| 1.4.6 | Backdrop click closes it | — |
| 1.4.7 | Drawer scrolls internally | The page behind must not scroll |
| 1.4.8 | Baseline and forecast differ where expected | *Perform rollout* 30 May → 15 Oct; *Compliance* identical |

---

## 2 · Today rule — `/scratch-work/today`

The rule: a project task reaches Today when it is **blocked**, **overdue**, or **due today**.
Source: [`lib/work/today-rule.ts`](../../../lib/work/today-rule.ts).

### 2.1 Default state — today is 2026-08-08

| # | Check | Expected |
|---|---|---|
| 2.1.1 | Count | "1 of 16 project tasks reach Today" |
| 2.1.2 | The one that qualifies | *Sponsor sign-off*, reason **Blocked** |
| 2.1.3 | Standalone section unchanged | 3 open tasks, described as already on Today |
| 2.1.4 | Held section | 15 project tasks listed with their dates, done ones struck through |

### 2.2 Boundary cases — move the date control

| # | Set "today" to | Expected |
|---|---|---|
| 2.2.1 | `2026-08-11` | Count becomes **2**. *Escalate job-architecture decision* appears as **Due today** |
| 2.2.2 | `2026-08-12` | Same task now reads **Overdue · 1d late** |
| 2.2.3 | `2026-08-10` | Back to **1** — due tomorrow does not qualify |
| 2.2.4 | `2026-08-23` | *Sponsor sign-off* still shows, now **Blocked** — blocked wins over the date |
| 2.2.5 | `2026-03-01` | Count is **1** — only the blocked task; nothing is yet overdue |
| 2.2.6 | `2026-12-31` | Everything unfinished is overdue; done tasks still absent |
| 2.2.7 | Ordering with several | Blocked first, then most overdue, then due today |

### 2.3 Rules that must hold at every date

| # | Check |
|---|---|
| 2.3.1 | A **done** task never appears, however overdue |
| 2.3.2 | A task with **no due date** and not blocked never appears |
| 2.3.3 | Surfaced + held always totals 16 |
| 2.3.4 | The standalone section never changes with the date |

---

## 3 · Cross-cutting

| # | Check | Expected |
|---|---|---|
| 3.1 | Console | No errors or warnings on either route |
| 3.2 | Dark mode | Both routes legible; no hardcoded light-only colours |
| 3.3 | Narrow viewport (768px) | Tables scroll inside their container; header wraps rather than overflowing |
| 3.4 | Keyboard | Tabs and the date control reachable by Tab; the drawer closes on Escape |
| 3.5 | Production guard | Both routes return 404 when `NODE_ENV=production` |

---

## 4 · Known and deliberate — do not raise as defects

- **All buttons are inert.** `Add task`, `Add project` and every row action do nothing.
- **All data is sample data**, hardcoded in `app/scratch-work/data.ts`. One account only.
- **No filtering, sorting, search, pagination or bulk actions.** Removed on purpose.
- **No portfolio, team or capacity views.** Out of scope for this release.
- **No risk-reason capture.** The delivery-health chip renders; the panel behind it does not.
- **The Forecast column may be clipped** at narrow widths — an open design question, not a
  bug. See §5.
- **"Not assessed"** appears here and in account health meaning different things — a known
  naming collision awaiting a decision.

---

## 5 · Open questions QA feedback would help settle

1. **Does the Forecast column earn its place?** At profile width, six columns plus a
   two-line project name overflow. Is next-milestone-plus-forecast better as one column?
2. **Should the Tasks count include done tasks?** It currently counts all 20. Open-only
   would read 17.
3. **Is "blocked wins over any date" right?** A task blocked but not due for two months shows
   on Today every day until unblocked. Does that become noise?

---

## 6 · What to report

For each failure: the route, the check id, the "today" value if relevant, what you expected,
what happened, and a screenshot. Anything in §4 is out of scope by design — if something
there feels wrong, note it against §5 instead of raising it as a defect.
