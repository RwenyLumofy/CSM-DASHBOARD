"use client";

/* Slide-over drawer for a single project — the "pull" experience. Shows the
   project header (inline status, edit) and its milestones→tasks in two views:
   a Checklist (grouped by milestone) and a Task board (kanban by task status,
   drag to change). Inline add/edit/delete for milestones and tasks, plus
   save-as-template and delete-project. Mutations go through the server actions
   and router.refresh(); a per-row spinner covers the round-trip. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  LayoutGrid,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { defaultTaskStatusId } from "@/lib/projects/config";
import type { MilestoneWithTasks, ProjectDetail, Task } from "@/lib/projects/types";
import {
  addMilestoneAction,
  addTaskAction,
  deleteMilestoneAction,
  deleteProjectAction,
  deleteTaskAction,
  saveProjectAsTemplateAction,
  updateMilestoneAction,
  updateProjectAction,
  updateTaskAction,
} from "@/app/(app)/clients/[id]/project-actions";
import {
  OptionPill,
  OwnerAvatar,
  Select,
  formatDate,
  isOverdue,
  memberName,
  projectProgress,
  type ProjectsContext,
} from "./shared";
import { MilestoneFormModal, NamePromptModal, ProjectFormModal, TaskFormModal } from "./forms";

type View = "checklist" | "board";

export function ProjectDrawer({ ctx, project, onClose }: { ctx: ProjectsContext; project: ProjectDetail; onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<View>("checklist");
  const [pending, startTransition] = useTransition();

  // Modal state
  const [editProject, setEditProject] = useState(false);
  const [addMilestone, setAddMilestone] = useState(false);
  const [editMilestone, setEditMilestone] = useState<MilestoneWithTasks | null>(null);
  const [taskModal, setTaskModal] = useState<{ milestoneId: string; task: Task | null } | null>(null);
  const [saveTemplate, setSaveTemplate] = useState(false);

  const { config, clientId, canManage } = ctx;
  const progress = projectProgress(project, config);
  const doneStatusId = config.taskStatuses.find((s) => s.terminal === "done")?.id ?? null;
  const milestoneOptions = project.milestones.map((m) => ({ id: m.id, name: m.name }));

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function setProjectStatus(status: string) {
    await updateProjectAction(clientId, project.id, { status });
    refresh();
  }

  async function toggleTask(task: Task) {
    if (!doneStatusId) return;
    const next = task.status === doneStatusId ? defaultTaskStatusId(config) : doneStatusId;
    await updateTaskAction(clientId, task.id, { status: next });
    refresh();
  }

  async function quickTaskStatus(task: Task, status: string) {
    await updateTaskAction(clientId, task.id, { status });
    refresh();
  }

  async function removeTask(task: Task) {
    if (!confirm(`Delete task "${task.name}"?`)) return;
    await deleteTaskAction(clientId, task.id);
    refresh();
  }

  async function removeMilestone(m: MilestoneWithTasks) {
    if (!confirm(`Delete milestone "${m.name}" and its ${m.tasks.length} task(s)?`)) return;
    await deleteMilestoneAction(clientId, m.id);
    refresh();
  }

  async function removeProject() {
    if (!confirm(`Delete project "${project.name}"? This removes all its milestones and tasks and can't be undone.`)) return;
    await deleteProjectAction(clientId, project.id);
    onClose();
    refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-[720px] flex-col border-l border-border bg-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <OptionPill options={config.projectTypes} id={project.type} />
              {pending && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
            </div>
            <h2 className="mt-1.5 truncate font-display text-[18px] font-semibold text-fg">{project.name}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canManage && (
              <button onClick={() => setEditProject(true)} title="Edit project" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg">
                <Pencil size={15} />
              </button>
            )}
            <button onClick={onClose} title="Close" className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Meta + progress */}
        <div className="border-b border-border px-6 py-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Meta label="Status">
              {canManage ? (
                <Select value={project.status} onChange={(v) => void setProjectStatus(v)} options={config.projectStatuses.map((s) => ({ value: s.id, label: s.label }))} />
              ) : (
                <OptionPill options={config.projectStatuses} id={project.status} dot />
              )}
            </Meta>
            <Meta label="Owner (CSM)">
              <PersonLine name={memberName(ctx.csms, project.ownerEmail)} />
            </Meta>
            <Meta label="Implementer">
              <PersonLine name={memberName(ctx.implementers, project.implementerEmail)} />
            </Meta>
            <Meta label="Client contact">
              <PersonLine name={ctx.contacts.find((c) => c.id === project.contactId)?.name ?? null} />
            </Meta>
            <Meta label="Start">
              <span className="font-body text-[13px] text-fg">{formatDate(project.startDate)}</span>
            </Meta>
            <Meta label="Delivery">
              <span className={cn("font-body text-[13px]", isOverdue(project.deliveryDate) && !progressComplete(progress) ? "font-semibold text-[#B23A57]" : "text-fg")}>
                {formatDate(project.deliveryDate)}
              </span>
            </Meta>
            <Meta label="Progress">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-bg-muted">
                  <div className="h-full rounded-full bg-sirius" style={{ width: `${progress.pct}%` }} />
                </div>
                <span className="tabular-nums font-body text-[12px] font-semibold text-fg-muted">{progress.done}/{progress.total}</span>
              </div>
            </Meta>
          </div>
          {project.description && (
            <p className="mt-4 whitespace-pre-wrap border-t border-border-subtle pt-3 font-body text-[13px] leading-relaxed text-fg-muted">{project.description}</p>
          )}
        </div>

        {/* View toggle + add */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
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
          {canManage && (
            <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)}>
              Milestone
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {project.milestones.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <ListChecks size={22} className="mb-2 text-fg-subtle" />
              <p className="font-body text-[13.5px] font-semibold text-fg">No milestones yet</p>
              <p className="mt-1 font-body text-[12.5px] text-fg-muted">Add a milestone to start breaking this project into tasks.</p>
              {canManage && (
                <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setAddMilestone(true)} className="mt-4">
                  Add milestone
                </Button>
              )}
            </div>
          ) : view === "checklist" ? (
            <div className="flex flex-col gap-5">
              {project.milestones.map((m) => (
                <MilestoneSection
                  key={m.id}
                  ctx={ctx}
                  milestone={m}
                  doneStatusId={doneStatusId}
                  onToggle={toggleTask}
                  onQuickStatus={quickTaskStatus}
                  onEditTask={(task) => setTaskModal({ milestoneId: m.id, task })}
                  onAddTask={() => setTaskModal({ milestoneId: m.id, task: null })}
                  onDeleteTask={removeTask}
                  onEditMilestone={() => setEditMilestone(m)}
                  onDeleteMilestone={() => removeMilestone(m)}
                />
              ))}
            </div>
          ) : (
            <TaskBoard ctx={ctx} project={project} onMove={quickTaskStatus} onEditTask={(t) => setTaskModal({ milestoneId: t.milestoneId, task: t })} />
          )}
        </div>

        {/* Footer */}
        {canManage && (
          <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
            <Button size="sm" variant="ghost" onClick={() => setSaveTemplate(true)}>
              Save as template
            </Button>
            <button onClick={removeProject} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-[#B23A57]">
              <Trash2 size={14} /> Delete project
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {editProject && (
        <ProjectFormModal
          ctx={ctx}
          mode="edit"
          initial={project}
          onClose={() => setEditProject(false)}
          onSubmit={async (values) => {
            const res = await updateProjectAction(clientId, project.id, values);
            if (res.ok) refresh();
            return res;
          }}
        />
      )}
      {addMilestone && (
        <MilestoneFormModal
          onClose={() => setAddMilestone(false)}
          onSubmit={async (values) => {
            const res = await addMilestoneAction(clientId, project.id, values);
            if (res.ok) refresh();
            return res;
          }}
        />
      )}
      {editMilestone && (
        <MilestoneFormModal
          initial={{ name: editMilestone.name, description: editMilestone.description, dueDate: editMilestone.dueDate }}
          onClose={() => setEditMilestone(null)}
          onSubmit={async (values) => {
            const res = await updateMilestoneAction(clientId, editMilestone.id, values);
            if (res.ok) refresh();
            return res;
          }}
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
            const res = taskModal.task
              ? await updateTaskAction(clientId, taskModal.task.id, { ...rest, milestoneId })
              : await addTaskAction(clientId, project.id, milestoneId, rest);
            if (res.ok) refresh();
            return res;
          }}
        />
      )}
      {saveTemplate && (
        <NamePromptModal
          title="Save as template"
          label="Template name"
          submitLabel="Save template"
          withDescription
          onClose={() => setSaveTemplate(false)}
          onSubmit={async (name, description) => {
            const res = await saveProjectAsTemplateAction(clientId, project.id, { name, description });
            return res;
          }}
        />
      )}
    </div>
  );
}

