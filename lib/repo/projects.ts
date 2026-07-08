/* Drizzle-backed repository for the project-management module (client_projects,
   project_milestones, project_tasks, project_templates). Server-only; used only
   when DATABASE_URL is set. Every read/write is bounded by withDbTimeout so a
   stalled query fails fast into the caller's fallback instead of hanging the
   request (matches lib/repo/drizzle.ts's discipline).

   Rows are mapped to the ISO-string domain types in lib/projects/types.ts so
   client components never touch Date objects. */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import type {
  Milestone,
  MilestoneWithTasks,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectTemplate,
  ProjectTemplateStructure,
  Task,
  TaskInput,
} from "@/lib/projects/types";

type ProjectRow = typeof schema.clientProjects.$inferSelect;
type MilestoneRow = typeof schema.projectMilestones.$inferSelect;
type TaskRow = typeof schema.projectTasks.$inferSelect;
type TemplateRow = typeof schema.projectTemplates.$inferSelect;

function iso(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** ISO string → Date for a nullable timestamptz column. */
function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    description: r.description,
    type: r.type,
    status: r.status,
    startDate: iso(r.startDate),
    deliveryDate: iso(r.deliveryDate),
    ownerEmail: r.ownerEmail,
    implementerEmail: r.implementerEmail,
    contactId: r.contactId,
    sortOrder: r.sortOrder,
    createdByEmail: r.createdByEmail,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(r.updatedAt) ?? new Date(0).toISOString(),
    completedAt: iso(r.completedAt),
  };
}

function rowToMilestone(r: MilestoneRow): Milestone {
  return {
    id: r.id,
    projectId: r.projectId,
    clientId: r.clientId,
    name: r.name,
    description: r.description,
    dueDate: iso(r.dueDate),
    sortOrder: r.sortOrder,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
  };
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    projectId: r.projectId,
    milestoneId: r.milestoneId,
    clientId: r.clientId,
    name: r.name,
    description: r.description,
    type: r.type,
    status: r.status,
    startDate: iso(r.startDate),
    deliveryDate: iso(r.deliveryDate),
    ownerEmail: r.ownerEmail,
    sortOrder: r.sortOrder,
    completedAt: iso(r.completedAt),
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(r.updatedAt) ?? new Date(0).toISOString(),
  };
}

function rowToTemplate(r: TemplateRow): ProjectTemplate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    structure: r.structure ?? { milestones: [] },
    createdByEmail: r.createdByEmail,
    createdByName: r.createdByName,
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(r.updatedAt) ?? new Date(0).toISOString(),
  };
}

/* --------------------------------------------------------------- board read */

/**
 * Full project board for one account: every project with its milestones and
 * tasks assembled. Three index-range reads (by client_id) + an in-JS assemble
 * — cheap, and everything the tab + drawer need in one round-trip.
 */
export async function getProjectBoardForClient(clientId: string): Promise<ProjectDetail[]> {
  const db = getDb();
  const [projects, milestones, tasks] = await withDbTimeout(
    Promise.all([
      db.select().from(schema.clientProjects).where(eq(schema.clientProjects.clientId, clientId))
        .orderBy(asc(schema.clientProjects.sortOrder), desc(schema.clientProjects.createdAt)),
      db.select().from(schema.projectMilestones).where(eq(schema.projectMilestones.clientId, clientId))
        .orderBy(asc(schema.projectMilestones.sortOrder), asc(schema.projectMilestones.createdAt)),
      db.select().from(schema.projectTasks).where(eq(schema.projectTasks.clientId, clientId))
        .orderBy(asc(schema.projectTasks.sortOrder), asc(schema.projectTasks.createdAt)),
    ]),
  );

  const tasksByMilestone = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = tasksByMilestone.get(t.milestoneId);
    if (arr) arr.push(rowToTask(t));
    else tasksByMilestone.set(t.milestoneId, [rowToTask(t)]);
  }
  const milestonesByProject = new Map<string, MilestoneWithTasks[]>();
  for (const m of milestones) {
    const withTasks: MilestoneWithTasks = { ...rowToMilestone(m), tasks: tasksByMilestone.get(m.id) ?? [] };
    const arr = milestonesByProject.get(m.projectId);
    if (arr) arr.push(withTasks);
    else milestonesByProject.set(m.projectId, [withTasks]);
  }
  return projects.map((p) => ({ ...rowToProject(p), milestones: milestonesByProject.get(p.id) ?? [] }));
}

