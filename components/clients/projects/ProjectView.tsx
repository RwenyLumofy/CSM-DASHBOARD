"use client";

/* Full-width project focus view — opens over the whole content area (with a
   Back button) so the task kanban has room to breathe instead of being crammed
   into a narrow drawer. Two modes: a Checklist (grouped by milestone) and a
   Task board (kanban by task status). All mutations go through the `api`
   handed down by ProjectsTab, which applies them optimistically for instant,
   animated feedback and reconciles with the server. */

import { useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  LayoutGrid,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { MilestoneInput, MilestoneWithTasks, ProjectDetail, ProjectInput, Task, TaskInput } from "@/lib/projects/types";
import {
  OptionPill,
  OwnerAvatar,
  StatusSelect,
  formatDate,
  isOverdue,
  memberName,
  projectProgress,
  type ProjectsContext,
} from "./shared";
import { MilestoneFormModal, NamePromptModal, ProjectFormModal, TaskFormModal } from "./forms";

export type Result = { ok: boolean; error?: string };

/** The optimistic mutation surface ProjectsTab hands to the focus view. */
export interface ProjectApi {
  /** Instant, fire-and-forget (toast on failure). */
  moveTask(task: Task, toStatus: string): void;
  toggleTask(task: Task): void;
  deleteTask(task: Task): void;
  deleteMilestone(m: MilestoneWithTasks): void;
  deleteProject(): void;
  /** Modal-driven (awaited so the modal can show validation errors). */
  addTask(milestoneId: string, input: TaskInput): Promise<Result>;
  editTask(task: Task, patch: TaskInput & { milestoneId: string }): Promise<Result>;
  addMilestone(input: MilestoneInput): Promise<Result>;
  editMilestone(id: string, patch: { name?: string; description?: string | null; dueDate?: string | null }): Promise<Result>;
  updateProject(patch: Partial<ProjectInput> & { status?: string }): Promise<Result>;
  saveAsTemplate(name: string, description: string | null): Promise<Result>;
  /** Task id that most recently landed via drag, to play the "landed" pulse. */
  lastMovedTaskId: string | null;
}

type View = "checklist" | "board";

export function ProjectView({ ctx, project, api, onClose }: { ctx: ProjectsContext; project: ProjectDetail; api: ProjectApi; onClose: () => void }) {
  const [view, setView] = useState<View>("checklist");
  const [editProject, setEditProject] = useState(false);
  const [addMilestone, setAddMilestone] = useState(false);
  const [editMilestone, setEditMilestone] = useState<MilestoneWithTasks | null>(null);
  const [taskModal, setTaskModal] = useState<{ milestoneId: string; task: Task | null } | null>(null);
  const [saveTemplate, setSaveTemplate] = useState(false);

  const { config, canManage } = ctx;
  const progress = projectProgress(project, config);
  const doneStatusId = config.taskStatuses.find((s) => s.terminal === "done")?.id ?? null;
  const milestoneOptions = project.milestones.map((m) => ({ id: m.id, name: m.name }));
  const complete = progress.total > 0 && progress.done === progress.total;

  function confirmRemoveProject() {
    if (confirm(`Delete project "${project.name}"? This removes all its milestones and tasks and can't be undone.`)) {
      api.deleteProject();
    }
  }

  return (
    <div className="pm-overlay-in fixed inset-0 z-40 flex flex-col bg-bg">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3 sm:px-8">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-sirius-200 hover:text-sirius">
          <ArrowLeft size={15} /> Projects
        </button>
        <OptionPill options={config.projectTypes} id={project.type} />
        <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-fg">{project.name}</h1>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditProject(true)} title="Edit project" className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
              <Pencil size={15} />
            </button>
            <Button size="sm" variant="secondary" onClick={() => setSaveTemplate(true)}>Save as template</Button>
            <button onClick={confirmRemoveProject} title="Delete project" className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-[#B23A57]">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Meta strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border px-5 py-3.5 sm:px-8">
        <Meta label="Status">
          <StatusSelect options={config.projectStatuses} value={project.status} onChange={(s) => void api.updateProject({ status: s })} disabled={!canManage} />
        </Meta>
        <Meta label="Owner (CSM)"><Person name={memberName(ctx.csms, project.ownerEmail)} /></Meta>
        <Meta label="Implementer"><Person name={memberName(ctx.implementers, project.implementerEmail)} /></Meta>
        <Meta label="Contact"><Person name={ctx.contacts.find((c) => c.id === project.contactId)?.name ?? null} /></Meta>
        <Meta label="Start"><span className="font-body text-[13px] text-fg">{formatDate(project.startDate)}</span></Meta>
        <Meta label="Delivery">
          <span className={cn("font-body text-[13px]", isOverdue(project.deliveryDate) && !complete ? "font-semibold text-[#B23A57]" : "text-fg")}>{formatDate(project.deliveryDate)}</span>
        </Meta>
        <Meta label="Progress">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-muted">
              <div className={cn("h-full rounded-full transition-all duration-500", complete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${progress.pct}%` }} />
            </div>
            <span className="tabular-nums font-body text-[12px] font-semibold text-fg-muted">{progress.done}/{progress.total}</span>
          </div>
        </Meta>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {([["checklist", "Checklist", ListChecks], ["board", "Task board", LayoutGrid]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
                view === key ? "bg-accent-soft text-sirius" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {canManage && <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)}>Milestone</Button>}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-8 sm:px-8">
        {project.milestones.length === 0 ? (
          <div className="pm-in mx-auto mt-10 flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <ListChecks size={24} className="mb-2 text-fg-subtle" />
            <p className="font-body text-[14px] font-semibold text-fg">No milestones yet</p>
            <p className="mt-1 font-body text-[13px] text-fg-muted">Break this project into milestones, then add tasks under each.</p>
            {canManage && <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)} className="mt-4">Add milestone</Button>}
          </div>
        ) : view === "checklist" ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-5 pt-1">
            {project.milestones.map((m) => (
              <MilestoneSection
                key={m.id}
                ctx={ctx}
                milestone={m}
                doneStatusId={doneStatusId}
                lastMovedTaskId={api.lastMovedTaskId}
                onToggle={(t) => api.toggleTask(t)}
                onStatus={(t, s) => api.moveTask(t, s)}
                onEditTask={(t) => setTaskModal({ milestoneId: m.id, task: t })}
                onAddTask={() => setTaskModal({ milestoneId: m.id, task: null })}
                onDeleteTask={(t) => { if (confirm(`Delete task "${t.name}"?`)) api.deleteTask(t); }}
                onEditMilestone={() => setEditMilestone(m)}
                onDeleteMilestone={() => { if (confirm(`Delete milestone "${m.name}" and its ${m.tasks.length} task(s)?`)) api.deleteMilestone(m); }}
              />
            ))}
          </div>
        ) : (
          <TaskBoard ctx={ctx} project={project} api={api} onEditTask={(t) => setTaskModal({ milestoneId: t.milestoneId, task: t })} />
        )}
      </div>

      {/* Modals */}
      {editProject && (
        <ProjectFormModal ctx={ctx} mode="edit" initial={project} onClose={() => setEditProject(false)} onSubmit={async (values) => api.updateProject(values)} />
      )}
      {addMilestone && (
        <MilestoneFormModal onClose={() => setAddMilestone(false)} onSubmit={async (values) => api.addMilestone(values)} />
      )}
      {editMilestone && (
        <MilestoneFormModal
          initial={{ name: editMilestone.name, description: editMilestone.description, dueDate: editMilestone.dueDate }}
          onClose={() => setEditMilestone(null)}
          onSubmit={async (values) => api.editMilestone(editMilestone.id, values)}
        />
      )}
      {taskModal && (
        <TaskFormModal
          ctx={ctx}
          initial={taskModal.task}
          milestones={milestoneOptions}
          defaultMilestoneId={taskModal.milestoneId}
          onClose={() => setTaskModal(null)}
          onSubmit={async (values) => {
            const { milestoneId, ...rest } = values;
            return taskModal.task ? api.editTask(taskModal.task, { ...rest, milestoneId }) : api.addTask(milestoneId, rest);
          }}
        />
      )}
      {saveTemplate && (
        <NamePromptModal title="Save as template" label="Template name" submitLabel="Save template" withDescription onClose={() => setSaveTemplate(false)} onSubmit={(name, description) => api.saveAsTemplate(name, description)} />
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-body text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
      {children}
    </div>
  );
}

function Person({ name }: { name: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <OwnerAvatar name={name} size={20} />
      <span className="truncate font-body text-[13px] text-fg">{name ?? "Unassigned"}</span>
    </div>
  );
}

/* ------------------------------------------------------------ checklist view */

function MilestoneSection({
  ctx,
  milestone,
  doneStatusId,
  lastMovedTaskId,
  onToggle,
  onStatus,
  onEditTask,
  onAddTask,
  onDeleteTask,
  onEditMilestone,
  onDeleteMilestone,
}: {
  ctx: ProjectsContext;
  milestone: MilestoneWithTasks;
  doneStatusId: string | null;
  lastMovedTaskId: string | null;
  onToggle: (t: Task) => void;
  onStatus: (t: Task, s: string) => void;
  onEditTask: (t: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (t: Task) => void;
  onEditMilestone: () => void;
  onDeleteMilestone: () => void;
}) {
  const [open, setOpen] = useState(true);
  const doneCount = doneStatusId ? milestone.tasks.filter((t) => t.status === doneStatusId).length : 0;

  return (
    <div className="pm-in overflow-hidden rounded-2xl border border-border">
      <div className="flex items-center gap-2 bg-bg-muted/40 px-4 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="text-fg-subtle transition-colors hover:text-fg">
          <ChevronDown size={15} className={cn("transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-body text-[14px] font-semibold text-fg">{milestone.name}</span>
          <span className="tabular-nums shrink-0 rounded-full bg-bg-muted px-1.5 py-px font-body text-[10.5px] font-semibold text-fg-subtle">{doneCount}/{milestone.tasks.length}</span>
        </div>
        {milestone.dueDate && (
          <span className={cn("inline-flex items-center gap-1 font-body text-[11.5px]", isOverdue(milestone.dueDate) ? "text-[#B23A57]" : "text-fg-muted")}>
            <CalendarDays size={12} /> {formatDate(milestone.dueDate)}
          </span>
        )}
        {ctx.canManage && (
          <div className="flex items-center gap-0.5">
            <button onClick={onEditMilestone} title="Edit milestone" className="rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"><Pencil size={13} /></button>
            <button onClick={onDeleteMilestone} title="Delete milestone" className="rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-[#B23A57]"><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="divide-y divide-border-subtle">
          {milestone.tasks.length === 0 ? (
            <div className="px-4 py-3 font-body text-[12.5px] text-fg-subtle">No tasks yet.</div>
          ) : (
            milestone.tasks.map((t) => (
              <TaskRow key={t.id} ctx={ctx} task={t} doneStatusId={doneStatusId} landed={t.id === lastMovedTaskId} onToggle={onToggle} onStatus={onStatus} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} />
            ))
          )}
          {ctx.canManage && (
            <button onClick={onAddTask} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left font-body text-[12.5px] font-medium text-sirius transition-colors hover:bg-accent-soft/50">
              <Plus size={13} /> Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  ctx,
  task,
  doneStatusId,
  landed,
  onToggle,
  onStatus,
  onEdit,
  onDelete,
}: {
  ctx: ProjectsContext;
  task: Task;
  doneStatusId: string | null;
  landed: boolean;
  onToggle: (t: Task) => void;
  onStatus: (t: Task, s: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = doneStatusId != null && task.status === doneStatusId;
  const ownerName = memberName(ctx.members, task.ownerEmail);
  return (
    <div className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-muted/30", landed && "pm-land")}>
      <button
        onClick={() => onToggle(task)}
        disabled={!ctx.canManage || !doneStatusId}
        title={isDone ? "Mark not done" : "Mark done"}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-200",
          isDone ? "border-[#2DB47A] bg-[#2DB47A] text-white" : "border-border-strong hover:border-sirius hover:scale-110",
          !ctx.canManage && "cursor-default opacity-70",
        )}
      >
        {isDone && <Check size={12} strokeWidth={3} className="pm-check" />}
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className={cn("truncate font-body text-[13px] transition-colors", isDone ? "text-fg-subtle line-through" : "text-fg")}>{task.name}</span>
      </button>
      {task.type && <OptionPill options={ctx.config.taskTypes} id={task.type} />}
      {task.deliveryDate && (
        <span className={cn("hidden items-center gap-1 whitespace-nowrap font-body text-[11.5px] sm:inline-flex", isOverdue(task.deliveryDate) && !isDone ? "text-[#B23A57]" : "text-fg-muted")}>
          <CalendarDays size={11} /> {formatDate(task.deliveryDate)}
        </span>
      )}
      {ownerName && <OwnerAvatar name={ownerName} size={22} title="Owner" />}
      <StatusSelect options={ctx.config.taskStatuses} value={task.status} onChange={(s) => onStatus(task, s)} disabled={!ctx.canManage} align="right" />
      {ctx.canManage && (
        <button onClick={onDelete} title="Delete task" className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-bg-muted hover:text-[#B23A57] group-hover:opacity-100">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- board view */

function TaskBoard({ ctx, project, api, onEditTask }: { ctx: ProjectsContext; project: ProjectDetail; api: ProjectApi; onEditTask: (t: Task) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const didDrag = useRef(false);
  const allTasks: Task[] = project.milestones.flatMap((m) => m.tasks);
  const milestoneName = (id: string) => project.milestones.find((m) => m.id === id)?.name ?? "";
  const knownStatus = new Set(ctx.config.taskStatuses.map((s) => s.id));
  const orphans = allTasks.filter((t) => !knownStatus.has(t.status));

  function drop(statusId: string, e: React.DragEvent) {
    // Read the id from the drag payload first (survives any re-render timing),
    // falling back to state — this is the reliable fix for "drop doesn't move".
    const id = e.dataTransfer.getData("text/plain") || dragId;
    const t = id ? allTasks.find((x) => x.id === id) : null;
    if (t && t.status !== statusId) api.moveTask(t, statusId);
    setDragId(null);
    setOverCol(null);
  }

  const card = (t: Task) => (
    <div
      key={t.id}
      draggable={ctx.canManage}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; didDrag.current = true; setDragId(t.id); }}
      onDragEnd={() => { setDragId(null); setOverCol(null); }}
      onClick={() => { if (didDrag.current) { didDrag.current = false; return; } onEditTask(t); }}
      className={cn(
        "rounded-xl border border-border bg-bg p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-sirius-200 hover:shadow-md",
        ctx.canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragId === t.id && "opacity-40",
        t.id === api.lastMovedTaskId && "pm-land",
      )}
    >
      <div className="font-body text-[12.5px] font-medium leading-snug text-fg">{t.name}</div>
      <div className="mt-1 truncate font-body text-[11px] text-fg-subtle">{milestoneName(t.milestoneId)}</div>
      <div className="mt-2 flex items-center gap-2">
        {t.type && <OptionPill options={ctx.config.taskTypes} id={t.type} />}
        {t.deliveryDate && (
          <span className={cn("inline-flex items-center gap-1 font-body text-[10.5px]", isOverdue(t.deliveryDate) ? "text-[#B23A57]" : "text-fg-muted")}>
            <CalendarDays size={10} /> {formatDate(t.deliveryDate)}
          </span>
        )}
        {t.ownerEmail && <span className="ml-auto"><OwnerAvatar name={memberName(ctx.members, t.ownerEmail)} size={18} /></span>}
      </div>
    </div>
  );

  const column = (statusId: string, label: React.ReactNode, tasks: Task[], droppable: boolean) => (
    <div
      key={statusId}
      onDragOver={(e) => { if (!droppable) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverCol(statusId); }}
      onDragLeave={() => setOverCol((c) => (c === statusId ? null : c))}
      onDrop={(e) => { if (!droppable) return; e.preventDefault(); drop(statusId, e); }}
      className={cn(
        "flex min-w-[240px] flex-1 flex-col rounded-2xl border bg-bg-muted/30 transition-colors duration-150",
        overCol === statusId ? "border-sirius bg-accent-soft/40 ring-2 ring-sirius/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">{label}<span className="tabular-nums ml-auto font-body text-[11px] font-semibold text-fg-subtle">{tasks.length}</span></div>
      <div className="flex min-h-[80px] flex-col gap-2 px-2 pb-2">
        {tasks.map(card)}
        {tasks.length === 0 && <div className="rounded-lg border border-dashed border-border/60 px-1 py-4 text-center font-body text-[11px] text-fg-subtle">Drop here</div>}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 pt-1">
      {ctx.config.taskStatuses.map((s) =>
        column(s.id, <OptionPill options={ctx.config.taskStatuses} id={s.id} dot />, allTasks.filter((t) => t.status === s.id), ctx.canManage),
      )}
      {orphans.length > 0 &&
        column(
          "__orphan",
          <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold text-fg-subtle"><span className="size-1.5 rounded-full bg-neutral-400" /> Uncategorized</span>,
          orphans,
          false,
        )}
    </div>
  );
}
