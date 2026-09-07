/* Sample data for the Work prototype — one account. Illustrative only. */

export type Lifecycle = "planned" | "active" | "paused" | "completed" | "cancelled";
export type Delivery = "on_track" | "at_risk" | "off_track" | "not_assessed";
export type TaskSource = "project" | "standalone" | "signal" | "pulse";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export const LIFECYCLE: Record<Lifecycle, { label: string; tone: string }> = {
  planned: { label: "Planned", tone: "border-border bg-bg-muted text-fg-muted" },
  active: { label: "Active", tone: "border-sirius/30 bg-accent-soft text-sirius" },
  paused: { label: "Paused", tone: "border-[#8A6D12]/25 bg-[#8A6D12]/[0.07] text-[#8A6D12]" },
  completed: { label: "Completed", tone: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]" },
  cancelled: { label: "Cancelled", tone: "border-border bg-bg-muted text-fg-subtle" },
};

export const DELIVERY: Record<Delivery, { label: string; dot: string; text: string }> = {
  on_track: { label: "On track", dot: "bg-[#1F9D63]", text: "text-[#1F9D63]" },
  at_risk: { label: "At risk", dot: "bg-[#C99A14]", text: "text-[#8A6D12]" },
  off_track: { label: "Off track", dot: "bg-[#B23A57]", text: "text-[#B23A57]" },
  not_assessed: { label: "Not assessed", dot: "bg-fg-subtle", text: "text-fg-subtle" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: "To do", tone: "border-border bg-bg-muted text-fg-muted" },
  in_progress: { label: "In progress", tone: "border-sirius/30 bg-accent-soft text-sirius" },
  blocked: { label: "Blocked", tone: "border-[#B23A57]/25 bg-[#B23A57]/[0.06] text-[#B23A57]" },
  done: { label: "Done", tone: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]" },
};

export interface ProjectTask {
  id: string;
  name: string;
  status: TaskStatus;
  ownerEmail: string | null;
  dueDate: string | null;
}

export interface Milestone {
  name: string;
  dueDate: string | null;
  tasks: ProjectTask[];
}

export interface WorkProject {
  id: string;
  name: string;
  type: string;
  lifecycle: Lifecycle;
  delivery: Delivery;
  /** Why the project exists — the first thing the drawer shows. */
  outcome: string;
  useCase: string | null;
  ownerEmail: string;
  implementerEmail: string | null;
  baselineDate: string;
  forecastDate: string;
  milestones: Milestone[];
}

