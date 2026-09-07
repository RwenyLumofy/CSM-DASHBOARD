# Specification — the Projects tab answers "is delivery slipping on this account, and who owns it"

> **Level 3.** For a change affecting several product areas, business logic, the data model,
> permissions, calculations, existing records, multiple roles, or commercial outcomes.
>
> Written by `signal-product-manager`. This describes **intended** behaviour. It is not
> product documentation. It must never be cited as evidence of what Signal does today.

**Status:** Proposed
**Date:** 2026-08-18
**Product areas affected:** Client Profile → Project Management · Action list · Notifications · Design tokens
**Author:** `signal-product-manager`

---

## 1. Executive decision

The Projects tab should stay a **table**, and stop being a list of projects that happens to
colour some dates red. Its job is triage: *is any delivery work on this account slipping, who
owns it, and what is next?* Today that question requires opening every drawer, because the tab
has no count, no "due soon" state, and a definition of "late" that disagrees with the one the
Action list and the notification emails use. This specification unifies lateness on the single
existing domain rule (`computeProjectDeadlines()`), adopts Signal's existing due-date language
(`lib/today/due.ts`), surfaces a per-account slippage summary and a next-milestone fact on each
row, and separates "how much is done" from "is it on time" in the progress indicator. It
deletes the duplicate rule rather than patching it, which removes a live rendering bug as a
structural consequence rather than as a fifth special case.

**Product judgement:** **Proceed with changes.** Proceed with the unification, the summary and
the progress split. Do **not** proceed with converting the list to a board, and do **not**
attempt baseline/slippage dates here — that is `R-1` from the prior review and is the larger
prize, but it needs a schema change and should not be bundled into a rendering correction.

---

## 2. Problem

### User problem

A CSM opening an account cannot tell whether delivery is slipping without opening every
project. An implementation owner cannot tell which of their items is the one about to miss.
Both receive an email that says "2 overdue · 3 due soon" and then find a tab that shows neither
number, and in some cases disagrees about which items are late.

### Current behaviour — verified from the implementation

**There are two independent definitions of lateness.**

`computeProjectDeadlines()` (`lib/projects/deadlines.ts:45`) is the rich, domain-level rule. It
returns both `overdue` and `due_soon` states (`:23`), applies thresholds
`PROJECT_DUE_SOON_DAYS = 7` and `TASK_DUE_SOON_DAYS = 2` (`:13-14`), carries `daysUntil`
(`:24`), falls back from task owner to project owner (`:65`), and deliberately skips terminal
projects so a cancelled project's stale tasks do not flag forever (`:48-53`).

Its only consumers are the Action list (`lib/actions/generate.ts:59`, consumed by
`lib/actions/signals.ts:280-297`) and the notification sweep
(`lib/notifications/project-deadline-sync.ts:52`). **No UI component calls it.**

`isOverdue()` (`components/clients/projects/shared.tsx:42-50`) is a bare "is this date before
today" boolean. It has no due-soon concept, no days count, no owner, and no awareness of
project status. It feeds the entire UI: `ProjectsTab.tsx:435`, and `ProjectView.tsx:129`,
`:296`, `:370`, `:439`.

**A real rendering bug follows from the duplication.** Four of the five `isOverdue()` call
sites add their own completion guard — `&& !complete && !done` (`ProjectsTab.tsx:435`),
`&& !complete` (`ProjectView.tsx:129`), `&& !mComplete` (`:296`), `&& !isDone` (`:370`).
`ProjectView.tsx:439` has none. That call site is inside the `card` renderer of `TaskBoard`,
and `TaskBoard` renders one column per configured task status including the terminal "done"
column (`ProjectView.tsx:477`, with `done` marked `terminal: "done"` in
`lib/projects/config.ts:69`). **A completed task with a past delivery date renders red in the
Done column.** The guard is a convention that four authors remembered and one did not, which is
what a duplicated rule reliably produces.

**"Due soon" exists everywhere except where the work is done.** The notification body is built
as `N overdue · M due soon` (`project-deadline-sync.ts:71-77`). The Action list emits
`Overdue — …` / `Due soon — …` titles at `high` / `medium` priority
(`signals.ts:295-297`). The tab has exactly two visual states: red, or nothing.

**The tab and the notifications can disagree about the same task.** Because of the cascade
guard (`deadlines.ts:53`), an open, past-due task under a **cancelled** project is silently
excluded from the domain rule — but `ProjectView.tsx:439` renders it red anyway. Note that
`cancelled` is `terminal: "complete"` (`config.ts:55`), so this is not a rare case.

**There is no count of anything that is slipping.** The only badge on the tab is
`projects.length` (`ProjectsTab.tsx:312`) — total projects, not exposure.

**The progress bar measures throughput and is read as health.** `projectProgress()`
(`shared.tsx:63-74`) is a task-completion ratio. A project at 90% with an overdue critical task
looks healthier than one at 40% that is on schedule. The bar also turns green purely on
`complete = progress.total > 0 && progress.done === progress.total` (`ProjectsTab.tsx:433`),
independent of dates. A project with no tasks reads 0% in the drawer (`ProjectView.tsx:137`)
but hides the bar entirely in the table (`ProjectsTab.tsx:448`).

