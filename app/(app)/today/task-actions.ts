"use server";

/* Today board — server actions for user-authored tasks. The creator is always
   the signed-in user; assigning a task to someone ELSE requires admin rights
   (editsAllClients) — enforced here, not just hidden in the UI. */

import { getCurrentUserEmail, getCurrentUserRole } from "@/lib/auth";
import { editsAllClients } from "@/lib/roles";
import { hasDatabase } from "@/lib/config";

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
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Enter a task title." };
  const category = input.category.trim().slice(0, 60);
  if (!category) return { ok: false, error: "Name the focus area." };
  const priority: Priority = PRIORITIES.includes(input.priority as Priority) ? (input.priority as Priority) : "normal";
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null;
  // Assigning to someone else is admin-only; everyone else owns what they create.
  let assignee = email;
  const requested = input.assigneeEmail?.trim().toLowerCase();
  if (requested && requested !== email) {
    const role = await getCurrentUserRole();
    assignee = editsAllClients(role) ? requested : email;
  }
  const sourceType = input.sourceType === "signal" || input.sourceType === "commitment" ? input.sourceType : null;
  const sourceId = sourceType && input.sourceId ? input.sourceId : null;
  try {
    const { createTodayTaskDb } = await import("@/lib/repo/drizzle");
    const row = await createTodayTaskDb({
      ownerEmail: assignee, createdByEmail: email, category, title,
      accountId: input.accountId ?? null, projectId: input.projectId ?? null, dueDate: input.dueDate ?? null,
      priority, notes, sourceType, sourceId,
    });
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
  try {
    const { setTodayTaskStatusDb } = await import("@/lib/repo/drizzle");
    await setTodayTaskStatusDb(id, email, status);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteTaskAction(id: string): Promise<TaskResult> {
  const email = await getCurrentUserEmail();
  if (!email || !hasDatabase()) return { ok: false, error: "Unavailable." };
  try {
    const { deleteTodayTaskDb } = await import("@/lib/repo/drizzle");
    await deleteTodayTaskDb(id, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
