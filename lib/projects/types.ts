/* =========================================================================
   Project-management domain types — the CSM-owned project tracker that lives
   on each account's "Project Management" tab.

   Shape:  Project ─┬─ Milestone ─┬─ Task
                    │             └─ Task
                    └─ Milestone ── Task

   None of this is synced from HubSpot — it's authored in-app by the CS team.
   Dates are ISO strings (the DB stores timestamptz; the repo maps to ISO so
   the client components never touch Date objects, matching Deal/Contact).
   ========================================================================= */

/** A project on an account — the top-level unit of delivery work. */
export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  /** Config-driven type id (see ProjectConfig.projectTypes). */
  type: string | null;
  /** Config-driven status id — also the kanban column the card sits in. */
  status: string;
  startDate: string | null;
  /** Target delivery / go-live date. */
  deliveryDate: string | null;
  /** Project owner — a CSM (login email of an app user). */
  ownerEmail: string | null;
  /** Implementation officer (login email of an app user). */
  implementerEmail: string | null;
  /** Client-side contact person — a client_contacts.id on this account. */
  contactId: string | null;
  sortOrder: number;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the project first enters a terminal (complete) status. */
  completedAt: string | null;
}

/** A milestone groups tasks within a project (e.g. "Kick-off", "Go-live"). */
export interface Milestone {
  id: string;
  projectId: string;
  /** Denormalised for cheap account-scoped reads + visibility checks. */
  clientId: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
}

/** A task is the atomic unit of work, owned by a milestone. */
export interface Task {
  id: string;
  projectId: string;
  milestoneId: string;
  clientId: string;
  name: string;
  description: string | null;
  /** Config-driven type id (see ProjectConfig.taskTypes). */
  type: string | null;
  /** Config-driven status id (see ProjectConfig.taskStatuses). */
  status: string;
  startDate: string | null;
  deliveryDate: string | null;
  /** Task owner — login email of an app user. */
  ownerEmail: string | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A milestone with its tasks assembled — the unit the drawer renders. */
export interface MilestoneWithTasks extends Milestone {
  tasks: Task[];
}

/** A fully-assembled project (milestones + tasks) for the detail drawer. */
export interface ProjectDetail extends Project {
  milestones: MilestoneWithTasks[];
}

/* ------------------------------------------------------------------ templates */

/** A task inside a template blueprint. Offsets are relative to the project
 *  start date (in days) so applying a template auto-computes real dates. */
export interface TemplateTask {
  name: string;
  description?: string | null;
  type?: string | null;
  startOffsetDays?: number | null;
  deliveryOffsetDays?: number | null;
}

/** A milestone inside a template blueprint. */
export interface TemplateMilestone {
  name: string;
  description?: string | null;
  dueOffsetDays?: number | null;
  tasks: TemplateTask[];
}

/** The reusable structure captured by a project template (stored as JSONB). */
export interface ProjectTemplateStructure {
  milestones: TemplateMilestone[];
}

/** A saved, workspace-global project template — any CSM/super-admin can use
 *  any template; the creator (or a super-admin) can edit/delete it. */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  structure: ProjectTemplateStructure;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------- create/update inputs */

export interface ProjectInput {
  name: string;
  description?: string | null;
  type?: string | null;
  status?: string;
  startDate?: string | null;
  deliveryDate?: string | null;
  ownerEmail?: string | null;
  implementerEmail?: string | null;
  contactId?: string | null;
}

export interface MilestoneInput {
  name: string;
  description?: string | null;
  dueDate?: string | null;
}

export interface TaskInput {
  name: string;
  description?: string | null;
  type?: string | null;
  status?: string;
  startDate?: string | null;
  deliveryDate?: string | null;
  ownerEmail?: string | null;
}
