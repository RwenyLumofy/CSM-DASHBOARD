"use client";

/* =========================================================================
   Task detail drawer — what a task click opens.

   Until now a task had no detail view at all: the row could only be completed,
   and clicking it opened the linked CLIENT PROFILE, which is a different
   object entirely. Notes, due date, priority and assignee were all writable at
   creation and then permanently invisible.

   Read-first with inline edit: every field shows its value and becomes an
   input on click, saving on blur/change. No modal-inside-a-drawer, no separate
   "edit mode" — the drawer IS the editor.
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { Drawer } from "./Drawer";
import { useToday } from "./TodayContext";
import { getTasks, getAccount, getUsers, getViewer, getToday } from "@/lib/today/repo";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS, dueLabel, formatDate } from "@/lib/today/format";
import { updateTaskAction, toggleTaskAction, deleteTaskAction } from "@/app/(app)/today/task-actions";

const PRIORITIES = [
  { value: "urgent", label: "Urgent", color: "#B23A57" },
  { value: "high", label: "High", color: "#C2610E" },
  { value: "normal", label: "Normal", color: "#6E6E6E" },
  { value: "low", label: "Low", color: "#9A9A9A" },
];

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
  const [priority, setPriority] = useState(task?.priority ?? "normal");
  const [category, setCategory] = useState<string>(task?.category ?? "derisking");
  const [assignee, setAssignee] = useState(task?.ownerEmail ?? viewer.userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!task) {
    return (
      <Drawer title="Task" onClose={onClose} width="md">
        <p className="px-1 py-6 font-body text-[13px] text-fg-muted">This task is no longer on your board.</p>
      </Drawer>
    );
  }

  const done = (taskStatus[task.id] ?? task.status) === "done";
  const account = task.accountId ? getAccount(task.accountId) : null;
  const dueInfo = due ? dueLabel(due, getToday()) : null;
  const categories = [...new Set([...DEFAULT_CATEGORY_IDS, ...(category ? [category] : [])])];

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
      width="md"
      eyebrow="Task"
      title={
        <span className="flex items-start gap-2.5">
          <button onClick={toggleDone} aria-label={done ? "Mark not done" : "Complete task"}
            className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded border transition-colors",
              done ? "border-[#1F9D63] bg-[#1F9D63] text-white" : "border-border-strong hover:border-sirius")}>
            {done && <Check size={11} />}
          </button>
          <span className={cn(done && "text-fg-subtle line-through")}>{title || task.title}</span>
        </span>
      }
      subtitle={done ? "Completed" : dueInfo ? dueInfo.text : "No due date"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-body text-[11.5px] text-fg-subtle">
            {saving ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Saving…</span> : `Created ${formatDate(task.createdAt)}`}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="font-body text-[12px] text-fg-muted">Delete this task?</span>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
              <button onClick={remove} className="rounded-lg bg-[#B23A57] px-2.5 py-1 font-body text-[12px] font-semibold text-white">Delete</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:text-[#B23A57]">
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/8 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title })}
            className={inputCls} />
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes ?? "") && save({ notes })}
            rows={3} placeholder="What's the context or the outcome you need?"
            className={cn(inputCls, "resize-y leading-relaxed")} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input type="date" value={due}
              onChange={(e) => { setDue(e.target.value); void save({ dueDate: e.target.value || null }); }}
              className={inputCls} />
          </Field>
          <Field label="Priority">
            <select value={priority}
              onChange={(e) => { setPriority(e.target.value as typeof priority); void save({ priority: e.target.value }); }}
              className={inputCls}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Focus area">
            {/* Changing this MOVES the task between focus areas — the only way
                to do that, since areas are derived from task categories. */}
            <select value={category}
              onChange={(e) => { setCategory(e.target.value); void save({ category: e.target.value }); }}
              className={inputCls}>
              {categories.map((id) => (
                <option key={id} value={id}>{DEFAULT_CATEGORIES.find((c) => c.id === id)?.label ?? id}</option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select value={assignee}
              onChange={(e) => { setAssignee(e.target.value); void save({ assigneeEmail: e.target.value }); }}
              className={inputCls}>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === viewer.userId ? " (you)" : ""}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Account">
          {account ? (
            <button onClick={() => openAccount(account.id)}
              className="inline-flex items-center gap-1.5 font-body text-[13px] font-semibold text-sirius hover:underline">
              {account.name} <ExternalLink size={12} />
            </button>
          ) : (
            <span className="font-body text-[13px] text-fg-subtle">Not linked to an account</span>
          )}
        </Field>
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

const inputCls = cn(
  "w-full rounded-[10px] border border-border-strong bg-bg px-3 py-2 font-body text-[13px] text-fg placeholder:text-fg-subtle",
  "outline-none transition-colors focus:border-sirius focus:ring-2 focus:ring-sirius/20",
);