**Colour is the only carrier of meaning, and it is hardcoded.** The four files under
`components/clients/projects/` contain **24 raw hex literals**. On the lateness path
specifically: `ProjectView.tsx:129`, `:296`, `:370`, `:439` and `ProjectsTab.tsx:459` all use
raw `#B23A57`. The rest are the success green `#2DB47A` (`ProjectsTab.tsx:438`, `:444`, `:451`;
`ProjectView.tsx:89`, `:135`, `:291`, `:352`, `:359`), destructive affordances
(`shared.tsx:186`, `:297`, `ProjectsTab.tsx:339`, `ProjectView.tsx:303`, `:377`), all four form
error messages (`forms.tsx:146`, `:214`, `:332`, `:405`), the demo badge
(`ProjectsTab.tsx:313`) and the type-dot palette (`ProjectsTab.tsx:479`). This is not a style
preference. The token
`--color-danger-fg` is `#B23A57` in light mode (`app/globals.css:148`) but `#EE8AA3` in dark
mode (`:248`), and the stylesheet states the rule explicitly: *"Any component using the token
trio re-themes for free; hardcoded hex does not"* (`:239-242`). **The overdue state is
currently unreadable in dark mode**, and it is conveyed by colour alone, which
`lib/today/due.ts:27-28` already identifies as a WCAG 1.4.1 failure for exactly this case.

**Signal already solved the language problem once.** `lib/today/due.ts` is titled "Due-date
language, in one place", returns text *and* tone (`dueLabel()`, `:29`), pins both sides to
midnight UTC so a task due today cannot flip to overdue on the viewer's clock (`:20-25`), and
exposes `DUE_TONE` (`:43`). It is used by `components/tasks/TaskDetail.tsx:141` and the
Expansion surface. The Projects tab does not use it.

### Consequence

**Operational.** The tab cannot be used for triage, so the triage happens in the email instead
— and the email links back to a tab that does not show the items it named. A completed task
rendering red in the Done column teaches users that red on this tab is unreliable, which
devalues every genuine red on the same screen.

**Commercial.** Delivery slippage is one of the strongest leading indicators of a bad renewal.
Signal currently detects it correctly in the domain layer and then declines to show it on the
one surface where the owner is already looking.

### Evidence

Every claim above is read from the current implementation on 2026-08-18 at the cited
file:line. The prior review `docs/specs/projects/project-management-review.md` (2026-08-08)
independently verified the surrounding structure and remains accurate, except that its §1.1
correction to `docs/product/projects/README.md` has still not been applied.

### Assumptions

- That CSMs and implementation owners want the same tab. The prior review's open question 1
  ("who is the primary user — CSM or Implementation?") is **not settled**, and this
  specification deliberately does not settle it: everything below serves both, because both
  need the same first answer.
- That the count of projects per account is small (single digits). The table recommendation
  depends on this. It is consistent with the tab having shipped with no filtering, sorting or
  search, but it is not measured — Signal has no product analytics SDK.

---

## 3. Product outcome

A CSM or implementation owner opening an account can tell within five seconds whether any
delivery work is late or about to be, how much of it, and who owns it — and can reach the
specific item in one click. The tab, the Action list and the daily email describe the same
items using the same words, because they run the same rule.

---

## 4. Users and jobs

| Role | Context | Job to be done | Decision required | Current workaround | Desired result |
|---|---|---|---|---|---|
| **CSM (Operator)** | Opening an account before a call or a renewal review | Is delivery slipping here, and can I speak to it? | Do I raise it with the client, or escalate internally? | Open every project drawer; or read the email and trust it over the tab | A slippage summary at the top of the tab, and a due state on every row |
| **Implementation owner** | Working their own queue across accounts | Which of my items misses next? | What do I work on now? | The daily email, then hunt for the item | Owner visible on the row; the same item wording as the email |
| **CS Manager** | Reviewing a CSM's book | Where is delivery exposure concentrated? | Where do I intervene? | None on this tab — no cross-account view exists | Out of scope here (see `R-2`, §6 Non-goals) |
| **Guest** | Read-only stakeholder | Understand delivery state | None | Same tab, no controls | Identical information, no mutation controls |

---

## 5. Recommendation

### 5.1 The central question: does the tab stay a table?

**Yes. Keep the table. Do not convert the project list to a board.** Four reasons, in order of
weight:

1. **The board metaphor is already used one level down, correctly.** `TaskBoard`
   (`ProjectView.tsx:477`) renders tasks as a kanban keyed on task status, and
   `lib/projects/types.ts:22` documents status as *"also the kanban column the card sits in"*.
   Putting a second board above it means one screen with two boards at two altitudes keyed on
   two different status vocabularies. That is a duplicate representation, and the coherence
   check exists to prevent exactly this.
2. **A board answers "what stage is this in". The tab's question is "what is late".** Grouping
   projects by status buries the delivery date inside a card, and the delivery date is the
   payload. Status is already one glanceable column and does not need six columns of width.
3. **The width is not there.** The tab renders inside the Client Profile, which already carries
   ten tabs. The prior prototype's own first open question was that six columns plus a two-line
   project name overflow at profile width. Cards make that worse, not better.
4. **The prior review already settled the adjacent structural questions** — status-as-column
   and lightbox-not-route were both marked "correct" and "would not change"
   (`project-management-review.md` §4). Reversing them needs new evidence, and none has
   appeared.

**But the table changes job.** Today it lists projects. It should triage them. Concretely: a
slippage summary line above the table, a due state that carries words on every row, and the
next milestone merged into the delivery column. The reimagining is in what the table leads
with, not in replacing the instrument.

