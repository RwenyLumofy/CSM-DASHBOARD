# Playbooks

**Status:** Deprecated / not implemented — **the page can never show anything**

## Summary

A navigation item and a page exist. The feature does not. `/playbooks` renders a permanent
empty state, and no code anywhere evaluates a playbook trigger.

## Evidence

```
lib/data.ts:572   export async function getPlaybooks(): Promise<Playbook[]> {
lib/data.ts:573     // return SAMPLE_PLAYBOOKS;
lib/data.ts:574     return [];
lib/data.ts:575   }

lib/data.ts:577   export async function getTasksForClient(clientId: string): Promise<PlaybookTask[]> {
lib/data.ts:578     // return tasksForClient(clientId);
lib/data.ts:579     return [];
lib/data.ts:580   }
```

`getOpenTasks()` (`lib/data.ts:582`) fans out over `getTasksForClient()`, so it also always
returns `[]`. The page calls all three and renders whatever they return — which is nothing,
for every user, in every environment.

The trigger types are **declared but never evaluated**. A repository-wide search for
`health_below` and `renewal_within` finds them only in:

- `lib/types.ts:418-419` — the type union
- `app/(app)/playbooks/page.tsx:13,23` — label and copy for the UI
- `lib/sample/data.ts:863,877` — two seed playbooks in the disabled sample dataset
- `lib/health/model-v1.ts:175` — an unrelated *health engine* status rule that happens to
  use a `renewal_within_90d` fact

**No scheduler, job, server action or route starts a playbook.** `playbook_tasks`
(`lib/db/schema.ts:73`) and `playbooks` (`:63`) exist as tables and are not written to by
any code path found in this pass.

## What the UI claims

`app/(app)/playbooks/page.tsx:22-34` renders trigger copy that describes automation Signal
does not perform:

- "Auto-starts when health drops below *n*"
- "Auto-starts *n* days before renewal"
- "Auto-starts when CSAT drops below *n*%"
- "Auto-starts when open tickets exceed *n*"
- "Auto-starts when seat adoption drops below *n*%"
- "Started manually by the CSM"

**This is a `Contradictory` surface**: the interface describes behaviour the backend does
not implement. Because the list is always empty, no user currently sees the claim attached
to a record — but the strings ship.

## Impact

- A sidebar item leads to a dead end for every user.
- Anyone reading the navigation reasonably concludes Signal has playbook automation.
- The closest thing that *does* exist is the **assignment workflow**
  (Settings → Automations), which routes owners — not playbooks. See
  [settings](../settings/README.md).
- Task-like work is served by `today_tasks` (Today) and `project_tasks` (Project
  Management). Neither is a playbook task.

## Data model

| Table | Written by | Read by |
|---|---|---|
| `playbooks` | nothing | `getPlaybooks()` — which ignores it and returns `[]` |
| `playbook_tasks` | nothing | `getTasksForClient()` — same |

## Technical implementation

`app/(app)/playbooks/page.tsx` · `lib/data.ts:572-587` · `lib/types.ts:418-438` ·
`lib/db/schema.ts:63,73` · `lib/sample/data.ts:855-890` ·
`components/layout/Sidebar.tsx:24`

## Known limitations

The feature is absent. Everything else follows from that.

## Open questions

1. Is Playbooks intended to ship, or should the navigation item and page be removed?
2. If it ships, do the declared triggers reflect the intended rules, or were they
   placeholders?
3. Should `playbook_tasks` merge with `today_tasks`, or stay separate? Signal already has
   two task systems; a third needs a reason.

Until (1) is answered, no further playbook documentation should be written — documenting a
feature that does not run would be exactly the failure mode this system exists to prevent.

## Source references

`lib/data.ts` · `app/(app)/playbooks/page.tsx` · `lib/types.ts` · `lib/db/schema.ts`

---

**Documentation status:** Verified — the absence is directly evidenced
**Last verified:** 2026-07-31 · **Commit:** `4214349` · **Owner:** Unassigned