/** Single project id → its clientId (for authorizing task/milestone edits). */
export async function getProjectClientId(projectId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ clientId: schema.clientProjects.clientId }).from(schema.clientProjects).where(eq(schema.clientProjects.id, projectId)).limit(1),
  );
  return rows[0]?.clientId ?? null;
}

/** Current status id of a project (for terminal-boundary completedAt logic). */
export async function getProjectStatus(projectId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ status: schema.clientProjects.status }).from(schema.clientProjects).where(eq(schema.clientProjects.id, projectId)).limit(1),
  );
  return rows[0]?.status ?? null;
}

/** Current status id of a task (for terminal-boundary completedAt logic). */
export async function getTaskStatus(taskId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ status: schema.projectTasks.status }).from(schema.projectTasks).where(eq(schema.projectTasks.id, taskId)).limit(1),
  );
  return rows[0]?.status ?? null;
}

/* ----------------------------------------------------------------- projects */

async function nextSortOrder(table: "milestones" | "tasks", projectId: string): Promise<number> {
  const db = getDb();
  const t = table === "milestones" ? schema.projectMilestones : schema.projectTasks;
  const rows = await withDbTimeout(
    db.select({ max: sql<number>`coalesce(max(${t.sortOrder}), -1)` }).from(t).where(eq(t.projectId, projectId)),
  );
  return (rows[0]?.max ?? -1) + 1;
}

export async function insertProject(input: {
  clientId: string;
  data: ProjectInput;
  status: string;
  createdByEmail: string | null;
  completed: boolean;
}): Promise<Project> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `prj-${randomUUID()}`,
    clientId: input.clientId,
    name: input.data.name,
    description: input.data.description ?? null,
    type: input.data.type ?? null,
    status: input.status,
    startDate: toDate(input.data.startDate),
    deliveryDate: toDate(input.data.deliveryDate),
    ownerEmail: input.data.ownerEmail ?? null,
    implementerEmail: input.data.implementerEmail ?? null,
    contactId: input.data.contactId ?? null,
    sortOrder: 0,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    updatedAt: now,
    completedAt: input.completed ? now : null,
  };
  await withDbTimeout(db.insert(schema.clientProjects).values(row));
  return rowToProject(row as ProjectRow);
}

/** Partial update of a project. `completedAtOp` explicitly sets/clears the
 *  completedAt stamp when a status change crosses the terminal boundary. */
export async function updateProject(
  projectId: string,
  patch: Partial<ProjectInput> & { status?: string },
  completedAtOp?: "set" | "clear",
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.type !== undefined) set.type = patch.type ?? null;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.startDate !== undefined) set.startDate = toDate(patch.startDate);
  if (patch.deliveryDate !== undefined) set.deliveryDate = toDate(patch.deliveryDate);
  if (patch.ownerEmail !== undefined) set.ownerEmail = patch.ownerEmail ?? null;
  if (patch.implementerEmail !== undefined) set.implementerEmail = patch.implementerEmail ?? null;
  if (patch.contactId !== undefined) set.contactId = patch.contactId ?? null;
  if (completedAtOp === "set") set.completedAt = new Date();
  else if (completedAtOp === "clear") set.completedAt = null;
  await withDbTimeout(db.update(schema.clientProjects).set(set).where(eq(schema.clientProjects.id, projectId)));
}

/** Delete a project and all its milestones + tasks (no FK cascade — text ids). */
export async function deleteProject(projectId: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.projectTasks).where(eq(schema.projectTasks.projectId, projectId)));
  await withDbTimeout(db.delete(schema.projectMilestones).where(eq(schema.projectMilestones.projectId, projectId)));
  await withDbTimeout(db.delete(schema.clientProjects).where(eq(schema.clientProjects.id, projectId)));
}

