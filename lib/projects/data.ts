/* =========================================================================
   Project-management data facade (server-only). Sits between the server
   actions / pages and the drizzle repo (lib/repo/projects.ts), following the
   app's house style: reads degrade gracefully to empty on DB trouble; writes
   throw when the DB isn't configured. Authorization (client visibility) is the
   caller's job — see app/(app)/clients/[id]/project-actions.ts.
   ========================================================================= */

import "server-only";
import { cache } from "react";
import { hasDatabase } from "@/lib/config";
import { dbHealthy, markDbHealthy, markDbUnhealthy } from "@/lib/db/health";
import {
  DEFAULT_PROJECT_CONFIG,
  PROJECT_CONFIG_KEY,
  defaultProjectStatusId,
  defaultTaskStatusId,
  isProjectComplete,
  isTaskDone,
  normalizeProjectConfig,
  normalizeTemplateStructure,
  type ProjectConfig,
} from "@/lib/projects/config";
import type {
  Milestone,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectTemplate,
  ProjectTemplateStructure,
  Task,
  TaskInput,
} from "@/lib/projects/types";
import * as repo from "@/lib/repo/projects";

/* --------------------------------------------------------------- config */

/** The option vocabularies (status/type), from workspace_config or defaults.
 *  Cached per request — the tab, drawer and settings can all call it freely. */
export const getProjectConfig = cache(async (): Promise<ProjectConfig> => {
  if (hasDatabase() && dbHealthy()) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      const { withDbTimeout } = await import("@/lib/db/client");
      const raw = await withDbTimeout(getWorkspaceConfigFromDb(PROJECT_CONFIG_KEY));
      markDbHealthy();
      if (raw != null) return normalizeProjectConfig(raw);
    } catch (err) {
      markDbUnhealthy();
      console.warn("[projects] getProjectConfig failed:", err);
    }
  }
  return DEFAULT_PROJECT_CONFIG;
});

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(PROJECT_CONFIG_KEY, normalizeProjectConfig(config));
}

/* --------------------------------------------------------------- board read */

/** Every project (with milestones + tasks) for one account. */
export async function getProjectBoard(clientId: string): Promise<ProjectDetail[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const board = await repo.getProjectBoardForClient(clientId);
      markDbHealthy();
      return board;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[projects] getProjectBoard failed:", err);
    }
  }
  return [];
}

/* ----------------------------------------------------------------- projects */

export async function createProject(input: {
  clientId: string;
  data: ProjectInput;
  createdByEmail: string | null;
  templateId?: string | null;
}): Promise<Project> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const config = await getProjectConfig();
  const status = input.data.status && config.projectStatuses.some((s) => s.id === input.data.status)
    ? input.data.status
    : defaultProjectStatusId(config);
  const project = await repo.insertProject({
    clientId: input.clientId,
    data: input.data,
    status,
    createdByEmail: input.createdByEmail,
    completed: isProjectComplete(config, status),
  });

  // Optionally materialise a template's milestones + tasks under the new project.
  if (input.templateId) {
    const template = await repo.getTemplate(input.templateId);
    if (template) {
      await repo.insertTemplateStructure({
        projectId: project.id,
        clientId: input.clientId,
        structure: template.structure,
        startDate: project.startDate,
        taskDefaultStatus: defaultTaskStatusId(config),
      });
    }
  }
  return project;
}

export async function updateProjectDetails(
  projectId: string,
  patch: Partial<ProjectInput> & { status?: string },
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  // Only stamp/clear completedAt on an actual terminal-boundary crossing, so
  // editing (say) the description of a completed project never overwrites its
  // original completion time.
  let completedAtOp: "set" | "clear" | undefined;
  if (patch.status !== undefined) {
    const config = await getProjectConfig();
    const current = await repo.getProjectStatus(projectId);
    const nowTerminal = isProjectComplete(config, patch.status);
    const wasTerminal = current != null && isProjectComplete(config, current);
    completedAtOp = nowTerminal && !wasTerminal ? "set" : !nowTerminal && wasTerminal ? "clear" : undefined;
  }
  await repo.updateProject(projectId, patch, completedAtOp);
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.deleteProject(projectId);
}

/* --------------------------------------------------------------- milestones */

export async function addMilestone(input: {
  projectId: string;
  clientId: string;
  name: string;
  description?: string | null;
  dueDate?: string | null;
}): Promise<Milestone> {
  if (!hasDatabase()) throw new Error("Database not configured");
  return repo.insertMilestone(input);
}

export async function editMilestone(
  milestoneId: string,
  patch: { name?: string; description?: string | null; dueDate?: string | null },
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.updateMilestone(milestoneId, patch);
}

export async function removeMilestone(milestoneId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.deleteMilestone(milestoneId);
}

/* -------------------------------------------------------------------- tasks */

export async function addTask(input: {
  projectId: string;
  milestoneId: string;
  clientId: string;
  data: TaskInput;
}): Promise<Task> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const config = await getProjectConfig();
  const status = input.data.status && config.taskStatuses.some((s) => s.id === input.data.status)
    ? input.data.status
    : defaultTaskStatusId(config);
  return repo.insertTask({
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    clientId: input.clientId,
    data: input.data,
    status,
    completed: isTaskDone(config, status),
  });
}