**Rejected alternative — adopt the `/scratch-work` "Work" tab now.** That prototype
(`docs/specs/projects/work-tab-for-review.md`, `app/scratch-work`, `lib/work/today-rule.ts`)
proposes renaming the tab to Work and merging the presentation of two task systems. It is a
good direction and it is explicitly still a prototype, not a decision. It should not be adopted
inside this change, because it bundles the unresolved two-task-systems question (`R-6`) with a
rendering correction that is independently correct and much cheaper. Everything specified here
is compatible with Work being adopted later: the lateness rule and the due-date language are
the same either way.

### 5.2 Lateness: one definition, one vocabulary

**Unify on `computeProjectDeadlines()` as the single rule, and `lib/today/due.ts` as the single
language. Delete `isOverdue()` from `shared.tsx`.**

The rule decides *state*; the language renders *words*. This is deliberately two existing
modules rather than one new one — Signal already has at least four competing `dueLabel`
implementations (`lib/today/due.ts:29`, `lib/today/format.ts:169`,
`components/clients/AccountTasks.tsx:77`, `components/today/AddTaskModal.tsx:56`), and this
specification must not add a fifth.

Deleting `isOverdue()` is what fixes `ProjectView.tsx:439` **structurally**: the domain rule
already excludes done tasks (`deadlines.ts:62`), so the Done column cannot render a due state
at all. Adding a fifth `&& !isDone` guard would fix the symptom and leave the cause.

Three consequences must be accepted deliberately, not discovered later:

- **Milestones are not covered by the domain rule.** `computeProjectDeadlines()` reads project
  and task delivery dates only; it never looks at `Milestone.dueDate`. Unifying strictly would
  *remove* the milestone lateness currently rendered at `ProjectView.tsx:296`. See `OD-1` —
  blocking.
- **Terminal projects lose their red.** Under the cascade guard, tasks under a completed or
  cancelled project get no due state. Today they render red. See `OD-2` — blocking.
- **Project-level lateness gets stricter, not looser.** Today `ProjectsTab.tsx:435` suppresses
  overdue when all tasks are done (`complete`). The domain rule keys on project *status* only
  (`deadlines.ts:53`). So a project whose tasks are all done, whose delivery date has passed,
  and whose status is still "In progress" will now flag overdue. That is more honest — the
  project is late — but it changes signal volume. See `OD-3` — blocking.

### 5.3 What the progress indicator should communicate

**Keep the completion ratio, stop it being the only signal, and never let it imply schedule
health.** Two facts, kept visibly distinct per principle §4.2 (evidence before
interpretation):

- **The bar answers "how much is done"** — a throughput fact. It stays a task-completion ratio.
- **A due badge beside it answers "is it on time"** — a schedule fact, from the domain rule.

The bar must **not** render in the success tone while the project has any overdue item, because
that is the 90%-with-an-overdue-critical-task case rendering as healthier than a 40% project on
schedule.

**Rejected alternative — a composite project health score.** Blending completion and schedule
into one number would create a second definition of health on a product that already has one
(`docs/business-rules/health-scoring.md`), and would be unexplainable at the point of use. Two
facts side by side is the correct shape.

**What would change this recommendation:** baseline dates (`R-1`). Once a project carries the
date it was *first* committed to, the honest progress indicator is schedule variance, not a
task ratio, and this section should be revisited. That is why the bar is being corrected here,
not replaced.

### 5.4 Should milestones be visible above the drawer?

**Not as a list. Yes as exactly one fact: the next unmet milestone, merged into the Delivery
column.**

A milestone list on the tab reproduces the drawer's checklist view and forces a multi-line row.
But "what is the next checkpoint and is it late" is the second question a CSM asks after "is
this late", and it currently requires opening the drawer. Merging it into the existing Delivery
column — rather than adding a seventh column — is a direct answer to the prototype's own first
open question about overflow at profile width.

---

## 6. Scope

### Foundation

1. Delete `isOverdue()` from `components/clients/projects/shared.tsx`; remove all five call
   sites.
2. Derive due state in the Projects tab from `computeProjectDeadlines()`, indexed by item id
   for per-row lookup (a presentation adapter over the existing rule — **not** a new rule).
3. Render due state with `dueLabel()` / `DUE_TONE` from `lib/today/due.ts`: words plus tone,
   never tone alone.
4. Add a slippage summary above the table: overdue and due-soon counts for the account.
5. Add the next unmet milestone to the Delivery column.
6. Split the progress indicator into completion bar + due badge; suppress the success tone
   while overdue items exist.
7. Replace every raw hex in `components/clients/projects/` with design tokens.

### Later

- Baseline / committed delivery date and slippage (`R-1`) — the larger prize, needs schema.
- Making the hand-set "At risk" status produce a signal (`R-3`).
- Filtering and sorting the table, if account project counts turn out larger than assumed.
- Cross-account portfolio view (`R-2`).

### Non-goals

- **No board conversion of the project list** (§5.1).
- **No schema change.** No baseline dates, no `templateId`, no revision history in this change.
- **No merging of `project_tasks` and `today_tasks`** (`R-6`) and no "Work" rename (§5.1).
- **No project health score** (§5.3).
- **No change to notification or Action list copy** beyond what the shared rule already emits.
- **No change to the status or type vocabularies**, which are workspace configuration.

---

