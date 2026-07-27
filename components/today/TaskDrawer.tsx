"use client";

/* =========================================================================
   Task detail drawer — what a task click opens.

   Until now a task had no detail view at all: the row could only be completed,
   and clicking it opened the linked CLIENT PROFILE, a different object
   entirely. Notes, due date, priority and assignee were writable at creation
   and then permanently invisible.

   Deliberately built from the SAME controls as AddTaskModal (components/today/
   task-ui) — the assignee popover with avatars, the priority dot list, the
   field labels and input styles — so creating a task and editing one feel like
   one feature rather than two. Read-first with inline edit: each field shows
   its value and saves on change/blur; there is no separate "edit mode".
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Loader2, AlertTriangle, ChevronDown, CalendarDays, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { Drawer } from "./Drawer";
import { useToday } from "./TodayContext";
import { getTasks, getAccount, getUsers, getViewer, getToday } from "@/lib/today/repo";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS, formatDate } from "@/lib/today/format";
import type { TaskPriority } from "@/lib/today/types";
import {
  Avatar, AssigneeList, FieldLabel, Popover, PriorityPicker,
  inputCls, selectCls, triggerCls,
} from "./task-ui";
import { updateTaskAction, toggleTaskAction, deleteTaskAction } from "@/app/(app)/today/task-actions";

export function TaskDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const router = useRouter();
  const { localTasks, taskStatus, setTaskStatus, openAccount, closeOverlays } = useToday();

  const task = [...localTasks, ...getTasks()].find((t) => t.id === taskId);
  const viewer = getViewer();
  const people = getUsers().filter((u) => u.id !== "unassigned");

  // Local echoes so edits feel immediate; the server is the source of truth on
  // the next refresh.
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [due, setDue] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [category, setCategory] = useState<string>(task?.category ?? "derisking");
  const [assignee, setAssignee] = useState(task?.ownerEmail ?? viewer.userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) {
    return (
      <Drawer title="Task" onClose={onClose} width="lg">
        <p className="px-1 py-6 font-body text-[13px] text-fg-muted">This task is no longer on your board.</p>
      </Drawer>
    );
  }

  const done = (taskStatus[task.id] ?? task.status) === "done";
  const account = task.accountId ? getAccount(task.accountId) : null;
  const assigneeUser = people.find((u) => u.id === assignee);
  const categories = [...new Set([...DEFAULT_CATEGORY_IDS, category].filter(Boolean))];
  const catLabel = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

  async function save(patch: Parameters<typeof updateTaskAction>[1]) {
    setSaving(true); setError(null);
    const r = await updateTaskAction(task!.id, patch);
    setSaving(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the change."); return; }
    router.refresh();
  }

  function toggleDone() {
    const next = done ? "open" : "done";
    setTaskStatus(task!.id, next);
    void toggleTaskAction(task!.id, next);
  }

  async function remove() {
    setSaving(true);
    const r = await deleteTaskAction(task!.id);
    setSaving(false);
    if (!r.ok) { setError(r.error ?? "Couldn't delete the task."); return; }
    closeOverlays();
    router.refresh();
  }

  return (
    <Drawer
      width="lg"
      eyebrow="Task"
      title={
        <span className="flex items-start gap-2.5">
          <button onClick={toggleDone} aria-label={done ? "Mark not done" : "Complete task"}
            className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded border transition-colors",
              done ? "border-success bg-success text-white" : "border-border-strong hover:border-sirius")}>
            {done && <Check size={11} />}
          </button>
          <span className={cn(done && "text-fg-subtle line-through")}>{title || task.title}</span>
        </span>
      }
      subtitle={done ? "Completed" : "Edit any field — changes save as you go."}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-body text-[11.5px] text-fg-subtle">
            {saving
              ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Saving…</span>
              : `Created ${formatDate(task.createdAt)}`}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="font-body text-[12px] text-fg-muted">Delete this task?</span>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
              <button onClick={remove} className="rounded-lg bg-danger-fg px-2.5 py-1 font-body text-[12px] font-semibold text-white">Delete</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:text-danger-fg">
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 font-body text-[12.5px] text-danger-fg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* 1 — Title, same weight as AddTaskModal's headline field */}
        <label className="block">
          <FieldLabel required>What needs to happen?</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title })}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 font-body text-[15px] font-semibold text-fg outline-none ring-sirius placeholder:font-normal placeholder:text-fg-subtle focus:ring-2" />
        </label>

        {/* 2 — Details */}
        <label className="block">
          <FieldLabel>Details</FieldLabel>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes ?? "") && save({ notes })}
            rows={3} placeholder="Notes, links or context for whoever picks this up"
            className={cn(inputCls, "resize-y leading-relaxed")} />
        </label>

        {/* 3 — Linked to */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Linked to</span>
          {account ? (
            <button onClick={() => openAccount(account.id)}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left transition-colors hover:border-sirius">
              <span className="truncate font-body text-[13px] font-medium text-fg">{account.name}</span>
              <ExternalLink size={13} className="shrink-0 text-fg-subtle" />
            </button>
          ) : (
            <span className="rounded-lg border border-dashed border-border px-3 py-2 font-body text-[12.5px] text-fg-subtle">No account linked</span>
          )}
        </div>

        {/* 4 — Assignee + Priority, mirroring AddTaskModal's pairing */}
        <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4">
          <label className="block">
            <FieldLabel>Assignee</FieldLabel>
            <Popover width="w-72" trigger={(o) => (
              <span className={cn(triggerCls, o && "ring-2 ring-sirius")}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Avatar name={assigneeUser?.name ?? "You"} />
                  <span className="truncate font-body text-[13px] font-medium text-fg">
                    {assigneeUser?.name ?? "You"}{assignee === viewer.userId && <span className="text-fg-subtle"> · You</span>}
                  </span>
                </span>
                <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
              </span>
            )}>
              {(close) => (
                <AssigneeList people={people} viewerId={viewer.userId} onPick={(id) => {
                  setAssignee(id); close(); void save({ assigneeEmail: id });
                }} />
              )}
            </Popover>
          </label>

          <label className="block">
            <FieldLabel>Priority</FieldLabel>
            <PriorityPicker value={priority} onChange={(p) => { setPriority(p); void save({ priority: p }); }} />
          </label>
        </div>

        {/* 5 — Due date + Focus area */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <FieldLabel hint="optional">Due date</FieldLabel>
            <div className="relative">
              <CalendarDays size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input type="date" value={due}
                onChange={(e) => { setDue(e.target.value); void save({ dueDate: e.target.value || null }); }}
                className={cn(inputCls, "pl-9")} />
            </div>
          </label>

          <label className="block">
            {/* Changing this MOVES the task between focus areas — the only way to
                do that, since areas are derived from task categories. */}
            <FieldLabel>Focus area</FieldLabel>
            <div className="relative">
              <select value={category}
                onChange={(e) => { setCategory(e.target.value); void save({ category: e.target.value }); }}
                className={cn(selectCls, "capitalize")}>
                {categories.map((id) => <option key={id} value={id}>{catLabel(id)}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            </div>
          </label>
        </div>
      </div>
    </Drawer>
  );
}
