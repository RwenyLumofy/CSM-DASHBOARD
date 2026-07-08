/* =========================================================================
   Project-management option config — the admin-editable vocabularies for
   project/task Status and Type. Stored in workspace_config under the
   PROJECT_CONFIG_KEY key (one JSONB blob), edited by super-admins in Settings.

   Kept pure (no DB/Clerk imports) so it's safe to import from both client and
   server. The persistence helpers live in lib/projects/data.ts.
   ========================================================================= */

/** Colour tokens — mirror the Badge component's tones so an option id can be
 *  rendered as a pill directly (<Badge tone={option.color}>). */
export type ProjectColor =
  | "sirius"
  | "aurora"
  | "stellar"
  | "nova"
  | "eclipse"
  | "cosmos"
  | "halo"
  | "neutral";

/** A selectable option (project/task type, or a non-status pill). */
export interface OptionDef {
  id: string;
  label: string;
  color: ProjectColor;
}

/** A status option — additionally a kanban column. `terminal` marks statuses
 *  that mean the work is finished: `done` drives task-progress + completedAt;
 *  `complete` stamps a project's completedAt. */
export interface StatusOption extends OptionDef {
  terminal?: "complete" | "done";
}

export interface ProjectConfig {
  projectStatuses: StatusOption[];
  projectTypes: OptionDef[];
  taskStatuses: StatusOption[];
  taskTypes: OptionDef[];
}

/** workspace_config key holding the ProjectConfig blob. */
export const PROJECT_CONFIG_KEY = "project_management";

/** Sensible, Vitally/Planhat-style defaults used until a super-admin edits
 *  them. Also the seed the Settings editor starts from. */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  projectStatuses: [
    { id: "not_started", label: "Not started", color: "neutral" },
    { id: "in_progress", label: "In progress", color: "sirius" },
    { id: "at_risk", label: "At risk", color: "stellar" },
    { id: "on_hold", label: "On hold", color: "eclipse" },
    { id: "completed", label: "Completed", color: "aurora", terminal: "complete" },
    { id: "cancelled", label: "Cancelled", color: "nova", terminal: "complete" },
  ],
  projectTypes: [
    { id: "onboarding", label: "Onboarding", color: "sirius" },
    { id: "implementation", label: "Implementation", color: "eclipse" },
    { id: "expansion", label: "Expansion", color: "aurora" },
    { id: "training", label: "Training", color: "stellar" },
    { id: "renewal", label: "Renewal", color: "halo" },
    { id: "recovery", label: "Recovery", color: "nova" },
  ],
  taskStatuses: [
    { id: "todo", label: "To do", color: "neutral" },
    { id: "in_progress", label: "In progress", color: "sirius" },
    { id: "blocked", label: "Blocked", color: "nova" },
    { id: "done", label: "Done", color: "aurora", terminal: "done" },
  ],
  taskTypes: [
    { id: "internal", label: "Internal", color: "neutral" },
    { id: "client", label: "Client", color: "sirius" },
    { id: "call", label: "Call", color: "eclipse" },
    { id: "meeting", label: "Meeting", color: "eclipse" },
    { id: "configuration", label: "Configuration", color: "stellar" },
    { id: "training", label: "Training", color: "stellar" },
    { id: "content", label: "Content", color: "halo" },
    { id: "review", label: "Review", color: "aurora" },
  ],
};

const COLORS: ProjectColor[] = ["sirius", "aurora", "stellar", "nova", "eclipse", "cosmos", "halo", "neutral"];

function cleanOption(raw: unknown): OptionDef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!id || !label) return null;
  const color = typeof o.color === "string" && COLORS.includes(o.color as ProjectColor) ? (o.color as ProjectColor) : "neutral";
  return { id, label, color };
}

function cleanStatus(raw: unknown): StatusOption | null {
  const base = cleanOption(raw);
  if (!base) return null;
  const terminal = (raw as Record<string, unknown>).terminal;
  return terminal === "complete" || terminal === "done" ? { ...base, terminal } : base;
}

function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

/**
 * Coerce a persisted (untrusted) value into a valid ProjectConfig, falling
 * back to defaults for any list that's missing or ends up empty — so a
 * malformed/partial blob can never leave the board with zero status columns.
 */
