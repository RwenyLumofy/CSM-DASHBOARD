# Project Management — product review

> Self-contained review of the Project Management tab, written to be shared and argued with.
> Every claim is marked **verified** (read from code on 2026-08-08) or **from docs** (taken
> from `docs/product/projects/README.md`, last verified at commit `4214349` and stale in at
> least one place — see §1.1).

**Date:** 2026-08-08 · **Area:** Client Profile → Project Management

---

## 1. What exists today

**Verified.** A CSM-owned delivery tracker on each account: **Project → Milestone → Task**.

| Surface | Behaviour |
|---|---|
| **List** | Full-width table — checkbox, Project, Status, Owner, Delivery. Row selection with bulk actions, inline status and owner editing via portal menus |
| **Detail** | A lightbox up to 1160px, two modes: **Checklist** (milestones → task rows) and **Task board** (kanban by task status) |
| **Mutations** | Optimistic against local state, reconciled with the server. A pending-mutation guard stops an in-flight refresh reverting a concurrent update |
| **Templates** | A project can be saved as a workspace-global template. Template tasks carry day offsets from the project start date, so applying one computes real dates |
| **Config** | 6 project statuses, 6 project types, 4 task statuses, 8 task types — all workspace configuration, not code. Adding a status adds a column |

**Fields.** `Project`: name · description · type · status · startDate · deliveryDate ·
ownerEmail · implementerEmail · contactId · sortOrder · completedAt.
`Milestone`: name · description · dueDate · sortOrder.
`Task`: name · description · type · status · startDate · deliveryDate · ownerEmail ·
completedAt.

**Reach beyond the tab.** Today's projects lane · project-deadline notifications ·
Action-list signals (§1.1) · `getAllProjectBoards()` already loads every account's board.

### 1.1 The documentation is stale on one point

`docs/product/projects/README.md` states the Action-list projects signal is *"not yet
implemented"*. **It is implemented** — [`lib/actions/signals.ts:280-298`](../../../lib/actions/signals.ts)
emits one action per overdue or due-soon project and task, category `project`, with the
delivery date, days-until and owner retained as facts. Thresholds: **7 days** for projects,
**2 days** for tasks.

Worth correcting in the docs, and worth noting that the same doc's other limitations may also
have moved.

---

## 2. Findings

### F-1 · A project cannot tell you whether it is slipping — **the most serious**

**Verified.** There is no baseline. `Project` has `startDate` and `deliveryDate`; `Milestone`
has `dueDate`. Change a delivery date and the previous one is gone. No `plannedDeliveryDate`,
no revision history, nothing in the schema.

So the single most important question about a delivery project — *is this later than we said
it would be, and by how much?* — is unanswerable. A project can be moved four times and still
read "on track", because on-track is measured against the date it was last moved to.

This also breaks the template promise: a template computes dates from day-offsets, but nothing
records what those computed dates originally were.

### F-2 · No portfolio view — and the data access already exists

**Verified.** Projects are visible per account, or through Today's *personal* lane. A CS lead
cannot answer *"what delivery work is running across the book, and what is late?"* — which is
the primary manager question and the one Signal exists to answer everywhere else.

`getAllProjectBoards()` already returns every account's board and is called by Today, the
action generator and the deadline sync. **The data layer is done; only the surface is
missing.** That makes this considerably cheaper than it looks.

### F-3 · "At risk" is a status that does nothing

**Verified.** `at_risk` is one of six project statuses a CSM sets by hand. The deadline engine
keys on dates only — `computeProjectDeadlines()` returns overdue and due-soon items — so a
project explicitly marked **At risk** with a delivery date three weeks out produces no signal,
no action, no effect on health, and no place on Today.

A human has made a judgement and the system ignores it. That is the opposite of how CS Pulse
is treated, where a CSM's rating is a weighted health input.

### F-4 · Two task systems, both called Tasks, both on the same profile

**Verified.** `project_tasks` lives inside a project. `today_tasks` is the account Tasks sheet
and the Today board. On one client profile a CSM sees a **Tasks** button and a **Project
Management** tab containing tasks — different tables, different UIs, no relationship, no way
to promote one to the other.

The docs also name a third, unwritten `playbook_tasks`.

This is the same failure as the two use-case lists that were fixed earlier, and worse, because
both are literally called tasks.

### F-5 · Projects are an island

**Verified.**

- `UseCaseImplementation.missionId` exists and is documented as *"a linked project/mission id,
  when one exists"* — **nothing writes it.** The link is modelled and unbuilt.
- A project of type `onboarding` has no relationship to `client.status === "onboarding"`, to
  the `onboarding_period` health metric, or to the health model's Implementation lifecycle state.
- A project of type `renewal` or `recovery` does not appear in any renewal or risk view.

So delivery work — often the single biggest driver of whether an account succeeds — sits
outside health, outside renewal, and outside the use cases it is presumably delivering.

### F-6 · Template performance is unmeasurable