## 7. Information architecture

No new tab. No new route. The change is entirely within the existing Project Management tab and
its lightbox.

**On the surface (the tab):** slippage summary · project name and type · completion bar · due
badge · status · owner · delivery date with next milestone.

**Behind disclosure (the existing lightbox):** milestones, tasks, checklist and board views,
description, implementer, contact, templates — unchanged in structure.

**On another page:** anything cross-account (`R-2`).

The slippage summary sits between the toolbar and the table, and renders **only when there is
something to report** — an always-present "0 overdue" row is decoration and trains the eye to
skip the region where the real warning will later appear.

---

## 8. End-to-end flows

### Flow 1 — CSM opens an account with slipping delivery

**Trigger:** navigate to `/clients/[id]` → Project Management.
**Preconditions:** `canSeeClient` passes; the account has at least one project.
**System behaviour:** the server-rendered board is passed to the tab as today
(`ClientProfileTabs.tsx:293-301`); the tab computes deadline items once via
`computeProjectDeadlines(board, config)` and indexes them by id. No new fetch.
**Result:** summary reads e.g. "2 overdue · 1 due soon"; the affected rows carry a due badge
with words ("Overdue by 4 days", "Due in 3 days"); every other row shows a plain date.
**Failure behaviour:** if the config or board is empty, the summary is omitted and rows render
plain dates. Nothing throws.

### Flow 2 — Owner follows the daily email to the tab

**Trigger:** the deadline notification (`project-deadline-sync.ts:79-88`).
**Result:** the counts in the email and the counts in the summary match, because both are
`computeProjectDeadlines()` over the same board with the same config. Item wording matches the
Action list titles (`signals.ts:296`).
**Failure behaviour:** if the email was generated by the overnight cron and an item has since
been completed, the tab shows the current truth and the counts differ from the email. This is
correct and expected — the tab is live, the email is a daily snapshot. The summary states its
own basis ("as of now") so the discrepancy is explainable rather than alarming.

### Flow 3 — A task is marked done in the Done column

**Trigger:** drag to the Done column, or the checklist checkbox.
**System behaviour:** the existing optimistic mutation path (`ProjectsTab.tsx:188-203`) runs
unchanged. Because the due state is derived from the rule and the rule excludes done tasks
(`deadlines.ts:62`), the card's due badge disappears on the same optimistic tick.
**Result:** the Done column never shows a due state. The bug at `ProjectView.tsx:439` cannot
recur, because the code path that produced it no longer exists.

### Flow 4 — Guest views the tab

**Trigger:** a `guest`-tier user with scope admitting this account.
**System behaviour:** `canEditClient` returns false (`lib/auth.ts:190`), so `projectCanManage`
is false and every mutation control is withheld.
**Result:** identical summary, badges and counts. Read-only surfaces carry the same
information; they simply cannot act on it.

---

## 9. Functional requirements

| ID | Requirement | Observable behaviour |
|---|---|---|
| `FR-001` | `isOverdue()` is removed from `shared.tsx` and has no remaining callers | Grep for `isOverdue` in `components/clients/projects/` returns nothing |
| `FR-002` | The tab derives every due state from `computeProjectDeadlines()` | A project or task shows a due state if and only if the rule returns an item for it |
| `FR-003` | Due state renders words and tone, never tone alone | Every due indicator contains text ("Overdue by 4 days", "Due in 3 days"); removing colour loses no meaning |
| `FR-004` | A slippage summary shows overdue and due-soon counts for the account | Counts equal the length of the rule's output partitioned by `state` |
| `FR-005` | The summary is omitted when both counts are zero | An account with nothing slipping renders no summary region |
| `FR-006` | Each project row shows the next unmet milestone in the Delivery column | The earliest milestone by `dueDate` whose tasks are not all done; omitted when none exists |
| `FR-007` | The completion bar and the due badge are separate indicators | The bar reflects `projectProgress()` only; the badge reflects the rule only |
| `FR-008` | The completion bar does not use the success tone while the project has an overdue item | A 90%-complete project with an overdue task renders its bar in the neutral/accent tone |
| `FR-009` | No raw hex remains in `components/clients/projects/` | Grep for `#` colour literals in that directory returns nothing; overdue text is legible in dark mode |
| `FR-010` | A task in a terminal "done" status never renders a due state in any view | Checklist, board and table agree |
| `FR-011` | The tab performs no additional data fetch | The rule runs client-side over the board already passed as props |

---

## 10. Business rules

| ID | Rule | Inputs | Exceptions | Enforced where |
|---|---|---|---|---|
| `BR-001` | **There is exactly one definition of late.** A project or task is `overdue` or `due_soon` if and only if `computeProjectDeadlines()` returns an item for it | board, `ProjectConfig`, now | None | Domain — `lib/projects/deadlines.ts`, consumed by UI, Action list and notifications |
| `BR-002` | Thresholds are 7 days for projects and 2 days for tasks | `PROJECT_DUE_SOON_DAYS`, `TASK_DUE_SOON_DAYS` | Configurable only by code change | Domain (`deadlines.ts:13-14`) |
| `BR-003` | A terminal project is excluded, and so are its tasks | project status, `isProjectComplete()` | None — this is the cascade guard | Domain (`deadlines.ts:53`) |
| `BR-004` | A task in a `terminal: "done"` status is never late | task status, `isTaskDone()` | None | Domain (`deadlines.ts:62`) |
| `BR-005` | Due state is always accompanied by text | — | None | UI — `lib/today/due.ts` `dueLabel()` |
| `BR-006` | Completion ratio and schedule state are distinct facts and are never combined into one indicator | `projectProgress()`, rule output | None | UI |
| `BR-007` | Whole-day comparison, date component only | ISO dates | — | Domain. **See `OD-4`**: `deadlines.ts:31-39` uses local midnight; `lib/today/due.ts:20-25` uses UTC midnight |

