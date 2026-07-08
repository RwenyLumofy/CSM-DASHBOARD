"use client";

/* Project detail — a large centred LIGHTBOX (not a full page): backdrop +
   rounded panel, up to 1160px wide and 92vh tall, with its own internal
   scroll. Two modes: a Checklist (milestones -> task rows) and a Task board
   (kanban by task status). Owner/implementer/status are inline-editable via
   portal menus (never clipped). All mutations go through the `api` handed down
   by ProjectsTab, which applies them optimistically for instant feedback. */

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, CheckCircle2, ChevronDown, LayoutGrid, ListChecks, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { defaultProjectStatusId, isProjectComplete } from "@/lib/projects/config";
import type { MilestoneInput, MilestoneWithTasks, ProjectDetail, ProjectInput, Task, TaskInput } from "@/lib/projects/types";
import {
  MenuItem,
  OptionPill,
  OwnerAvatar,
  OwnerSelect,
  PopMenu,
  StatusSelect,
  formatDate,
  isOverdue,
  memberName,
  projectProgress,
  type ProjectsContext,
} from "./shared";
import { MilestoneFormModal, NamePromptModal, ProjectFormModal, TaskFormModal } from "./forms";

export type Result = { ok: boolean; error?: string };

/** The optimistic mutation surface ProjectsTab hands to the detail view. */
export interface ProjectApi {
  moveTask(task: Task, toStatus: string): void;
  toggleTask(task: Task): void;
  deleteTask(task: Task): void;
  deleteMilestone(m: MilestoneWithTasks): void;
  deleteProject(): void;
  addTask(milestoneId: string, input: TaskInput): Promise<Result>;
  editTask(task: Task, patch: TaskInput & { milestoneId: string }): Promise<Result>;
  addMilestone(input: MilestoneInput): Promise<Result>;
  editMilestone(id: string, patch: { name?: string; description?: string | null; dueDate?: string | null }): Promise<Result>;
  updateProject(patch: Partial<ProjectInput> & { status?: string }): Promise<Result>;
  saveAsTemplate(name: string, description: string | null): Promise<Result>;
  /** Task id that most recently landed via drag — plays the "landed" pulse. */
  lastMovedTaskId: string | null;
  /** Task id that was just marked done — plays the green completion flash. */
  justCompletedTaskId: string | null;
}

type View = "checklist" | "board";

