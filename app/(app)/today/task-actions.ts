"use server";

/* Today board — server actions for user-authored tasks. The creator is always
   the signed-in user; assigning a task to someone ELSE requires admin rights
   (editsAllClients) — enforced here, not just hidden in the UI. */

import { getCurrentUserEmail, getCurrentUserRole, denyClientWrite, getCurrentUserScope } from "@/lib/auth";
import { editsAllClients } from "@/lib/roles";
import { hasDatabase } from "@/lib/config";

/** The task isn't yours and you aren't an admin, so the owner-scoped write
 *  matched nothing. Said out loud instead of returning a false success. */
const NOT_YOURS = "That task isn't on your board. Ask its owner, or an admin, to change it.";

/** Guests may not create or change actions (see permissionCapabilities in
 *  lib/roles.ts). Enforced here, not merely hidden in the UI. */
async function denyTaskWrite(): Promise<string | null> {
  const role = await getCurrentUserRole();
  if (!role) return "Not signed in.";
  if (role === "guest") return "Your access level can't create or change actions.";
  return null;
}

/** An account-linked task is account work: it needs the same write permission
 *  as editing the account. A project link is validated for existence only —
 *  projects hang off an account, whose gate has already been applied. */
async function denyTaskTarget(accountId?: string | null, projectId?: string | null): Promise<string | null> {
  if (accountId) {
    const denied = await denyClientWrite(accountId);
    if (denied) return denied;
  }
  if (projectId) {
    const { projectExists } = await import("@/lib/repo/drizzle");
    if (!(await projectExists(projectId))) return "That project no longer exists.";
  }
  return null;
}

/** Rejects a due date in the past — a task that is overdue the moment it is
 *  created is always a mistake, and it pollutes every overdue count.
 *
 *  The floor is YESTERDAY in UTC, not today. The server has no idea which
 *  timezone the picker was in, and for anyone west of UTC "today" locally is
 *  already "yesterday" in UTC after early evening — a strict compare rejected
 *  a task due today. One day of slack costs nothing and removes the false
 *  rejection; a genuinely stale date is still caught. */
function badDueDate(due?: string | null): string | null {
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return "Use the date picker.";
  const floor = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return due < floor ? "That due date is in the past." : null;
}

/** May this caller act on a task that isn't theirs?
 *
 *  Role alone is not enough: an admin can be narrowed to specific accounts via
 *  app_users.scope, and denyClientWrite honours that — but a role-only check
 *  let that same admin edit or delete ANY task in the system, including ones
 *  on accounts they cannot otherwise touch. Requires unrestricted scope too. */
async function mayEditAnyTask(): Promise<boolean> {
  const [role, scope] = await Promise.all([getCurrentUserRole(), getCurrentUserScope()]);
  return editsAllClients(role) && scope.mode === "all";
}

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
type Priority = (typeof PRIORITIES)[number];

export interface TaskResult {
  ok: boolean;
  error?: string;
  task?: {
    id: string; category: string; title: string; accountId: string | null; projectId: string | null; dueDate: string | null;
    priority: Priority; notes: string | null; ownerEmail: string; sourceType: "signal" | "commitment" | null; sourceId: string | null;
    status: "open" | "done"; createdAt: string;
  };
}