export async function editTask(
  taskId: string,
  patch: Partial<TaskInput> & { status?: string; milestoneId?: string; projectId?: string },
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  // Terminal-boundary only (see updateProjectDetails) — don't re-stamp a task's
  // completedAt when merely editing its name while it's already done.
  let completedAtOp: "set" | "clear" | undefined;
  if (patch.status !== undefined) {
    const config = await getProjectConfig();
    const current = await repo.getTaskStatus(taskId);
    const nowDone = isTaskDone(config, patch.status);
    const wasDone = current != null && isTaskDone(config, current);
    completedAtOp = nowDone && !wasDone ? "set" : !nowDone && wasDone ? "clear" : undefined;
  }
  await repo.updateTask(taskId, patch, completedAtOp);
}

export async function removeTask(taskId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.deleteTask(taskId);
}

/* ---------------------------------------------------------------- templates */

export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
  if (hasDatabase() && dbHealthy()) {
    try {
      const templates = await repo.listTemplates();
      markDbHealthy();
      return templates;
    } catch (err) {
      markDbUnhealthy();
      console.warn("[projects] listProjectTemplates failed:", err);
    }
  }
  return [];
}

export async function createTemplate(input: {
  name: string;
  description?: string | null;
  type?: string | null;
  structure: ProjectTemplateStructure;
  createdByEmail: string | null;
  createdByName: string | null;
}): Promise<ProjectTemplate> {
  if (!hasDatabase()) throw new Error("Database not configured");
  // Templates are workspace-global — sanitise the (client-supplied) structure
  // so one malformed blob can't break the shared template list or the apply path.
  return repo.insertTemplate({ ...input, structure: normalizeTemplateStructure(input.structure) });
}

export async function editTemplate(
  id: string,
  patch: { name?: string; description?: string | null; type?: string | null; structure?: ProjectTemplateStructure },
): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const clean = patch.structure !== undefined ? { ...patch, structure: normalizeTemplateStructure(patch.structure) } : patch;
  await repo.updateTemplate(id, clean);
}

export async function removeTemplate(id: string): Promise<void> {
  if (!hasDatabase()) throw new Error("Database not configured");
  await repo.deleteTemplate(id);
}

export async function getTemplate(id: string): Promise<ProjectTemplate | null> {
  if (!hasDatabase()) return null;
  try {
    return await repo.getTemplate(id);
  } catch {
    return null;
  }
}

/**
 * Capture a live project's milestone/task structure as a reusable template.
 * Dates become day-offsets relative to the project's start date, so applying
 * the template later re-derives real dates from the new project's start.
 */
export async function saveProjectAsTemplate(input: {
  project: ProjectDetail;
  name: string;
  description?: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
}): Promise<ProjectTemplate> {
  if (!hasDatabase()) throw new Error("Database not configured");
  const start = input.project.startDate ? new Date(input.project.startDate) : null;
  const offset = (iso: string | null): number | null => {
    if (!start || !iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - start.getTime()) / 86_400_000);
  };
  const structure: ProjectTemplateStructure = {
    milestones: input.project.milestones.map((m) => ({
      name: m.name,
      description: m.description,
      dueOffsetDays: offset(m.dueDate),
      tasks: m.tasks.map((t) => ({
        name: t.name,
        description: t.description,
        type: t.type,
        startOffsetDays: offset(t.startDate),
        deliveryOffsetDays: offset(t.deliveryDate),
      })),
    })),
  };
  return repo.insertTemplate({
    name: input.name,
    description: input.description ?? null,
    type: input.project.type,
    structure,
    createdByEmail: input.createdByEmail,
    createdByName: input.createdByName,
  });
}

/* ----------------------------------------------------------- authz helpers */

/** Resolve the account a project/milestone/task belongs to, for visibility
 *  checks in the action layer (returns null if the row is gone). */
export async function clientIdForProject(projectId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    return await repo.getProjectClientId(projectId);
  } catch {
    return null;
  }
}

export async function clientIdForMilestone(milestoneId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    const projectId = await repo.getMilestoneProjectId(milestoneId);
    return projectId ? repo.getProjectClientId(projectId) : null;
  } catch {
    return null;
  }
}

/** The project a milestone belongs to (used to keep a moved task's projectId
 *  consistent with its new milestone). */
export async function projectIdForMilestone(milestoneId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    return await repo.getMilestoneProjectId(milestoneId);
  } catch {
    return null;
  }
}

export async function clientIdForTask(taskId: string): Promise<string | null> {
  if (!hasDatabase()) return null;
  try {
    const projectId = await repo.getTaskProjectId(taskId);
    return projectId ? repo.getProjectClientId(projectId) : null;
  } catch {
    return null;
  }
}

/** Resolve the assembled ProjectDetail for one project (used by save-as-template). */
export async function getProjectDetail(clientId: string, projectId: string): Promise<ProjectDetail | null> {
  const board = await getProjectBoard(clientId);
  return board.find((p) => p.id === projectId) ?? null;
}
