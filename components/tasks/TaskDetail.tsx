"use client";

/* =========================================================================
   One task, in detail — the SAME component wherever a task is opened.

   WHY IT EXISTS. Signal had two task implementations over one today_tasks
   row. /today got TaskDrawer, where every field is editable. The client
   profile got AccountTasks, which lists tasks read-only: after creation you
   could complete a task or open its thread, and nothing else. Changing a due
   date on an account meant leaving the account, finding the task on Today,
   and editing it there. The two also disagreed on wording for the same
   fields — "What needs to happen?" against "Task", "Details" against
   "Notes (optional)".

   CONTEXT IS A PROP, NOT A COMPONENT. The only thing that differs between
   the two surfaces is whether the account is worth showing: opened from
   Today you cannot see it, opened from the profile it is on screen two
   inches above. So `account` is nullable and the block simply does not
   render when the caller is already the account. Nothing else forks.

   CONTENT ONLY — no drawer shell. Today wraps this in components/today/
   Drawer; the profile shows it inside the Tasks sheet it already opened.
   Rendering its own overlay would stack two dialogs on the profile.

   THREE ZONES, in priority order:
     Commitment   what was promised, whether it is late, and the one button
                  that finishes it
     Context      the account (when absent), the details, and the fields —
                  adjustments, not the point, so they sit as compact rows
                  rather than four full-width form controls
     Conversation the thread, which is what grows over a task's life
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskPriority, User } from "@/lib/today/types";
import { dueLabel, DUE_TONE } from "@/lib/today/due";
import { Avatar, AssigneeList, Popover, PRIORITY_META, triggerCls } from "@/components/today/task-ui";
import { TaskUpdates } from "@/components/clients/TaskUpdates";
import { updateTaskAction, toggleTaskAction } from "@/app/(app)/today/task-actions";

export interface TaskDetailTask {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  category: string;
  ownerEmail: string | null;
  status: string;
}

/** What the commitment is against. Null when the caller IS the account. */
export interface TaskDetailAccount {
  id: string;
  name: string;
  /** Optional commercial context — rendered only when supplied. */
  arr?: number | null;
  renewalDate?: string | null;
  healthLabel?: string | null;
}