`BR-001`–`BR-004` belong in `docs/business-rules/` once implemented — most likely a new
`delivery-deadlines.md`, since `dates-and-periods.md` covers period semantics rather than
work-item lateness.

---

## 11. Data requirements

**No new fields. No schema change. No migration.**

Every input already exists and is already maintained:

| Field | Meaning | Type | Required | Default | Source | Editable by | Validation | Downstream use |
|---|---|---|---|---|---|---|---|---|
| `Project.deliveryDate` | Target delivery / go-live | ISO date, nullable | No | null | Authored in-app | `canEditClient` | Existing | Rule, tab, Action list, notifications |
| `Project.status` | Config-driven status; also the kanban column | string | Yes | first non-terminal | Authored in-app | `canEditClient` | Existing | Cascade guard |
| `Task.deliveryDate` | Task due date | ISO date, nullable | No | null | Authored in-app | `canEditClient` | Existing | Rule, tab |
| `Task.status` | Config-driven task status | string | Yes | first non-terminal | Authored in-app | `canEditClient` | Existing | Done exclusion |
| `Milestone.dueDate` | Milestone checkpoint | ISO date, nullable | No | null | Authored in-app | `canEditClient` | Existing | `FR-006`; and `OD-1` if adopted into the rule |

**Who maintains this, and will they?** The CS and implementation teams already author all of
it, and the daily notification already depends on it being accurate. This specification adds no
field that requires new discipline — a deliberate choice, because the prior review's strongest
finding (`R-1`, no baseline) is precisely a case where a new field *would* be required, and it
is scoped out for that reason.

---

## 12. States and transitions

Per project or task item, as rendered on the tab:

| State | Meaning | Entry condition | Exit condition | Allowed actors | Side effects |
|---|---|---|---|---|---|
| `overdue` | Delivery date has passed and the item is not finished | `daysUntil < 0` and not excluded by `BR-003`/`BR-004` | Date moved forward, or item completed/cancelled | — (derived) | Action list `high`; notification line |
| `due_soon` | Inside the threshold window | `0 <= daysUntil <= threshold` | Date moved, item completed, or window passed into `overdue` | — (derived) | Action list `medium`; notification line |
| `scheduled` | Dated, outside the window | `daysUntil > threshold` | Window reached | — (derived) | None — plain date |
| `undated` | No delivery date | date is null | A date is set | — (derived) | None. **Never rendered as on-track** |
| `finished` | Terminal status | `isProjectComplete()` / `isTaskDone()` | Reopened | `canEditClient` | Clears any signal and notification |

**No state is stored.** Every state above is derived on read from data that already exists.
This is deliberate: a stored lateness flag would be a second source of truth and would go stale
between cron runs.

Note `undated` is a genuine gap, not a healthy state. An undated project cannot be late, which
means delivery work with no date is invisible to every surface. That is worth a future signal
and is recorded in §22.

---

## 13. Permissions

| Action | Super Admin | Admin | Operator | Guest |
|---|---|---|---|---|
| See the tab, summary, counts, badges | Yes (in scope) | Yes (in scope) | Yes (in scope) | Yes (in scope) |
| Open the project lightbox | Yes | Yes | Yes | Yes |
| Change status, owner, dates | Yes | Yes | Yes | **No** |
| Create / delete project, milestone, task | Yes | Yes | Yes | **No** |
| Bulk status / owner / delete | Yes | Yes | Yes | **No** |

**Server-side gate.** The read gate is `canSeeClient` (`lib/auth.ts:175`), applied when the
profile loads the account. The write gate is `canEditClient` (`lib/auth.ts:187`), which returns
false for the `guest` tier (`:190`) and otherwise requires the account to be in the user's
scope. Every mutating server action must gate on `denyClientWrite(clientId)`
(`lib/auth.ts:210`), which re-resolves the client and re-checks `canEditClient` — it exists
precisely because the profile's actions had all converged on guarding with the *read* gate
(`:197-209`). Its null return means "may write".

**Scope.** `all` admits every account; `assigned` and `selected` are filtered by
`scopeAdmits` (`lib/auth.ts:180`, `:194`). A user who cannot see the account never reaches the
tab, and `denyClientWrite` deliberately returns the same message for "absent" and "not
visible" (`:213-215`) so ids cannot be enumerated.

**This specification changes no permission.** `ProjectsContext.canManage`
(`shared.tsx:31`) is fed from `projectCanManage` (`ClientProfileTabs.tsx:301`) and continues to
control only the *visibility of controls*. A hidden control is not a permission; the gate above
is. The summary, counts and badges are **read** information and are shown to every role that
can see the account, including guests — withholding them would hide information from the people
most likely to be chasing it, with no security benefit.

---

## 14. Time behaviour

- **"As of" date.** The tab is live: the rule runs at render with `now = new Date()`. The
  notification is a daily snapshot keyed to `todayKey` (`project-deadline-sync.ts:40-41`,
  `:80`). The summary must state that it is current, so a mismatch with an overnight email is
  explainable rather than a perceived defect.
