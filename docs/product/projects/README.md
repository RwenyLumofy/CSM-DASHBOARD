# Project Management

**Status:** Partially verified

## Summary

A CSM-owned delivery tracker on each account: **Project → Milestone → Task**, rendered as a
kanban board with config-driven types and statuses.

## Purpose

Implementation and delivery work had no home. None of it is in HubSpot, and it is not
support work, so neither source system could hold it.

## Entry points

- **Route:** `/clients/[id]` → **Project Management** tab
- **Config:** Settings → Projects (options and templates)
- **Surfaces in:** Today's projects lane, and project-deadline notifications.

## Shape

```
Project ─┬─ Milestone ─┬─ Task
         │             └─ Task
         └─ Milestone ── Task
```

**None of it is synced from HubSpot** — it is authored in-app by the CS team.

Dates are ISO strings: the database stores `timestamptz` and the repo maps to ISO, so
client components never touch `Date` objects — matching how `Deal` and `Contact` are
handled.

## Fields

`Project`: id · clientId · name · description · **type** (config-driven id) ·
**status** (config-driven id — *also the kanban column the card sits in*) · startDate ·
target delivery / go-live date · owner.
`Milestone` and `Task` follow in `lib/projects/types.ts`.

## Configuration

Project **types**, **statuses** and **templates** are workspace configuration, not code
(`lib/projects/config.ts`, `ProjectOptionsManager`, `ProjectTemplatesManager`). Adding a
status adds a kanban column. `isProjectComplete()` decides which statuses count as done.

## Business rules

- **Status is the column.** There is no separate board-position concept.
- **Completion is config-driven** — `isProjectComplete(status, config)`.
- **Deadlines drive notifications.** `computeProjectDeadlines()` produces overdue and
  due-soon items, aggregated per recipient by
  `syncProjectDeadlineNotifications()` in the daily client-actions job.
- **Project tasks are not Today tasks.** `project_tasks` and `today_tasks` are separate
  systems with separate UIs. Neither is the unwritten `playbook_tasks`.

## Permissions

Client write gate. Guests read-only. Project options and templates are edited in Settings →
Projects, which is **visible to everyone** (unlike the admin-only tabs).

## Automations and side effects

- Daily project-deadline notifications, emitted from `/api/cron/client-actions` and
  isolated so an action-generation success is not lost if the notification step fails.
- The Today "projects" lane reads project boards through `getAllProjectBoards()`.
- Project deadlines are an input to the Action list signal engine
  (`SignalInputs.projectDeadlines`) — though the **projects signal (#3) itself is not yet
  implemented**, so the input is currently assembled and unused by any rule.

## Data model

`client_projects` (`lib/db/schema.ts:524`) · `project_milestones` (`:544`) ·
`project_tasks` (`:559`) · `project_templates` (`:583`). Migration:
`drizzle/0003_add_project_management.sql`.

## Technical implementation

`lib/projects/{types,config,data,deadlines,actor}.ts` · `lib/repo/projects.ts` ·
`components/clients/projects/` · `components/today/Projects.tsx` ·
`app/(app)/clients/[id]/project-actions.ts` ·
`app/(app)/settings/project-config-actions.ts` ·
`lib/notifications/project-deadline-sync.ts`

## Analytics and observability

None.

## Known limitations

- No cross-account project view — projects are only visible per account or through Today's
  lane.
- No dependencies between projects or milestones.
- No effort or capacity tracking.
- The Action list's projects signal is unimplemented, so overdue delivery work produces a
  notification but no action item.
- No tests.

## Open questions

- Is `project_tasks` intended to merge with `today_tasks`? Signal has two task systems and
  a third unwritten table.
- Should projects link to use-case implementations? `lib/use-case-implementation.ts` has a
  field for "a linked project/mission id, when one exists" — the linkage is modelled but its
  UI was not confirmed in this pass.

## Source references

`lib/projects/*` · `lib/repo/projects.ts` · `lib/db/schema.ts:524-594` ·
`lib/notifications/project-deadline-sync.ts` · `lib/actions/signals.ts`

---

**Documentation status:** Partially verified
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