export function TaskDetail({
  task, people, viewerId, today, categories, categoryLabel,
  account, canEdit, canPost, onOpenAccount, onChanged, preview,
}: {
  task: TaskDetailTask;
  people: User[];
  viewerId: string;
  today: string;
  categories: string[];
  categoryLabel: (id: string) => string;
  account: TaskDetailAccount | null;
  canEdit: boolean;
  canPost: boolean;
  onOpenAccount?: (id: string) => void;
  /** Told after every accepted write, so the caller can refresh its own list. */
  onChanged?: () => void;
  /* DEV PREVIEW ONLY — app/scratch-task-detail. Editing a task needs a Clerk
     session and a local environment has none, so there is otherwise no way to
     look at this before deploying. When set, writes stay in memory. No
     shipping caller passes it. */
  preview?: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [due, setDue] = useState(task.dueDate?.slice(0, 10) ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [category, setCategory] = useState(task.category);
  const [assignee, setAssignee] = useState(task.ownerEmail ?? viewerId);
  const [done, setDone] = useState(task.status === "done");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The title is the one field that must never be clipped — it is the whole
     record. A single-line input truncated a realistic title mid-word while
     the same string sat wrapped and unreadable-but-uneditable in the header
     above it. One element now, and it grows. */
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  // "Saved" is a resting state, not a flash. It replaces the permanent
  // "changes save as you go" instruction the drawer used to carry.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  function markSaved() {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2400);
  }

  async function save(patch: Parameters<typeof updateTaskAction>[1]) {
    if (preview) { markSaved(); return; }
    setSaving(true); setError(null);
    const r = await updateTaskAction(task.id, patch);
    setSaving(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the change."); return; }
    markSaved();
    onChanged?.();
  }

  /* Optimistic, reverted on failure. A cross-owner toggle returns an error
     rather than a false success, so leaving the tick in place would show a
     task as done when the row never changed. */
  async function toggleDone() {
    const next = done ? "open" : "done";
    setDone(!done); setError(null);
    if (preview) return;
    const r = await toggleTaskAction(task.id, next);
    if (!r.ok) { setDone(done); setError(r.error ?? "Couldn't change the task."); return; }
    onChanged?.();
  }

  const d = dueLabel(due || null, today);
  const assigneeUser = people.find((u) => u.id === assignee);
  const money = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger-fg/30 bg-danger-bg px-3 py-2 font-body text-[12.5px] text-danger-fg">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {/* ── 1 · Commitment ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <textarea
          ref={titleRef} rows={1} value={title} disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          aria-label="What needs to happen"
          className={cn(
            "w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1.5 font-display text-[17px] font-semibold leading-snug text-fg outline-none ring-sirius",
            canEdit && "hover:border-border focus:border-border focus:ring-2",
            done && "text-fg-subtle line-through",
          )}
        />

        <div className="flex flex-wrap items-center gap-2 px-2 font-body text-[12.5px]">
          <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium",
            priority === "urgent" ? "bg-danger-bg text-danger-fg"
              : priority === "high" ? "bg-warning-bg text-warning-fg" : "bg-bg-muted text-fg-muted")}>
            <span className={cn("size-1.5 rounded-full", PRIORITY_META[priority].dot)} aria-hidden />
            {PRIORITY_META[priority].label}
          </span>
          <span className={cn(DUE_TONE[d.tone])}>{d.text}</span>
          <span className="text-fg-subtle" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5 text-fg-muted">
            <Avatar name={assigneeUser?.name ?? "You"} />
            {assigneeUser?.name ?? "You"}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-fg-subtle">
            {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : saved ? <><Check size={12} className="text-[#2F7D52]" /> Saved</> : null}
          </span>
        </div>

        {canEdit && (
          <button onClick={toggleDone}
            className={cn("inline-flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 font-body text-[13.5px] font-semibold transition-colors",
              done ? "border-border bg-bg-muted text-fg-muted hover:text-fg"
                : "border-transparent bg-sirius text-white hover:bg-sirius/90")}>
            <Check size={15} />{done ? "Mark not done" : "Mark complete"}
          </button>
        )}
      </div>

      {/* ── 2 · Context ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        {/* Only when the caller is not already the account. */}
        {account && (
          <button onClick={() => onOpenAccount?.(account.id)} disabled={!onOpenAccount}
            className="flex flex-col gap-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-left transition-colors enabled:hover:border-sirius">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-body text-[13.5px] font-semibold text-fg">{account.name}</span>
              {onOpenAccount && <ExternalLink size={13} className="shrink-0 text-fg-subtle" />}
            </span>
            {(account.arr != null || account.renewalDate || account.healthLabel) && (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-body text-[11.5px] text-fg-muted">
                {account.arr != null && <span>{money(account.arr)} ARR</span>}
                {account.renewalDate && <span>Renews {account.renewalDate}</span>}
                {account.healthLabel && <span>{account.healthLabel}</span>}
              </span>
            )}
          </button>
        )}

        <label className="block">
          <span className="mb-1 block font-body text-[12px] font-medium text-fg-muted">Details</span>
          <textarea value={notes} disabled={!canEdit}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== (task.notes ?? "") && save({ notes })}
            rows={3} placeholder="Notes, links or context for whoever picks this up"
            className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] leading-relaxed text-fg outline-none ring-sirius placeholder:text-fg-subtle focus:ring-2" />
        </label>

        {/* Compact rows, not four stacked form controls. These are adjustments
            to a record, not a form being filled in. */}
        <dl className="flex flex-col">
          <Row label="Assignee">
            <Popover align="right" width="w-72" trigger={(o) => (
              <span className={cn(triggerCls, "border-transparent bg-transparent px-2 py-1 hover:border-border", o && "ring-2 ring-sirius")}>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Avatar name={assigneeUser?.name ?? "You"} />
                  <span className="truncate font-body text-[13px] text-fg">{assigneeUser?.name ?? "You"}</span>
                </span>
                <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
              </span>
            )}>
              {(close) => (
                <AssigneeList people={people} viewerId={viewerId} onPick={(id) => {
                  setAssignee(id); close(); void save({ assigneeEmail: id });
                }} />
              )}
            </Popover>
          </Row>

          <Row label="Priority">
            <Popover align="right" width="w-72" trigger={(o) => (
              <span className={cn(triggerCls, "border-transparent bg-transparent px-2 py-1 hover:border-border", o && "ring-2 ring-sirius")}>
                <span className="inline-flex items-center gap-2 font-body text-[13px] text-fg">
                  <span className={cn("size-1.5 rounded-full", PRIORITY_META[priority].dot)} aria-hidden />
                  {PRIORITY_META[priority].label}
                </span>
                <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
              </span>
            )}>
              {(close) => (
                <div className="flex flex-col gap-0.5">
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                    <button key={p} onClick={() => { setPriority(p); close(); void save({ priority: p }); }}
                      className={cn("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-bg-muted", p === priority && "bg-bg-muted/60")}>
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PRIORITY_META[p].dot)} aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-body text-[12.5px] font-semibold text-fg">{PRIORITY_META[p].label}</span>
                        <span className="block font-body text-[11px] text-fg-subtle">{PRIORITY_META[p].hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          </Row>

          <Row label="Due date">
            <input type="date" value={due} disabled={!canEdit}
              onChange={(e) => { setDue(e.target.value); void save({ dueDate: e.target.value || null }); }}
              className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-right font-body text-[13px] text-fg outline-none ring-sirius hover:border-border focus:ring-2" />
          </Row>

          <Row label="Focus area">
            <div className="relative">
              <select value={category} disabled={!canEdit}
                onChange={(e) => { setCategory(e.target.value); void save({ category: e.target.value }); }}
                className="w-full appearance-none rounded-md border border-transparent bg-transparent py-1 pl-2 pr-6 text-right font-body text-[13px] text-fg outline-none ring-sirius hover:border-border focus:ring-2">
                {categories.map((id) => <option key={id} value={id}>{categoryLabel(id)}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-fg-subtle" />
            </div>
          </Row>
        </dl>
      </div>

      {/* ── 3 · Conversation ─────────────────────────────────────────── */}
      <div className="border-t border-border-subtle pt-4">
        <span className="font-body text-[12px] font-medium text-fg-muted">Updates</span>
        <TaskUpdates taskId={task.id} canPost={canPost} preview={preview ? { updates: [], people: people.map((p) => ({ email: p.id, name: p.name })) } : undefined} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <dt className="shrink-0 font-body text-[12.5px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 max-w-[62%] flex-1">{children}</dd>
    </div>
  );
}