function progressComplete(p: { done: number; total: number }): boolean {
  return p.total > 0 && p.done === p.total;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-body text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
      {children}
    </div>
  );
}

function PersonLine({ name }: { name: string | null }) {
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
  onToggle,
  onQuickStatus,
  onEditTask,
  onAddTask,
  onDeleteTask,
  onEditMilestone,
  onDeleteMilestone,
}: {
  ctx: ProjectsContext;
  milestone: MilestoneWithTasks;
  doneStatusId: string | null;
  onToggle: (t: Task) => void;
  onQuickStatus: (t: Task, status: string) => void;
  onEditTask: (t: Task) => void;
  onAddTask: () => void;
  onDeleteTask: (t: Task) => void;
  onEditMilestone: () => void;
  onDeleteMilestone: () => void;
}) {
  const [open, setOpen] = useState(true);
  const doneCount = doneStatusId ? milestone.tasks.filter((t) => t.status === doneStatusId).length : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 bg-bg-muted/40 px-4 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="text-fg-subtle hover:text-fg">
          <ChevronDown size={15} className={cn("transition-transform", !open && "-rotate-90")} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-body text-[13.5px] font-semibold text-fg">{milestone.name}</span>
            <span className="tabular-nums shrink-0 rounded-full bg-bg-muted px-1.5 py-px font-body text-[10.5px] font-semibold text-fg-subtle">
              {doneCount}/{milestone.tasks.length}
            </span>
          </div>
        </div>
        {milestone.dueDate && (
          <span className={cn("inline-flex items-center gap-1 font-body text-[11.5px]", isOverdue(milestone.dueDate) ? "text-[#B23A57]" : "text-fg-muted")}>
            <CalendarDays size={12} /> {formatDate(milestone.dueDate)}
          </span>
        )}
        {ctx.canManage && (
          <div className="flex items-center gap-0.5">
            <button onClick={onEditMilestone} title="Edit milestone" className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
              <Pencil size={13} />
            </button>
            <button onClick={onDeleteMilestone} title="Delete milestone" className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57]">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="divide-y divide-border-subtle">
          {milestone.tasks.length === 0 ? (
            <div className="px-4 py-3 font-body text-[12.5px] text-fg-subtle">No tasks yet.</div>
          ) : (
            milestone.tasks.map((t) => (
              <TaskRow key={t.id} ctx={ctx} task={t} doneStatusId={doneStatusId} onToggle={onToggle} onQuickStatus={onQuickStatus} onEdit={() => onEditTask(t)} onDelete={() => onDeleteTask(t)} />
            ))
          )}
          {ctx.canManage && (
            <button onClick={onAddTask} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left font-body text-[12.5px] font-medium text-sirius hover:bg-accent-soft/50">
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
  onToggle,
  onQuickStatus,
  onEdit,
  onDelete,
}: {
  ctx: ProjectsContext;
  task: Task;
  doneStatusId: string | null;
  onToggle: (t: Task) => void;
  onQuickStatus: (t: Task, status: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isDone = doneStatusId != null && task.status === doneStatusId;
  const ownerName = memberName(ctx.members, task.ownerEmail);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted/30">
      <button
        onClick={() => onToggle(task)}
        disabled={!ctx.canManage || !doneStatusId}
        title={isDone ? "Mark not done" : "Mark done"}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          isDone ? "border-sirius bg-sirius text-white" : "border-border-strong hover:border-sirius",
          !ctx.canManage && "cursor-default opacity-70",
        )}
      >
        {isDone && <Check size={11} strokeWidth={3} />}
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className={cn("truncate font-body text-[13px]", isDone ? "text-fg-subtle line-through" : "text-fg")}>{task.name}</span>
      </button>
      {task.type && <OptionPill options={ctx.config.taskTypes} id={task.type} />}
      {task.deliveryDate && (
        <span className={cn("hidden items-center gap-1 whitespace-nowrap font-body text-[11.5px] sm:inline-flex", isOverdue(task.deliveryDate) && !isDone ? "text-[#B23A57]" : "text-fg-muted")}>
          <CalendarDays size={11} /> {formatDate(task.deliveryDate)}
        </span>
      )}
      {ownerName && <OwnerAvatar name={ownerName} size={22} title="Owner" />}
      {ctx.canManage ? (
        <Select value={task.status} onChange={(v) => onQuickStatus(task, v)} options={ctx.config.taskStatuses.map((s) => ({ value: s.id, label: s.label }))} />
      ) : (
        <OptionPill options={ctx.config.taskStatuses} id={task.status} dot />
      )}
      {ctx.canManage && (
        <button onClick={onDelete} title="Delete task" className="rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-muted hover:text-[#B23A57] group-hover:opacity-100">
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
  onMove,
  onEditTask,
}: {
  ctx: ProjectsContext;
  project: ProjectDetail;
  onMove: (t: Task, status: string) => void;
  onEditTask: (t: Task) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const allTasks: Task[] = project.milestones.flatMap((m) => m.tasks);
  const milestoneName = (id: string) => project.milestones.find((m) => m.id === id)?.name ?? "";
  const knownStatus = new Set(ctx.config.taskStatuses.map((s) => s.id));
  const orphans = allTasks.filter((t) => !knownStatus.has(t.status));

  const card = (t: Task) => (
    <button
      key={t.id}
      draggable={ctx.canManage}
      onDragStart={() => setDragId(t.id)}
      onDragEnd={() => setDragId(null)}
      onClick={() => onEditTask(t)}
      className={cn(
        "rounded-lg border border-border bg-bg p-2.5 text-left shadow-sm transition-all hover:border-sirius-200",
        ctx.canManage && "cursor-grab active:cursor-grabbing",
        dragId === t.id && "opacity-40",
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
    </button>
  );

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {ctx.config.taskStatuses.map((status) => {
        const tasks = allTasks.filter((t) => t.status === status.id);
        return (
          <div
            key={status.id}
            onDragOver={(e) => {
              if (ctx.canManage) e.preventDefault();
            }}
            onDrop={() => {
              if (!ctx.canManage || !dragId) return;
              const t = allTasks.find((x) => x.id === dragId);
              if (t && t.status !== status.id) onMove(t, status.id);
              setDragId(null);
            }}
            className="flex w-[220px] shrink-0 flex-col rounded-xl border border-border bg-bg-muted/30"
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <OptionPill options={ctx.config.taskStatuses} id={status.id} dot />
              <span className="tabular-nums font-body text-[11px] font-semibold text-fg-subtle">{tasks.length}</span>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-2">
              {tasks.map(card)}
              {tasks.length === 0 && <div className="px-1 py-3 text-center font-body text-[11px] text-fg-subtle">—</div>}
            </div>
          </div>
        );
      })}
      {orphans.length > 0 && (
        // Tasks on a status id that's no longer in the config — kept visible and
        // draggable back onto a real column (dropping onto this column is a no-op).
        <div className="flex w-[220px] shrink-0 flex-col rounded-xl border border-dashed border-border bg-bg-muted/30">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="size-1.5 rounded-full bg-neutral-400" />
            <span className="font-body text-[11px] font-semibold text-fg-subtle">Uncategorized</span>
            <span className="tabular-nums font-body text-[11px] font-semibold text-fg-subtle">{orphans.length}</span>
          </div>
          <div className="flex flex-col gap-2 px-2 pb-2">{orphans.map(card)}</div>
        </div>
      )}
    </div>
  );
}
