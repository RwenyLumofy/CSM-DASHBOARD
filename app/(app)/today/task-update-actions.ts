"use server";

/* =========================================================================
   Updates on a task — the conversation, and who was named in it.

   WHY THIS EXISTS. The account Tasks sidebar lists tasks across owners, so two
   people routinely see a task only one of them can act on, with no way to say
   anything about it or reach the other. That discussion happens in Slack today
   and the account record never learns from it.

   A MENTION GRANTS NO ACCESS. Decided 2026-08-02. The picker only ever offers
   people who can already see the account, so a mention cannot widen anybody's
   access — an operator must not be able to hand a colleague visibility from
   inside a text box, invisibly to whoever set app_users.scope. The cost, stated
   plainly: somebody with no grant on the account (an implementation engineer,
   say) cannot be reached here at all.

   The picker deliberately does NOT call getAppUsers() — that read is unscoped
   and already recorded in docs/known-limitations/contradictions.md as leaking
   the staff directory. This must not become another consumer of it.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail, getCurrentUserRole, getCurrentUserScope, denyClientWrite } from "@/lib/auth";
import { editsAllClients } from "@/lib/roles";
import { hasDatabase } from "@/lib/config";
// Sync helper, so it cannot live in this "use server" module — see lib/task-updates.ts.
import { parseMentions } from "@/lib/task-updates";

export interface UpdateResult { ok: boolean; error?: string }

/** The task, plus the permission verdict for writing to it. One place, so read
 *  and write can never disagree about who may touch a thread. */
async function loadWritableTask(taskId: string): Promise<
  { ok: true; task: { id: string; accountId: string | null; ownerEmail: string; title: string } } | { ok: false; error: string }
> {
  const role = await getCurrentUserRole();
  if (!role) return { ok: false, error: "Not signed in." };
  if (role === "guest") return { ok: false, error: "Your access level can't post updates." };

  const { getTodayTaskDb } = await import("@/lib/repo/drizzle");
  const task = await getTodayTaskDb(taskId);
  if (!task) return { ok: false, error: "That task no longer exists." };

  /* An account-linked task is account work, so posting on it needs the same
     permission as editing the account. A task with no account is personal:
     its owner, or somebody with unrestricted scope. */
  if (task.accountId) {
    const denied = await denyClientWrite(task.accountId);
    if (denied) return { ok: false, error: denied };
  } else {
    const [email, scope] = await Promise.all([getCurrentUserEmail(), getCurrentUserScope()]);
    const mayAny = editsAllClients(role) && scope.mode === "all";
    if (!mayAny && task.ownerEmail !== email?.toLowerCase()) {
      return { ok: false, error: "That task belongs to someone else." };
    }
  }
  return { ok: true, task };
}

export interface TaskUpdateView {
  id: string;
  authorEmail: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mine: boolean;
}

/**
 * A task's thread, for someone allowed to read it.
 *
 * Read is gated on the same rule as write, deliberately: the sidebar already
 * only lists tasks the caller may see, and a thread is not more public than the
 * task it hangs off. Returns [] rather than throwing when the caller may not
 * look — a thread that fails to load must not blank the task list around it.
 */
export async function getTaskUpdatesAction(taskId: string): Promise<TaskUpdateView[]> {
  if (!hasDatabase()) return [];
  const email = (await getCurrentUserEmail())?.toLowerCase() ?? null;
  const gate = await loadWritableTask(taskId);
  if (!gate.ok) return [];

  const { getTaskUpdatesDb, getUsersWhoCanSeeClientDb } = await import("@/lib/repo/drizzle");
  const rows = await getTaskUpdatesDb(taskId);

  // Resolve author display names from the same scoped audience the picker uses,
  // so a name shown here is never one the reader could not otherwise see.
  const people = gate.task.accountId ? await getUsersWhoCanSeeClientDb(gate.task.accountId) : [];
  const nameByEmail = new Map(people.map((p) => [p.email, p.name]));

  return rows.map((r) => ({
    id: r.id,
    authorEmail: r.authorEmail,
    authorName: nameByEmail.get(r.authorEmail) ?? r.authorEmail,
    body: r.body,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    deleted: !!r.deletedAt,
    mine: r.authorEmail === email,
  }));
}