- **Today-relative.** `daysUntil` is a whole-day difference, date component only
  (`deadlines.ts:31-39`).
- **Timezone.** Unresolved and material — see `OD-4`. `deadlines.ts` pins to *local* midnight
  via `setHours(0,0,0,0)`; `lib/today/due.ts:20-25` pins to *UTC* midnight and states the
  reason ("a task due today must not flip to overdue because of the viewer's clock time"). If
  the tab renders the rule's state with the other module's labels, an item can in principle be
  labelled "Due today" while classified `overdue`, for viewers west of UTC.
- **Future-dated records.** Render as `scheduled`; a plain date, no badge.
- **Missing dates.** `undated`; never rendered as on-track.
- **Partial periods, comparison periods, forecasts.** Not applicable — every value here is
  **point-in-time**. Nothing in this specification is a period movement or a forecast, and no
  indicator may be read as one. Slippage over time requires baselines (`R-1`) and is out of
  scope.

---

## 15. Empty, loading and error states

| State | What is shown | Recovery action |
|---|---|---|
| No projects | Existing `EmptyState` (`ProjectsTab.tsx:349-354`), unchanged; no summary | "New project" when `canManage` |
| Projects, nothing slipping | Table with plain dates; **no summary region** | None needed |
| Projects, all undated | Table; no summary; dates read "—" | Open a project to set a delivery date |
| Project with no tasks | Completion bar omitted in the table (existing behaviour, `:448`); drawer shows 0% — **to be aligned**, both should omit rather than assert 0% | Add a milestone and tasks |
| No milestones | Existing drawer empty state (`ProjectView.tsx:158-164`); Delivery column shows the date alone | Add milestone |
| Loading | Server-rendered with the profile; no separate loading state | — |
| Config unavailable | `normalizeProjectConfig()` falls back to defaults (`config.ts:112-117`), so the board can never render zero columns | None — automatic |
| Task in an unknown status | Existing "Uncategorized" column (`ProjectView.tsx:478-479`). Such a task is **not** late — its status is not a known done status, so the rule may return it. Confirm this reads sensibly | Reassign a valid status |

---

## 16. Notifications and automations

**No change to any automation.** This specification deliberately alters nothing in
`lib/notifications/project-deadline-sync.ts` or `lib/actions/signals.ts` — it makes the UI
agree with them.

| Trigger | Recipient | Channel | Timing | Deduplication | User control | Audit record |
|---|---|---|---|---|---|---|
| Item overdue or due soon | Item owner (falling back to project owner) + account CSM | Notification / action-list row | Daily cron | One row per (recipient, client, day), id `pd-<client>-<email>-<todayKey>` | None today | Notification row |

Two second-order effects must be acknowledged, because they are commercial-facing:

- If `OD-1` adopts milestones into the rule, notification and Action list **volume rises**. The
  recommendation in `OD-1` avoids this by having consumers filter.
- `OD-3` (project lateness no longer suppressed by task completion) **will** raise the count of
  flagged projects, with no code change to the consumers. This must be a decision, not a
  surprise.

Nothing here silently changes a commercial outcome, a financial value, ownership, a canonical
definition, or another person's commitments.

---

## 17. Analytics

**None specified.** Signal has no product analytics SDK, so the useful measures here — does the
summary reduce time-to-first-click, do users still open every drawer — **cannot be observed**
without one. Specifying events that cannot be emitted would be fiction.

What can be observed cheaply, without an SDK:

- Whether the tab's counts and the notification's counts agree, verifiable by test rather than
  telemetry.
- Whether `isOverdue` still exists, verifiable by grep in CI.

---

## 18. Dependencies and impacts

**Components:** all four files in `components/clients/projects/` — `ProjectsTab.tsx`,
`ProjectView.tsx`, `shared.tsx` (deletion of `isOverdue`, plus raw hex at `:186`, `:297`) and
`forms.tsx` (raw hex in four error messages only; no lateness logic).
**Domain consumed:** `lib/projects/deadlines.ts` (unchanged unless `OD-1`),
`lib/projects/config.ts`, `lib/today/due.ts`.
**Unchanged but affected in behaviour:** `lib/actions/signals.ts`,
`lib/notifications/project-deadline-sync.ts` — only via `OD-3`'s volume change.
**Design tokens:** `app/globals.css` — no change needed; the tokens already exist and are
correct. This is adoption, not extension.
**Database entities:** none.
**Existing clients and records:** every account with projects is affected on next render. No
stored data changes, so nothing can be corrupted and nothing needs backfilling.
**Documentation:** `docs/product/projects/README.md` is stale in two independent places and
must be corrected by the documenter after this ships — it states the Action-list projects
signal is *"not yet implemented"* (it is, `signals.ts:280-297`, already flagged in the prior
review §1.1 and still uncorrected), and its Summary describes the tab as *"rendered as a kanban
board"* when the project list is a table and only tasks inside the drawer are a board.

---

## 19. Migration and compatibility

**No migration.** No schema change, no backfill, no defaults for old records, no historical
preservation concern — every value is derived on read from fields that already exist.

**Records that will never have the new data:** none, by construction.

**Rollback:** revert the components. Because the domain rule is untouched, a rollback cannot
leave the Action list or notifications in an inconsistent state.