export async function createTaskAction(input: {
  category: string; title: string; accountId?: string | null; projectId?: string | null; dueDate?: string | null;
  priority?: string; notes?: string | null; assigneeEmail?: string | null;
  sourceType?: "signal" | "commitment" | null; sourceId?: string | null;
}): Promise<TaskResult> {
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Not signed in." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const denied = (await denyTaskWrite())
    ?? (await denyTaskTarget(input.accountId, input.projectId))
    ?? badDueDate(input.dueDate);
  if (denied) return { ok: false, error: denied };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Enter a task title." };
  const category = input.category.trim().slice(0, 60);
  if (!category) return { ok: false, error: "Name the focus area." };
  const priority: Priority = PRIORITIES.includes(input.priority as Priority) ? (input.priority as Priority) : "normal";
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null;
  /* Assigning to someone else is admin-only. REJECT rather than quietly
     reassigning to self: a silent downgrade returns {ok:true} and the task
     lands on the requester's own board, so they believe a teammate was tasked
     and nobody is. updateTaskAction already refuses this way — same rule, same
     message, so the two paths cannot drift. */
  let assignee = email;
  const requested = input.assigneeEmail?.trim().toLowerCase();
  if (requested && requested !== email) {
    const role = await getCurrentUserRole();
    if (!editsAllClients(role)) return { ok: false, error: "Only an admin can reassign a task to someone else." };
    assignee = requested;
  }
  const sourceType = input.sourceType === "signal" || input.sourceType === "commitment" ? input.sourceType : null;
  const sourceId = sourceType && input.sourceId ? input.sourceId : null;
  try {
    const { createTodayTaskDb, findOpenTodayTaskBySourceDb, insertNotificationsDb } = await import("@/lib/repo/drizzle");

    /* Flagging the same signal or commitment twice used to create a second
       row, so one problem showed up in a lane as two pieces of work. When the
       task traces to a source, an OPEN task for that source in the same lane
       and owner is returned instead of a duplicate. */
    if (sourceType && sourceId) {
      const existing = await findOpenTodayTaskBySourceDb(assignee, category, sourceType, sourceId);
      if (existing) return { ok: false, error: `Already on the board as "${existing.title}".` };
    }

    const row = await createTodayTaskDb({
      ownerEmail: assignee, createdByEmail: email, category, title,
      accountId: input.accountId ?? null, projectId: input.projectId ?? null, dueDate: input.dueDate ?? null,
      priority, notes, sourceType, sourceId,
    });
    /* Assigning work to someone else used to be silent — the task appeared on
       their board with no indication it had arrived. Best-effort: the task is
       already created, so a notification failure must not read as a failed
       create. */
    if (assignee !== email) {
      try {
        await insertNotificationsDb([{
          id: `nt-task-${row.id}`,
          recipientEmail: assignee,
          type: "task_assigned",
          title: `New task from ${email}`,
          body: title,
          clientId: input.accountId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          createdByEmail: email,
        }]);
      } catch (err) {
        console.error("[task-actions] task created but assignee not notified", { taskId: row.id, err });
      }
    }

    return { ok: true, task: {
      id: row.id, category: row.category, title: row.title, accountId: row.accountId, projectId: row.projectId, dueDate: row.dueDate,
      priority, notes: row.notes, ownerEmail: row.ownerEmail, sourceType, sourceId, status: "open", createdAt: row.createdAt,
    } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function toggleTaskAction(id: string, status: "open" | "done"): Promise<TaskResult> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return { ok: false, error: "Unavailable." };
  const denied = await denyTaskWrite();
  if (denied) return { ok: false, error: denied };
  try {
    const { setTodayTaskStatusDb } = await import("@/lib/repo/drizzle");
    const anyOwner = await mayEditAnyTask();
    const n = await setTodayTaskStatusDb(id, email, status, { anyOwner });
    if (n === 0) return { ok: false, error: NOT_YOURS };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Edit a task from its detail drawer. Reassigning to someone ELSE is
 *  admin-only — same rule as creation, enforced here rather than in the UI. */
export async function updateTaskAction(id: string, patch: {
  title?: string; category?: string; notes?: string | null; dueDate?: string | null;
  priority?: string; accountId?: string | null; assigneeEmail?: string | null;
}): Promise<TaskResult> {
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Not signed in." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };

  const clean: Parameters<typeof import("@/lib/repo/drizzle").updateTodayTaskDb>[2] = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Enter a task title." };
    clean.title = t;
  }
  if (patch.category !== undefined) {
    const c = patch.category.trim().slice(0, 60);
    if (!c) return { ok: false, error: "Name the focus area." };
    clean.category = c;
  }
  if (patch.notes !== undefined) clean.notes = patch.notes?.trim() ? patch.notes.trim().slice(0, 2000) : null;
  if (patch.dueDate !== undefined) clean.dueDate = patch.dueDate || null;
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority as Priority)) clean.priority = patch.priority;
  if (patch.accountId !== undefined) clean.accountId = patch.accountId || null;

  const blocked = (await denyTaskWrite())
    ?? (await denyTaskTarget(patch.accountId, null))
    ?? (patch.dueDate !== undefined ? badDueDate(patch.dueDate) : null);
  if (blocked) return { ok: false, error: blocked };

  const requested = patch.assigneeEmail?.trim().toLowerCase();
  if (requested && requested !== email) {
    const role = await getCurrentUserRole();
    if (!editsAllClients(role)) return { ok: false, error: "Only an admin can reassign a task to someone else." };
    clean.ownerEmail = requested;
  }

  try {
    const { updateTodayTaskDb } = await import("@/lib/repo/drizzle");
    const anyOwner = await mayEditAnyTask();
    const n = await updateTodayTaskDb(id, email, clean, { anyOwner });
    if (n === 0) return { ok: false, error: NOT_YOURS };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteTaskAction(id: string): Promise<TaskResult> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return { ok: false, error: "Unavailable." };
  const denied = await denyTaskWrite();
  if (denied) return { ok: false, error: denied };
  try {
    const { deleteTodayTaskDb } = await import("@/lib/repo/drizzle");
    const anyOwner = await mayEditAnyTask();
    const n = await deleteTodayTaskDb(id, email, { anyOwner });
    if (n === 0) return { ok: false, error: NOT_YOURS };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