export function normalizeProjectConfig(raw: unknown): ProjectConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, clean: (r: unknown) => OptionDef | null, fallback: OptionDef[]) => {
    const arr = Array.isArray(v) ? dedupeById(v.map(clean).filter(Boolean) as OptionDef[]) : [];
    return arr.length > 0 ? arr : fallback;
  };
  return {
    // Project statuses may have MULTIPLE "complete" statuses (e.g. both
    // "Completed" and "Cancelled") — isProjectComplete() checks a status by
    // its own id, and the "Mark complete" button only ever needs ONE target,
    // so nothing here requires a single answer the way task-done does.
    projectStatuses: list(src.projectStatuses, cleanStatus, DEFAULT_PROJECT_CONFIG.projectStatuses) as StatusOption[],
    projectTypes: list(src.projectTypes, cleanOption, DEFAULT_PROJECT_CONFIG.projectTypes),
    // Task statuses ARE constrained to one "done" status: the checklist's
    // per-task checkbox and doneStatusId both need a single answer, while
    // projectProgress() sums every terminal status — multiple "done" statuses
    // would make the progress bar and the checkbox disagree.
    taskStatuses: singleTerminal(list(src.taskStatuses, cleanStatus, DEFAULT_PROJECT_CONFIG.taskStatuses) as StatusOption[]),
    taskTypes: list(src.taskTypes, cleanOption, DEFAULT_PROJECT_CONFIG.taskTypes),
  };
}

/** Keep at most ONE terminal status per list (the first) so the progress bar
 *  (counts all terminal) and the drawer (uses the first terminal) never disagree. */
function singleTerminal(list: StatusOption[]): StatusOption[] {
  let seen = false;
  return list.map((s) => {
    if (!s.terminal) return s;
    if (seen) return { ...s, terminal: undefined };
    seen = true;
    return s;
  });
}

/** Look up an option by id, tolerating an unknown/removed id (renders neutral). */
export function optionById(options: OptionDef[], id: string | null | undefined): OptionDef | null {
  if (!id) return null;
  return options.find((o) => o.id === id) ?? null;
}

/** Fallback pill for an id no longer in the config (an option was deleted). */
export function unknownOption(id: string): OptionDef {
  return { id, label: id.replace(/[_-]+/g, " "), color: "neutral" };
}

/** First non-terminal status id — the default column a new project lands in. */
export function defaultProjectStatusId(config: ProjectConfig): string {
  return (config.projectStatuses.find((s) => !s.terminal) ?? config.projectStatuses[0]).id;
}

/** Default status id for a new task (first non-terminal task status). */
export function defaultTaskStatusId(config: ProjectConfig): string {
  return (config.taskStatuses.find((s) => !s.terminal) ?? config.taskStatuses[0]).id;
}

/** Is this task-status id a "done" (progress-counting) status? */
export function isTaskDone(config: ProjectConfig, statusId: string): boolean {
  return config.taskStatuses.find((s) => s.id === statusId)?.terminal === "done";
}

/** Is this project-status id terminal (project considered complete)? */
export function isProjectComplete(config: ProjectConfig, statusId: string): boolean {
  return config.projectStatuses.find((s) => s.id === statusId)?.terminal === "complete";
}

/**
 * Coerce an untrusted template structure (persisted JSONB or a crafted action
 * payload) into a valid shape, so one malformed row can never break the
 * (workspace-global) template UI or the apply path. Non-objects and entries
 * without a name are dropped; offsets are coerced to finite numbers or null.
 */
export function normalizeTemplateStructure(raw: unknown): { milestones: TemplateMilestoneShape[] } {
  const src = (raw && typeof raw === "object" ? raw : {}) as { milestones?: unknown };
  const milestones = Array.isArray(src.milestones) ? src.milestones : [];
  return {
    milestones: milestones
      .map((m): TemplateMilestoneShape | null => {
        if (!m || typeof m !== "object") return null;
        const mm = m as Record<string, unknown>;
        const name = typeof mm.name === "string" ? mm.name.trim() : "";
        if (!name) return null;
        const tasks = Array.isArray(mm.tasks) ? mm.tasks : [];
        return {
          name,
          description: typeof mm.description === "string" ? mm.description : null,
          dueOffsetDays: num(mm.dueOffsetDays),
          tasks: tasks
            .map((t): TemplateTaskShape | null => {
              if (!t || typeof t !== "object") return null;
              const tt = t as Record<string, unknown>;
              const tName = typeof tt.name === "string" ? tt.name.trim() : "";
              if (!tName) return null;
              return {
                name: tName,
                description: typeof tt.description === "string" ? tt.description : null,
                type: typeof tt.type === "string" ? tt.type : null,
                startOffsetDays: num(tt.startOffsetDays),
                deliveryOffsetDays: num(tt.deliveryOffsetDays),
              };
            })
            .filter(Boolean) as TemplateTaskShape[],
        };
      })
      .filter(Boolean) as TemplateMilestoneShape[],
  };
}

interface TemplateTaskShape {
  name: string;
  description: string | null;
  type: string | null;
  startOffsetDays: number | null;
  deliveryOffsetDays: number | null;
}
interface TemplateMilestoneShape {
  name: string;
  description: string | null;
  dueOffsetDays: number | null;
  tasks: TemplateTaskShape[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