**Verified.** `Project` has no `templateId`. A project created from a template keeps no
reference to it. So *"does our standard onboarding template actually deliver on time?"* cannot
be asked, and templates cannot improve from evidence.

### F-7 · Client contact duplicates stakeholder profiles

**Verified.** `Project.contactId` points at `client_contacts` — the HubSpot-synced record —
while Signal's richer `stakeholder_profiles` carry influence, sentiment, decision authority
and engagement status. A project's client-side owner is exactly the person a CSM would want
the relationship read on, and the two records do not meet.

### F-8 · No effort, capacity or dependencies

**From docs.** No effort estimates, no capacity view, no dependencies between projects or
milestones. A manager cannot see that one implementer holds six live projects.

### F-9 · No tests

**From docs.** `lib/projects/*` has none. `computeProjectDeadlines()` is pure and drives both
notifications and actions — it is the obvious first candidate.

---

## 3. Recommendations

### Tier 1 — do these

**R-1 · Add a baseline to every dated thing.** `plannedDeliveryDate` on project, task and
milestone, set once on creation (or when a template is applied) and never overwritten. Every
date change writes a revision row: who, when, from, to, why.

Unlocks: slippage per project · "moved three times" as a signal · template performance (with
R-4) · an honest answer to "are we late".

**R-2 · Give managers a portfolio view.** A cross-account project surface — by owner, by
implementer, by type, by status, by lateness. `getAllProjectBoards()` already provides the
data; this is a page, not a pipeline.

Answers: what is running, what is late, who is carrying too much, which accounts have no
delivery work at all.

**R-3 · Make "At risk" mean something.** A project a CSM has marked at risk should raise an
Action-list signal in its own right, independent of dates. Two lines in `signals.ts` beside
the existing deadline rule.

### Tier 2 — coherence

**R-4 · Record `templateId` on projects created from a template.** One column. Enables R-1's
payoff: which templates deliver on time and which are optimistic fiction.

**R-5 · Wire the project ↔ use-case link that is already modelled.** `missionId` exists on
`UseCaseImplementation`. Let a project be attached to a client use case, and show on the use
case which project is delivering it. This closes the loop the Usage work opened — a use case
recorded as live, with no product activity **and** no project delivering it, is a very
different account from one where delivery is under way.

**R-6 · Decide the two-task-systems question.** Options, with a recommendation:

| | |
|---|---|
| (a) Merge — `project_tasks` becomes `today_tasks` with a project reference | Cleanest model; largest migration; risks losing the milestone grouping |
| (b) **Keep both, name them differently, and let a project task appear on Today when it is assigned and dated** | **Recommended.** Preserves the structures, ends the collision, gives project work a route to a CSM's daily board |
| (c) Leave as is | Two things called Tasks on one page stays a permanent tax on every new person |

### Tier 3 — later

Effort and capacity · dependencies · linking `Project.contactId` to stakeholder profiles ·
tests for `computeProjectDeadlines()` first.

---

## 4. What I would not change

- **Status as the kanban column.** One concept, no separate board position. Correct.
- **Config-driven types and statuses.** Adding a status adds a column, with no deploy.
- **Optimistic mutations with a pending guard.** Well-built; do not regress it.
- **Day-offset template tasks.** Applying a template computing real dates is the right shape.
- **The lightbox rather than a route.** A project is an object inside an account, not a place.

---

## 5. Open questions

1. **Who is the primary user of projects — the CSM or the Implementation team?** The model
   carries both `ownerEmail` and `implementerEmail`, but the only surface is a CSM tab. If
   Implementation is the real user, the portfolio view (R-2) matters more than the account tab.
2. **Should a project be able to exist without an account?** Everything is client-scoped.
   Internal delivery work with no client has no home.
3. **Is "Mission" a distinct concept or another word for project?** `missionId` suggests one;
   nothing else in the codebase defines it.
4. **Should completing a project affect health?** A completed onboarding project is real
   evidence of time-to-value; today it changes nothing.
5. **Do project deadlines belong on the client's timeline** alongside usage and health, so a
   CSM can see that adoption rose after go-live?

---

## 6. Priority, if only three things happen

1. **R-1 baseline dates** — without them the tab cannot answer the question it exists to
   answer.
2. **R-2 portfolio view** — the manager gap, and the data layer is already built.
3. **R-3 at-risk signal** — smallest change here, and it stops the system ignoring a human
   judgement.

---

## 7. Files worth reading first

`lib/projects/types.ts` — the model · `lib/projects/config.ts` — the default statuses and
types · `lib/projects/deadlines.ts` — the pure deadline layer behind both notifications and
actions · `components/clients/projects/ProjectsTab.tsx` and `ProjectView.tsx` — the surfaces ·
`lib/repo/projects.ts` — including `getAllProjectBoards()` · `lib/actions/signals.ts:280` —
the deadline signal · `docs/product/projects/README.md` — accurate except §1.1.