export function ProjectView({ ctx, project, api, onClose }: { ctx: ProjectsContext; project: ProjectDetail; api: ProjectApi; onClose: () => void }) {
  const [view, setView] = useState<View>("checklist");
  const [editProject, setEditProject] = useState(false);
  const [addMilestone, setAddMilestone] = useState(false);
  const [editMilestone, setEditMilestone] = useState<MilestoneWithTasks | null>(null);
  const [taskModal, setTaskModal] = useState<{ milestoneId: string; task: Task | null; statusId?: string } | null>(null);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const anyModalOpen = editProject || addMilestone || !!editMilestone || !!taskModal || saveTemplate;

  const { config, canManage } = ctx;
  const progress = projectProgress(project, config);
  const doneStatusId = config.taskStatuses.find((s) => s.terminal === "done")?.id ?? null;
  const milestoneOptions = project.milestones.map((m) => ({ id: m.id, name: m.name }));
  const complete = progress.total > 0 && progress.done === progress.total;
  const projectDone = isProjectComplete(config, project.status);
  const terminalStatusId = config.projectStatuses.find((s) => s.terminal === "complete")?.id ?? null;

  // Escape closes the lightbox (but let an open child modal handle it first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !anyModalOpen) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anyModalOpen, onClose]);

  function confirmRemoveProject() {
    if (confirm(`Delete project "${project.name}"? This removes all its milestones and tasks and can't be undone.`)) api.deleteProject();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center p-0 sm:items-center sm:p-5">
      <div className="pm-fade absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="pm-overlay-in relative z-10 flex h-full w-full max-w-[1280px] flex-col overflow-hidden border-border bg-bg shadow-xl sm:h-[90vh] sm:rounded-2xl sm:border">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          {projectDone && <CheckCircle2 size={20} className="shrink-0 text-[#2DB47A]" />}
          {project.type && <OptionPill options={config.projectTypes} id={project.type} />}
          <h1 className={cn("min-w-0 flex-1 truncate font-display text-[19px] font-semibold", projectDone ? "text-fg-muted" : "text-fg")}>{project.name}</h1>
          {canManage && (
            <>
              {projectDone
                ? terminalStatusId && <Button size="sm" variant="secondary" iconLeft={RotateCcw} onClick={() => void api.updateProject({ status: defaultProjectStatusId(config) })}>Reopen</Button>
                : terminalStatusId && <Button size="sm" iconLeft={CheckCircle2} onClick={() => void api.updateProject({ status: terminalStatusId })}>Mark complete</Button>}
              <button onClick={() => setEditProject(true)} title="Edit project" className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
                <Pencil size={16} />
              </button>
              <PopMenu
                align="right"
                trigger={() => <span className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"><MoreHorizontal size={16} /></span>}
              >
                {(close) => (
                  <>
                    <MenuItem onClick={() => { close(); setSaveTemplate(true); }}>Save as template</MenuItem>
                    <MenuItem danger onClick={() => { close(); confirmRemoveProject(); }}>Delete project</MenuItem>
                  </>
                )}
              </PopMenu>
            </>
          )}
          <button onClick={onClose} title="Close" className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>

        {/* Meta strip */}
        <div className="border-b border-border bg-bg-subtle/50 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <Meta label="Status"><StatusSelect options={config.projectStatuses} value={project.status} onChange={(s) => void api.updateProject({ status: s })} disabled={!canManage} /></Meta>
            <Meta label="Owner (CSM)"><OwnerSelect members={ctx.csms} value={project.ownerEmail} onChange={(e) => void api.updateProject({ ownerEmail: e })} disabled={!canManage} /></Meta>
            <Meta label="Implementer"><OwnerSelect members={ctx.implementers} value={project.implementerEmail} onChange={(e) => void api.updateProject({ implementerEmail: e })} disabled={!canManage} /></Meta>
            <Meta label="Contact"><Person name={ctx.contacts.find((c) => c.id === project.contactId)?.name ?? null} /></Meta>
            <Meta label="Timeline">
              <span className="whitespace-nowrap font-body text-[13px] text-fg">
                {formatDate(project.startDate)}
                <span className="mx-1.5 text-fg-subtle">→</span>
                <span className={cn(isOverdue(project.deliveryDate) && !complete && "font-semibold text-[#B23A57]")}>{formatDate(project.deliveryDate)}</span>
              </span>
            </Meta>
            <Meta label="Progress">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bg-muted">
                  <div className={cn("h-full rounded-full transition-all duration-500", complete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${progress.pct}%` }} />
                </div>
                <span className="tabular-nums font-body text-[12px] font-semibold text-fg-muted">{progress.pct}%<span className="ml-1 font-normal text-fg-subtle">· {progress.done}/{progress.total}</span></span>
              </div>
            </Meta>
          </div>
          {project.description && <p className="mt-4 border-t border-border-subtle pt-3 font-body text-[13px] leading-relaxed text-fg-muted">{project.description}</p>}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {([["checklist", "Checklist", ListChecks], ["board", "Board", LayoutGrid]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setView(key)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors", view === key ? "bg-accent-soft text-sirius" : "text-fg-muted hover:text-fg")}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          {canManage && <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)}>Milestone</Button>}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-6 sm:px-6">
          {project.milestones.length === 0 ? (
            <div className="pm-in mx-auto mt-8 flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <ListChecks size={24} className="mb-2 text-fg-subtle" />
              <p className="font-body text-[14px] font-semibold text-fg">No milestones yet</p>
              <p className="mt-1 font-body text-[13px] text-fg-muted">Break this project into milestones, then add tasks under each.</p>
              {canManage && <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)} className="mt-4">Add milestone</Button>}
            </div>
          ) : view === "checklist" ? (
            <div className="mx-auto flex max-w-4xl flex-col gap-4 pt-2">
              {project.milestones.map((m) => (
                <MilestoneSection
                  key={m.id}
                  ctx={ctx}
                  milestone={m}
                  doneStatusId={doneStatusId}
                  lastMovedTaskId={api.lastMovedTaskId}
                  justCompletedTaskId={api.justCompletedTaskId}
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
            <TaskBoard
              ctx={ctx}
              project={project}
              api={api}
              onEditTask={(t) => setTaskModal({ milestoneId: t.milestoneId, task: t })}
              onAddTask={(statusId) => setTaskModal({ milestoneId: milestoneOptions[0]?.id ?? "", task: null, statusId })}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {editProject && <ProjectFormModal ctx={ctx} mode="edit" initial={project} onClose={() => setEditProject(false)} onSubmit={async (values) => api.updateProject(values)} />}
      {addMilestone && <MilestoneFormModal onClose={() => setAddMilestone(false)} onSubmit={async (values) => api.addMilestone(values)} />}
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
          defaultStatusId={taskModal.statusId}
          onClose={() => setTaskModal(null)}
          onSubmit={async (values) => {
            const { milestoneId, ...rest } = values;
            return taskModal.task ? api.editTask(taskModal.task, { ...rest, milestoneId }) : api.addTask(milestoneId, rest);
          }}
        />
      )}
      {saveTemplate && <NamePromptModal title="Save as template" label="Template name" submitLabel="Save template" withDescription onClose={() => setSaveTemplate(false)} onSubmit={(name, description) => api.saveAsTemplate(name, description)} />}
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
      <OwnerAvatar name={name} size={22} />
      <span className="truncate font-body text-[13px] text-fg">{name ?? "None"}</span>
    </div>
  );
}

/* ------------------------------------------------------------ checklist view */

function MilestoneSection({
  ctx,
  milestone,
  doneStatusId,
  lastMovedTaskId,
  justCompletedTaskId,
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
  justCompletedTaskId: string | null;
  onToggle: (t: Task) => void;
  onStatus: (t: Task, s: string) => void;
  onEditTask: (t: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (t: Task) => void;
  onEditMilestone: () => void;
  onDeleteMilestone: () => void;
}) {
  const [open, setOpen] = useState(true);
  const total = milestone.tasks.length;
  const isDone = (t: Task) => doneStatusId != null && t.status === doneStatusId;
  const doneCount = milestone.tasks.filter(isDone).length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const mComplete = total > 0 && doneCount === total;
  // Completed tasks sink to the bottom (stable within each group).
  const orderedTasks = [...milestone.tasks].sort((a, b) => Number(isDone(a)) - Number(isDone(b)));

  return (
    <div className="pm-in overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-subtle/60 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="text-fg-subtle transition-colors hover:text-fg">
          <ChevronDown size={16} className={cn("transition-transform duration-200", !open && "-rotate-90")} />
        </button>
        <span className="min-w-0 flex-1 truncate font-body text-[14px] font-semibold text-fg">{milestone.name}</span>
        <div className="hidden items-center gap-2 sm:flex">
          <div className="h-1 w-20 overflow-hidden rounded-full bg-bg-muted">
            <div className={cn("h-full rounded-full transition-all duration-500", mComplete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums font-body text-[11px] font-semibold text-fg-subtle">{doneCount}/{total}</span>
        </div>
        {milestone.dueDate && (
          <span className={cn("inline-flex items-center gap-1 whitespace-nowrap font-body text-[11.5px]", isOverdue(milestone.dueDate) && !mComplete ? "text-[#B23A57]" : "text-fg-muted")}>
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
            orderedTasks.map((t) => (
              <TaskRow key={t.id} ctx={ctx} task={t} doneStatusId={doneStatusId} landed={t.id === lastMovedTaskId} justCompleted={t.id === justCompletedTaskId} onToggle={onToggle} onStatus={onStatus} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} />
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
  justCompleted,
  onToggle,
  onStatus,
  onEdit,
  onDelete,
}: {
  ctx: ProjectsContext;
  task: Task;
  doneStatusId: string | null;
  landed: boolean;
  justCompleted: boolean;
  onToggle: (t: Task) => void;
  onStatus: (t: Task, s: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = doneStatusId != null && task.status === doneStatusId;
  const ownerName = memberName(ctx.members, task.ownerEmail);
  return (
    <div className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors", isDone ? "bg-[#2DB47A]/[0.05] hover:bg-[#2DB47A]/[0.09]" : "hover:bg-bg-muted/30", landed && "pm-land", justCompleted && "pm-complete")}>
      <button
        onClick={() => onToggle(task)}
        disabled={!ctx.canManage || !doneStatusId}
        title={isDone ? "Mark not done" : "Mark done"}
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-200 active:scale-90",
          isDone ? "border-[#2DB47A] bg-[#2DB47A] text-white" : "border-border-strong hover:scale-110 hover:border-sirius",
          !ctx.canManage && "cursor-default opacity-70",
        )}
      >
        {isDone && <Check size={13} strokeWidth={3} className="pm-check" />}
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

function TaskBoard({
  ctx,
  project,
  api,
  onEditTask,
  onAddTask,
}: {
  ctx: ProjectsContext;
  project: ProjectDetail;
  api: ProjectApi;
  onEditTask: (t: Task) => void;
  onAddTask: (statusId: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const didDrag = useRef(false);
  const allTasks: Task[] = project.milestones.flatMap((m) => m.tasks);
  const milestoneName = (id: string) => project.milestones.find((m) => m.id === id)?.name ?? "";
  const knownStatus = new Set(ctx.config.taskStatuses.map((s) => s.id));
  const orphans = allTasks.filter((t) => !knownStatus.has(t.status));

  function drop(statusId: string, e: React.DragEvent) {
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
      // Native DnD emits no click after a drop, so clear the drag flag here (not
      // in onClick) — otherwise it stays true and eats the next genuine click.
      // setTimeout(0) still swallows a click in the rare browser that fires one.
      onDragEnd={() => { setDragId(null); setOverCol(null); setTimeout(() => { didDrag.current = false; }, 0); }}
      onClick={() => { if (didDrag.current) { didDrag.current = false; return; } onEditTask(t); }}
      className={cn(
        "rounded-xl border border-border bg-bg p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-sirius-200 hover:shadow-md",
        ctx.canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragId === t.id && "opacity-40",
        t.id === api.lastMovedTaskId && "pm-land",
        t.id === api.justCompletedTaskId && "pm-complete",
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
        "flex min-w-[236px] flex-1 flex-col rounded-2xl border bg-bg-muted/30 transition-colors duration-150",
        overCol === statusId ? "border-sirius bg-accent-soft/40 ring-2 ring-sirius/30" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">{label}<span className="tabular-nums ml-auto font-body text-[11px] font-semibold text-fg-subtle">{tasks.length}</span></div>
      <div className="flex min-h-[80px] flex-col gap-2 px-2 pb-1">
        {tasks.map(card)}
        {tasks.length === 0 && <div className="rounded-lg border border-dashed border-border/60 px-1 py-4 text-center font-body text-[11px] text-fg-subtle">Drop here</div>}
      </div>
      {droppable && ctx.canManage && (
        <button
          onClick={() => onAddTask(statusId)}
          className="mx-2 mb-2 flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-body text-[11.5px] font-medium text-fg-subtle transition-colors hover:bg-bg-muted hover:text-sirius"
        >
          <Plus size={13} /> Add task
        </button>
      )}
    </div>
  );

  return (
    <div className="flex gap-3 pt-1">
      {ctx.config.taskStatuses.map((s) => column(s.id, <OptionPill options={ctx.config.taskStatuses} id={s.id} dot />, allTasks.filter((t) => t.status === s.id), ctx.canManage))}
      {orphans.length > 0 &&
        column("__orphan", <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold text-fg-subtle"><span className="size-1.5 rounded-full bg-neutral-400" /> Uncategorized</span>, orphans, false)}
    </div>
  );
}
