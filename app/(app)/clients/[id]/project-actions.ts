"use server";

/* Project-management mutations for a client profile. Authorization mirrors the
   contacts/attachments pattern: any user who can VIEW the account (its CSM
   owner, its implementation owner, or a super-admin — getClientById is already
   role-scoped) may manage its projects. Milestone/task edits additionally
   verify the row actually belongs to the account being edited, so a visible
   account can never be used as a lever to touch another account's rows. */

import { getClientById } from "@/lib/data";
import { getCurrentUserEmail } from "@/lib/auth";
import { getCurrentActor } from "@/lib/projects/actor";
import {
  addMilestone,
  addTask,
  clientIdForMilestone,
  clientIdForProject,
  clientIdForTask,
  createProject,
  deleteProject,
  editMilestone,
  editTask,
  getProjectDetail,
  projectIdForMilestone,
  removeMilestone,
  removeTask,
  saveProjectAsTemplate,
  updateProjectDetails,
} from "@/lib/projects/data";
import type { MilestoneInput, ProjectInput, TaskInput } from "@/lib/projects/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Authorize by client visibility; returns the blocking result or null. */
async function guard(clientId: string): Promise<ActionResult | null> {
  const client = await getClientById(clientId);
  if (!client) return { ok: false, error: "Not found or you don't have access to this account." };
  return null;
}

/** Authorize a milestone/task edit: the account is visible AND the row lives
 *  on that account. */
async function guardOwned(clientId: string, rowClientId: string | null): Promise<ActionResult | null> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  if (rowClientId !== clientId) return { ok: false, error: "That item no longer exists on this account." };
  return null;
}

/* ----------------------------------------------------------------- projects */

export async function createProjectAction(
  clientId: string,
  input: ProjectInput,
  templateId?: string | null,
): Promise<ActionResult & { projectId?: string }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A project name is required." };
  try {
    const email = await getCurrentUserEmail();
    const project = await createProject({
      clientId,
      data: { ...input, name },
      createdByEmail: email,
      templateId: templateId ?? null,
    });
    return { ok: true, projectId: project.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateProjectAction(
  clientId: string,
  projectId: string,
  patch: Partial<ProjectInput> & { status?: string },
): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForProject(projectId));
  if (blocked) return blocked;
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "A project name is required." };
  try {
    await updateProjectDetails(projectId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteProjectAction(clientId: string, projectId: string): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForProject(projectId));
  if (blocked) return blocked;
  try {
    await deleteProject(projectId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* --------------------------------------------------------------- milestones */

export async function addMilestoneAction(
  clientId: string,
  projectId: string,
  input: MilestoneInput,
): Promise<ActionResult & { milestoneId?: string }> {
  const blocked = await guardOwned(clientId, await clientIdForProject(projectId));
  if (blocked) return blocked;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A milestone name is required." };
  try {
    const m = await addMilestone({ projectId, clientId, name, description: input.description ?? null, dueDate: input.dueDate ?? null });
    return { ok: true, milestoneId: m.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateMilestoneAction(
  clientId: string,
  milestoneId: string,
  patch: { name?: string; description?: string | null; dueDate?: string | null },
): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForMilestone(milestoneId));
  if (blocked) return blocked;
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "A milestone name is required." };
  try {
    await editMilestone(milestoneId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteMilestoneAction(clientId: string, milestoneId: string): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForMilestone(milestoneId));
  if (blocked) return blocked;
  try {
    await removeMilestone(milestoneId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* -------------------------------------------------------------------- tasks */

export async function addTaskAction(
  clientId: string,
  projectId: string,
  milestoneId: string,
  input: TaskInput,
): Promise<ActionResult & { taskId?: string }> {
  const blocked = await guardOwned(clientId, await clientIdForMilestone(milestoneId));
  if (blocked) return blocked;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A task name is required." };
  try {
    const t = await addTask({ projectId, milestoneId, clientId, data: { ...input, name } });
    return { ok: true, taskId: t.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function updateTaskAction(
  clientId: string,
  taskId: string,
  patch: Partial<TaskInput> & { status?: string; milestoneId?: string },
): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForTask(taskId));
  if (blocked) return blocked;
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "A task name is required." };
  // If the task is being moved to another milestone, that milestone must live
  // on the same account too — and we carry its projectId so the moved task's
  // projectId stays consistent with its new milestone.
  const moved: { projectId?: string } = {};
  if (patch.milestoneId !== undefined) {
    const targetClient = await clientIdForMilestone(patch.milestoneId);
    if (targetClient !== clientId) return { ok: false, error: "That milestone no longer exists on this account." };
    const targetProject = await projectIdForMilestone(patch.milestoneId);
    if (targetProject) moved.projectId = targetProject;
  }
  try {
    const finalPatch = { ...patch, ...moved, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) };
    await editTask(taskId, finalPatch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteTaskAction(clientId: string, taskId: string): Promise<ActionResult> {
  const blocked = await guardOwned(clientId, await clientIdForTask(taskId));
  if (blocked) return blocked;
  try {
    await removeTask(taskId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* -------------------------------------------------------- save as template */

export async function saveProjectAsTemplateAction(
  clientId: string,
  projectId: string,
  input: { name: string; description?: string | null },
): Promise<ActionResult & { templateId?: string }> {
  const blocked = await guardOwned(clientId, await clientIdForProject(projectId));
  if (blocked) return blocked;
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A template name is required." };
  try {
    const project = await getProjectDetail(clientId, projectId);
    if (!project) return { ok: false, error: "Project not found." };
    const actor = await getCurrentActor();
    const template = await saveProjectAsTemplate({
      project,
      name,
      description: input.description ?? null,
      createdByEmail: actor.email,
      createdByName: actor.name,
    });
    return { ok: true, templateId: template.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