export const PROJECTS: WorkProject[] = [
  {
    id: "p1",
    name: "Perform rollout — annual cycle",
    type: "Implementation",
    lifecycle: "active",
    delivery: "off_track",
    outcome: "Run the first company-wide performance cycle, so managers review their teams inside Lumofy instead of spreadsheets.",
    useCase: "Annual performance cycle",
    ownerEmail: "ali@lumofy.com",
    implementerEmail: "qasim@lumofy.com",
    baselineDate: "2026-05-30",
    forecastDate: "2026-10-15",
    milestones: [
      { name: "Kick-off and scoping", dueDate: "2026-03-10", tasks: [
        { id: "p1t1", name: "Scoping workshop", status: "done", ownerEmail: "qasim@lumofy.com", dueDate: "2026-03-04" },
        { id: "p1t2", name: "Agree participant population", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-03-10" },
      ] },
      { name: "Competency framework mapped", dueDate: "2026-04-28", tasks: [
        { id: "p1t3", name: "Import job architecture", status: "done", ownerEmail: "qasim@lumofy.com", dueDate: "2026-04-14" },
        { id: "p1t4", name: "Review generated competencies", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-04-28" },
      ] },
      { name: "Cycle configuration signed off", dueDate: "2026-08-22", tasks: [
        { id: "p1t5", name: "Draft cycle configuration", status: "done", ownerEmail: "qasim@lumofy.com", dueDate: "2026-07-20" },
        { id: "p1t6", name: "Escalate job-architecture decision to the CHRO", status: "in_progress", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-11" },
        { id: "p1t7", name: "Sponsor sign-off", status: "blocked", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-22" },
      ] },
      { name: "Manager enablement", dueDate: "2026-09-19", tasks: [
        { id: "p1t8", name: "Build manager guide", status: "todo", ownerEmail: "qasim@lumofy.com", dueDate: "2026-09-05" },
        { id: "p1t9", name: "Run two enablement sessions", status: "todo", ownerEmail: "qasim@lumofy.com", dueDate: "2026-09-19" },
      ] },
      { name: "Cycle live", dueDate: "2026-10-15", tasks: [
        { id: "p1t10", name: "Launch cycle", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-10-15" },
      ] },
    ],
  },
  {
    id: "p2",
    name: "Compliance programme 2026",
    type: "Training",
    lifecycle: "active",
    delivery: "on_track",
    outcome: "Get every employee through mandatory regulatory training before the audit window closes.",
    useCase: "Compliance training at scale",
    ownerEmail: "ali@lumofy.com",
    implementerEmail: null,
    baselineDate: "2026-11-30",
    forecastDate: "2026-11-30",
    milestones: [
      { name: "Content assigned", dueDate: "2026-06-15", tasks: [
        { id: "p2t1", name: "Assign to all populations", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-06-15" },
      ] },
      { name: "Second reminder campaign", dueDate: "2026-09-01", tasks: [
        { id: "p2t2", name: "Draft reminder copy", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-20" },
        { id: "p2t3", name: "Send second compliance reminder", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-09-01" },
      ] },
      { name: "Audit evidence pack", dueDate: "2026-11-30", tasks: [
        { id: "p2t4", name: "Export completion evidence", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-11-30" },
      ] },
    ],
  },
  {
    id: "p3",
    name: "Engage pilot — employee listening",
    type: "Expansion",
    lifecycle: "planned",
    delivery: "not_assessed",
    outcome: "Prove employee listening on one business unit before a wider purchase conversation.",
    useCase: null,
    ownerEmail: "ali@lumofy.com",
    implementerEmail: null,
    baselineDate: "2026-10-01",
    forecastDate: "2026-10-01",
    milestones: [
      { name: "Pilot scope agreed", dueDate: "2026-09-05", tasks: [
        { id: "p3t1", name: "Agree the pilot business unit", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-09-05" },
      ] },
    ],
  },
  {
    id: "p4",
    name: "Recovery — usage re-activation",
    type: "Recovery",
    lifecycle: "completed",
    delivery: "on_track",
    outcome: "Reverse the drop in monthly actives after the March slowdown.",
    useCase: null,
    ownerEmail: "ali@lumofy.com",
    implementerEmail: null,
    baselineDate: "2026-05-31",
    forecastDate: "2026-05-24",
    milestones: [
      { name: "Re-activation campaign", dueDate: "2026-05-24", tasks: [
        { id: "p4t1", name: "Run re-activation campaign", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-05-24" },
      ] },
    ],
  },
];

/** The unified task list: project tasks plus standalone, signal and Pulse tasks. */
export interface WorkTask {
  id: string;
  title: string;
  status: TaskStatus;
  ownerEmail: string | null;
  dueDate: string | null;
  source: TaskSource;
  /** Project · milestone, when the task belongs to one. */
  project: string | null;
  milestone: string | null;
  /** What produced it, for signal and Pulse tasks. */
  origin: string | null;
}

export const STANDALONE_TASKS: WorkTask[] = [
  { id: "s1", title: "Reply to the renewal email and share a counter offer", status: "in_progress", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-08", source: "standalone", project: null, milestone: null, origin: null },
  { id: "s2", title: "Start Perform — bought, never used", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-14", source: "signal", project: null, milestone: null, origin: "Usage · module owned and unused" },
  { id: "s3", title: "Confirm sponsor coverage before renewal", status: "todo", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-20", source: "pulse", project: null, milestone: null, origin: "CS Pulse · stakeholder coverage rated Weak" },
  { id: "s4", title: "Book the Q3 business review", status: "done", ownerEmail: "ali@lumofy.com", dueDate: "2026-08-01", source: "standalone", project: null, milestone: null, origin: null },
];

/** Project tasks flattened into the same shape, so both live in one table. */
export function allTasks(): WorkTask[] {
  const fromProjects: WorkTask[] = PROJECTS.flatMap((p) =>
    p.milestones.flatMap((m) =>
      m.tasks.map((t) => ({
        id: t.id,
        title: t.name,
        status: t.status,
        ownerEmail: t.ownerEmail,
        dueDate: t.dueDate,
        source: "project" as const,
        project: p.name,
        milestone: m.name,
        origin: null,
      })),
    ),
  );
  const rank: Record<TaskStatus, number> = { blocked: 0, in_progress: 1, todo: 2, done: 3 };
  return [...STANDALONE_TASKS, ...fromProjects].sort(
    (a, b) => rank[a.status] - rank[b.status] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"),
  );
}

export const PEOPLE: Record<string, string> = {
  "ali@lumofy.com": "Ali Abbas",
  "qasim@lumofy.com": "Qasim Alshakhoori",
};

export const name = (email: string | null) => (email ? PEOPLE[email] ?? email : "Unassigned");

export const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/** The first milestone that still has unfinished tasks. */
export const nextMilestone = (p: WorkProject): Milestone | null =>
  p.milestones.find((m) => m.tasks.some((t) => t.status !== "done")) ?? null;