/* --------------------------------------------------------------- milestones */

export async function insertMilestone(input: {
  projectId: string;
  clientId: string;
  name: string;
  description?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
}): Promise<Milestone> {
  const db = getDb();
  const row = {
    id: `mst-${randomUUID()}`,
    projectId: input.projectId,
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? null,
    dueDate: toDate(input.dueDate),
    sortOrder: input.sortOrder ?? (await nextSortOrder("milestones", input.projectId)),
    createdAt: new Date(),
  };
  await withDbTimeout(db.insert(schema.projectMilestones).values(row));
  return rowToMilestone(row as MilestoneRow);
}

export async function updateMilestone(
  milestoneId: string,
  patch: { name?: string; description?: string | null; dueDate?: string | null },
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.dueDate !== undefined) set.dueDate = toDate(patch.dueDate);
  if (Object.keys(set).length === 0) return;
  await withDbTimeout(db.update(schema.projectMilestones).set(set).where(eq(schema.projectMilestones.id, milestoneId)));
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.projectTasks).where(eq(schema.projectTasks.milestoneId, milestoneId)));
  await withDbTimeout(db.delete(schema.projectMilestones).where(eq(schema.projectMilestones.id, milestoneId)));
}

/* -------------------------------------------------------------------- tasks */

export async function insertTask(input: {
  projectId: string;
  milestoneId: string;
  clientId: string;
  data: TaskInput;
  status: string;
  completed: boolean;
  sortOrder?: number;
}): Promise<Task> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `tsk-${randomUUID()}`,
    projectId: input.projectId,
    milestoneId: input.milestoneId,
    clientId: input.clientId,
    name: input.data.name,
    description: input.data.description ?? null,
    type: input.data.type ?? null,
    status: input.status,
    startDate: toDate(input.data.startDate),
    deliveryDate: toDate(input.data.deliveryDate),
    ownerEmail: input.data.ownerEmail ?? null,
    sortOrder: input.sortOrder ?? (await nextSortOrder("tasks", input.projectId)),
    completedAt: input.completed ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  await withDbTimeout(db.insert(schema.projectTasks).values(row));
  return rowToTask(row as TaskRow);
}

export async function updateTask(
  taskId: string,
  patch: Partial<TaskInput> & { status?: string; milestoneId?: string; projectId?: string },
  completedAtOp?: "set" | "clear",
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.type !== undefined) set.type = patch.type ?? null;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.milestoneId !== undefined) set.milestoneId = patch.milestoneId;
  // Keep projectId consistent when a task is moved to a milestone in another
  // project (only reachable via a direct API call, not the UI — the milestone
  // picker is scoped to the open project — but we keep the row coherent so
  // deleteProject's projectId-scoped cascade can never orphan or mis-target it).
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.startDate !== undefined) set.startDate = toDate(patch.startDate);
  if (patch.deliveryDate !== undefined) set.deliveryDate = toDate(patch.deliveryDate);
  if (patch.ownerEmail !== undefined) set.ownerEmail = patch.ownerEmail ?? null;
  if (completedAtOp === "set") set.completedAt = new Date();
  else if (completedAtOp === "clear") set.completedAt = null;
  await withDbTimeout(db.update(schema.projectTasks).set(set).where(eq(schema.projectTasks.id, taskId)));
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.projectTasks).where(eq(schema.projectTasks.id, taskId)));
}

/** Task id → its projectId (to resolve clientId for authorization). */
export async function getTaskProjectId(taskId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ projectId: schema.projectTasks.projectId }).from(schema.projectTasks).where(eq(schema.projectTasks.id, taskId)).limit(1),
  );
  return rows[0]?.projectId ?? null;
}

/** Milestone id → its projectId (to resolve clientId for authorization). */
export async function getMilestoneProjectId(milestoneId: string): Promise<string | null> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ projectId: schema.projectMilestones.projectId }).from(schema.projectMilestones).where(eq(schema.projectMilestones.id, milestoneId)).limit(1),
  );
  return rows[0]?.projectId ?? null;
}

/* ---------------------------------------------------------- apply template */