export async function postTaskUpdateAction(taskId: string, body: string): Promise<UpdateResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 4000) return { ok: false, error: "That update is too long — 4000 characters max." };

  const gate = await loadWritableTask(taskId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { task } = gate;

  /* Re-check every mentioned person against who may actually be offered, rather
     than trusting the tokens in the body. Otherwise a crafted request notifies
     anyone in the company, which is exactly the access-widening this feature is
     designed not to allow. */
  const allowed = new Set((await listMentionableForTaskAction(taskId)).map((p) => p.email));
  const mentions = parseMentions(text).filter((e) => allowed.has(e));

  try {
    const {
      createTaskUpdateDb, insertNotificationsDb,
    } = await import("@/lib/repo/drizzle");
    const update = await createTaskUpdateDb({ taskId, authorEmail: email, body: text, mentions });

    /* Two triggers, and never both to the same person: being named in an update
       is the stronger signal, so a mentioned owner is not also told their task
       has activity. Nobody is notified about their own writing. */
    const author = email.toLowerCase();
    const recipients = new Map<string, { type: string; title: string }>();
    for (const m of mentions) {
      if (m !== author) recipients.set(m, { type: "task_mentioned", title: `${email} mentioned you` });
    }
    const owner = task.ownerEmail.toLowerCase();
    if (owner !== author && !recipients.has(owner)) {
      recipients.set(owner, { type: "task_update", title: `${email} commented on your task` });
    }

    if (recipients.size) {
      await insertNotificationsDb([...recipients].map(([recipientEmail, n]) => ({
        // Deterministic per (update, recipient): a retried post cannot notify twice.
        id: `nt-${update.id}-${recipientEmail}`,
        recipientEmail,
        type: n.type,
        title: n.title,
        body: `${task.title} — ${text.slice(0, 140)}`,
        clientId: task.accountId,
        entityType: "task" as const,
        entityId: taskId,
        createdByEmail: email,
      })));
    }

    if (task.accountId) revalidatePath(`/clients/${task.accountId}`);
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteTaskUpdateAction(updateId: string): Promise<UpdateResult> {
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  const { taskIdForUpdateDb, deleteTaskUpdateDb } = await import("@/lib/repo/drizzle");
  const taskId = await taskIdForUpdateDb(updateId);
  if (!taskId) return { ok: false, error: "That update no longer exists." };

  const gate = await loadWritableTask(taskId);
  if (!gate.ok) return { ok: false, error: gate.error };

  /* Your own, or unrestricted scope. Same rule as editing anyone's task — an
     admin narrowed by app_users.scope must not be able to delete an update on
     an account they cannot otherwise touch. */
  const [role, scope] = await Promise.all([getCurrentUserRole(), getCurrentUserScope()]);
  const mayAny = editsAllClients(role) && scope.mode === "all";

  try {
    const author = await deleteTaskUpdateDb(updateId);
    if (author === null) return { ok: true }; // already gone — nothing to undo
    if (!mayAny && author.toLowerCase() !== email.toLowerCase()) {
      return { ok: false, error: "You can only remove your own updates." };
    }
    if (gate.task.accountId) revalidatePath(`/clients/${gate.task.accountId}`);
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export interface MentionablePerson { email: string; name: string }

/**
 * Who can be mentioned on this task: people who can ALREADY see its account.
 *
 * This is the whole of the "a mention grants no access" decision. Offering
 * somebody who cannot see the account would either notify them about something
 * they cannot open, or force us to widen their access to fix it — and the
 * second is an operator quietly overriding an admin's scope.
 */
export async function listMentionableForTaskAction(taskId: string): Promise<MentionablePerson[]> {
  if (!hasDatabase()) return [];
  const role = await getCurrentUserRole();
  if (!role || role === "guest") return [];

  const { getTodayTaskDb, getUsersWhoCanSeeClientDb } = await import("@/lib/repo/drizzle");
  const task = await getTodayTaskDb(taskId);
  if (!task) return [];

  // No account means no account-scoped audience to draw from; the task is
  // personal and there is nobody to name but its owner.
  if (!task.accountId) return [];
  return getUsersWhoCanSeeClientDb(task.accountId);
}