**Behavioural compatibility — what users will notice on day one**, all intentional:

1. Completed tasks stop rendering red in the Done column (the bug).
2. "Due soon" states appear where previously there was nothing.
3. Tasks under cancelled or completed projects stop rendering red (`OD-2`).
4. Some projects whose tasks are all done but whose date has passed start flagging (`OD-3`).
5. Overdue text becomes legible in dark mode.
6. Milestone lateness changes or disappears depending on `OD-1`.

---

## 20. Acceptance criteria

- [ ] `AC-001` — Given a task in a `terminal: "done"` status with a delivery date in the past, When the board view renders it in the Done column, Then no due state, badge or danger colour appears on the card.
- [ ] `AC-002` — Given an account with 2 overdue and 1 due-soon item, When a CSM opens the tab, Then a summary reads "2 overdue · 1 due soon" and the counts equal `computeProjectDeadlines()` partitioned by `state`.
- [ ] `AC-003` — Given an account with nothing overdue or due soon, When the tab renders, Then no summary region is shown.
- [ ] `AC-004` — Given a project due in 3 days, When the row renders, Then it shows a due-soon badge whose text reads "Due in 3 days" — not colour alone.
- [ ] `AC-005` — Given the viewer's OS is in dark mode, When an overdue badge renders, Then its colour resolves from `--color-danger-fg` and meets contrast; no raw hex remains in `components/clients/projects/`.
- [ ] `AC-006` — Given a **cancelled** project with an open, past-due task, When the tab and the drawer render, Then neither shows a due state for that task, and the tab's counts match the notification's counts for the same board and clock.
- [ ] `AC-007` — Given a project 90% complete with one overdue task, When the row renders, Then the completion bar does not use the success tone and an overdue badge is present.
- [ ] `AC-008` — Given a project with no tasks, When the row renders, Then no completion bar asserts 0%.
- [ ] `AC-009` — Given a project with milestones, When the row renders, Then the Delivery column names the next unmet milestone; and when none exists, Then it shows the delivery date alone.
- [ ] `AC-010` — Given a `guest`-tier user with scope admitting the account, When they open the tab, Then the summary, counts and badges are fully visible and no mutation control is rendered; And when a mutating action is invoked directly, Then `denyClientWrite` refuses it.
- [ ] `AC-011` — Given a task is marked done optimistically, When the optimistic tick renders, Then its due badge disappears without waiting for the server.
- [ ] `AC-012` — Given the repository after this change, When `isOverdue` is searched for under `components/clients/projects/`, Then there are no matches.
- [ ] `AC-013` — Given `computeProjectDeadlines()`, Then unit tests exist covering: overdue, due soon, exactly-at-threshold, due today, terminal project cascade, done task, null dates, and owner fallback. (`lib/projects/` currently has **no tests** — the prior review's `F-9`.)

---

## 21. Open decisions

| Decision | Options | Recommendation | Consequence of delaying |
|---|---|---|---|
| **`OD-1` — Milestone lateness. BLOCKING.** The rule ignores `Milestone.dueDate`; the UI colours it today (`ProjectView.tsx:296`) | (a) Drop milestone lateness from the UI; (b) extend the rule with `kind: "milestone"` and let consumers filter; (c) leave a second rule for milestones | **(b).** Extend the rule so there is still exactly one definition, but have the notification and Action list consumers filter milestones out in the foundation, so volume does not rise. (c) recreates the problem this specification exists to remove | Cannot implement — either milestone dates silently lose their state, or the duplicate rule survives |
| **`OD-2` — Terminal-project cascade in the UI. BLOCKING.** Tasks under cancelled/completed projects will stop showing red | (a) Accept — the tab matches the rule; (b) special-case the UI to keep showing them | **(a).** The right answer to "this task under a cancelled project is old" is *the project is cancelled*, not a red date. Make the terminal state legible on the row instead — and note that a **cancelled** project currently renders as a success: green check and green row tint in the table (`ProjectsTab.tsx:444`, `:438`) and a green check in the drawer header (`ProjectView.tsx:89`), because `cancelled` is `terminal: "complete"` (`config.ts:55`). Cancelled is not success; correct it in the same pass | Cannot implement — this is the specific case where tab and notifications disagree today |
| **`OD-3` — Project lateness no longer suppressed by task completion. BLOCKING.** More projects will flag | (a) Accept the domain rule as-is; (b) add task-completion suppression into the rule, changing notifications too | **(a).** A project past its delivery date with a non-terminal status *is* late; someone has not closed it out. (b) would weaken the Action list to protect the UI | Cannot implement — the two definitions differ here, so one must win |
| **`OD-4` — Local vs UTC midnight.** `deadlines.ts:31-39` uses local; `lib/today/due.ts:20-25` uses UTC and documents why | (a) Move `deadlines.ts` to UTC; (b) keep both and accept edge-case disagreement | **(a)**, as a small separate change with tests. Not blocking for this specification — it affects only viewers west of UTC near midnight — but it should not sit unrecorded | Rare "Due today" / `overdue` mismatches persist |
| **`OD-5` — Tab name.** Tab is "Project Management" (`ClientProfileTabs.tsx:220`), heading is "Projects" (`ProjectsTab.tsx:311`), prototype proposes "Work" | (a) Align both to "Projects" now; (b) leave until the Work decision | **(b).** Do not spend the rename on a half-decision. Not blocking | Minor inconsistency persists |

---

## 22. Risks and trade-offs

**The strongest argument against this specification:** it improves the *rendering* of a tab
whose deepest problem is that it cannot measure slippage at all. The prior review was right
that `R-1` (baseline dates) is the more valuable change, and someone could reasonably say this
is polishing while the real gap stays open. The counterargument is that `R-1` needs a schema
change, a migration and a decision about revision history, while this removes a live bug, a
dark-mode failure, an accessibility failure and a genuine contradiction between two surfaces —
at no schema cost. It also makes `R-1` *easier*, because after it there is one place where
lateness is defined, which is where a baseline would attach.

**What this commits Signal to.** `computeProjectDeadlines()` becomes a user-facing contract,
not just a cron input. Its thresholds and its cascade guard become visible behaviour that users
will notice and ask about. Changing them later changes the tab, the Action list and the email
together — which is the point, but it does raise the cost of changing them casually.

**What this makes harder.** Rendering a due state the domain rule does not model now requires
changing the domain rule, which touches three consumers. That friction is deliberate and is the
mechanism that prevents a sixth definition of late — but it will feel slow the first time
someone wants a small, tab-only affordance.

**Counterargument to keeping the table.** If accounts routinely carry 15+ projects, the table
becomes a scroll and grouping starts to earn its place. This is the assumption in §2 that is
not measured, and the recommendation should be revisited if it turns out false. Filtering and
sorting (§6 Later) is the cheaper first response, not a board.

**Counterargument to the progress split.** Two indicators per row is more visual load than one,
on a table that already carries a name, type, bar, status, owner, date and now a milestone.
`OD-5`'s width concern is real. If it does not fit, the completion bar is the element to drop —
schedule beats throughput.

**Residual gap, deliberately not closed.** An undated project is invisible to every lateness
surface. Nothing in this specification changes that, and no amount of unification will: a rule
about dates cannot flag a record that has none. That is a candidate signal in its own right.

---

## Coherence check

- **Duplicate concept / conflicting calculation** — this specification exists to *remove* one.
  It deletes `isOverdue()` rather than adding to it, and adopts `lib/today/due.ts` rather than
  writing a fifth `dueLabel`.
- **Second source of truth** — none. No lateness state is stored; everything derives on read.
- **Another definition of risk or health** — explicitly refused (§5.3). No project health score.
- **Another action-management system / another timeline** — none. No change to the Action list
  or notifications beyond volume noted in `OD-3`.
- **Permission bypass** — none. No gate changes; §13 restates the existing server-side gates
  and adds nothing that is enforced in the UI alone.
- **A field users will not maintain** — none; no new fields (§11).
- **An output with no downstream action** — the summary links to the items; each badge sits on
  a row that opens the record.
- **A page mixing unrelated jobs** — no new tab; the Client Profile already has ten (§7).
- **Canonical vs per-client storage** — not applicable; thresholds stay in code, statuses stay
  in `workspace_config`.

**One accepted exception:** `FR-006`'s "next unmet milestone" is a small derived notion that
exists only in the UI. It is not a new business rule and is not stored, but it is a computation
the domain layer does not own. If milestones enter the rule under `OD-1`, this should move
there rather than persist as a component-local helper.

---

## Evidence

Read on 2026-08-18:

`lib/projects/deadlines.ts` · `lib/projects/types.ts` · `lib/projects/config.ts` ·
`components/clients/projects/shared.tsx` · `components/clients/projects/ProjectsTab.tsx` ·
`components/clients/projects/ProjectView.tsx` · `lib/actions/generate.ts` ·
`lib/actions/signals.ts` (deadline signal region) ·
`lib/notifications/project-deadline-sync.ts` · `lib/auth.ts` · `lib/today/due.ts` ·
`lib/work/today-rule.ts` · `components/today/Projects.tsx` ·
`components/clients/ClientProfileTabs.tsx` · `app/globals.css` ·
`app/(app)/clients/[id]/project-actions.ts` · `docs/product/projects/README.md` ·
`docs/specs/projects/project-management-review.md` ·
`docs/specs/projects/work-tab-for-review.md` · `docs/_templates/product-specification.md`

**Could not verify:** how many projects a real account carries (no analytics SDK, no production
access) — the table recommendation rests on this. Whether the primary user is the CSM or the
Implementation team — the prior review's open question 1, still open, and it would change the
relative priority of `R-2` over this work.

---

## Documenter handoff

Once implemented, `signal-product-documenter` updates:

- **Feature documents:** `docs/product/projects/README.md` — the tab's behaviour; **and
  correct two existing errors**: the Action-list projects signal is implemented
  (`signals.ts:280-297`), and the project list is a table, not a kanban.
- **Business rules:** new `docs/business-rules/delivery-deadlines.md` for `BR-001`–`BR-004`;
  cross-reference from `dates-and-periods.md`.
- **Data model:** no change.
- **Glossary terms:** "Overdue", "Due soon", "Delivery date" — align with the domain rule's
  meanings so the tab, Action list and email share one vocabulary.
- **Decision records:** one is warranted — *"One definition of late, owned by the domain layer"*
  — at the next number after `0017`.
- **Changelog:** under the release that ships it.
- **Must not be documented until it ships:** the summary, the due-soon UI states, the milestone
  column, the progress split, and any `OD-1` change to `computeProjectDeadlines()`. None of it
  is current behaviour.