/** Bulk-insert a template's milestones + tasks under an existing project.
 *  Dates are computed from `startDate` + each entry's day-offset. */
export async function insertTemplateStructure(input: {
  projectId: string;
  clientId: string;
  structure: ProjectTemplateStructure;
  startDate: string | null;
  taskDefaultStatus: string;
}): Promise<void> {
  const db = getDb();
  const base = toDate(input.startDate);
  const addDays = (offset: number | null | undefined): Date | null => {
    if (base == null || offset == null) return null;
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  };
  const now = new Date();
  const milestoneRows: (typeof schema.projectMilestones.$inferInsert)[] = [];
  const taskRows: (typeof schema.projectTasks.$inferInsert)[] = [];
  const milestones = Array.isArray(input.structure?.milestones) ? input.structure.milestones : [];
  milestones.forEach((m, mi) => {
    const milestoneId = `mst-${randomUUID()}`;
    milestoneRows.push({
      id: milestoneId,
      projectId: input.projectId,
      clientId: input.clientId,
      name: m.name,
      description: m.description ?? null,
      dueDate: addDays(m.dueOffsetDays),
      sortOrder: mi,
      createdAt: now,
    });
    (m.tasks ?? []).forEach((t, ti) => {
      taskRows.push({
        id: `tsk-${randomUUID()}`,
        projectId: input.projectId,
        milestoneId,
        clientId: input.clientId,
        name: t.name,
        description: t.description ?? null,
        type: t.type ?? null,
        status: input.taskDefaultStatus,
        startDate: addDays(t.startOffsetDays),
        deliveryDate: addDays(t.deliveryOffsetDays),
        ownerEmail: null,
        sortOrder: ti,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  if (milestoneRows.length > 0) await withDbTimeout(db.insert(schema.projectMilestones).values(milestoneRows));
  if (taskRows.length > 0) await withDbTimeout(db.insert(schema.projectTasks).values(taskRows));
}

/* ---------------------------------------------------------------- templates */

export async function listTemplates(): Promise<ProjectTemplate[]> {
  const db = getDb();
  const rows = await withDbTimeout(
    db.select().from(schema.projectTemplates).orderBy(desc(schema.projectTemplates.updatedAt)),
  );
  return rows.map(rowToTemplate);
}

export async function getTemplate(id: string): Promise<ProjectTemplate | null> {
  const db = getDb();
  const rows = await withDbTimeout(db.select().from(schema.projectTemplates).where(eq(schema.projectTemplates.id, id)).limit(1));
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function insertTemplate(input: {
  name: string;
  description?: string | null;
  type?: string | null;
  structure: ProjectTemplateStructure;
  createdByEmail: string | null;
  createdByName: string | null;
}): Promise<ProjectTemplate> {
  const db = getDb();
  const now = new Date();
  const row = {
    id: `tpl-${randomUUID()}`,
    name: input.name,
    description: input.description ?? null,
    type: input.type ?? null,
    structure: input.structure,
    createdByEmail: input.createdByEmail,
    createdByName: input.createdByName,
    createdAt: now,
    updatedAt: now,
  };
  await withDbTimeout(db.insert(schema.projectTemplates).values(row));
  return rowToTemplate(row as TemplateRow);
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; description?: string | null; type?: string | null; structure?: ProjectTemplateStructure },
): Promise<void> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description ?? null;
  if (patch.type !== undefined) set.type = patch.type ?? null;
  if (patch.structure !== undefined) set.structure = patch.structure;
  await withDbTimeout(db.update(schema.projectTemplates).set(set).where(eq(schema.projectTemplates.id, id)));
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = getDb();
  await withDbTimeout(db.delete(schema.projectTemplates).where(eq(schema.projectTemplates.id, id)));
}

/** Guard helper: which client ids from a set actually exist (unused rows skip). */
export async function existingContactIds(clientId: string, contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const db = getDb();
  const rows = await withDbTimeout(
    db.select({ id: schema.clientContacts.id })
      .from(schema.clientContacts)
      .where(and(eq(schema.clientContacts.clientId, clientId), inArray(schema.clientContacts.id, contactIds))),
  );
  return new Set(rows.map((r) => r.id));
}
