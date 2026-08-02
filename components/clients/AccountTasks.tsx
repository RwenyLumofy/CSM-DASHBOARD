"use client";

/* Account-scoped tasks — a lightweight way to put work against this account
   without leaving the profile. Collapsed to a single button that opens a
   sidebar: an open-task list is worth a glance, not a permanent block of the
   profile, and the count on the trigger is the part you actually need at rest.

   Backed by today_tasks, NOT a new table. today_tasks already carries
   account_id, due_date, owner_email, priority and notes, and — more
   importantly — it is what the Today board reads. A task created here shows
   up there too, on whatever day it's due, without anyone needing to remember
   to look at this page again.

   Any focus area works, including "Reminder" for a plain account-specific
   nudge (renewal conversation, QBR, exec follow-up) — this card used to be
   reminder-only; it is now the general entry point for putting a task on this
   account, matching the same categories the Today board organises around.

   Overdue is stated in words as well as colour, and sorted first, because the
   entire value of a short list like this is knowing what's already missed. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListChecks, Loader2, Plus, Check, X, ChevronDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { createTaskAction, toggleTaskAction } from "@/app/(app)/today/task-actions";
import { DEFAULT_CATEGORIES } from "@/lib/today/format";
import { TaskUpdates } from "./TaskUpdates";

const TASK_CATEGORIES: { id: string; label: string }[] = [
  { id: "reminder", label: "Reminder" },
  ...DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];
const CUSTOM_CATEGORY = "__custom";

const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
type TaskPriority = (typeof PRIORITIES)[number];

/* Same four tiers, labels and hints the Today board's Add task drawer uses —
   a task created here is the same today_tasks row, so it must not offer a
   different vocabulary for the same field. */
const PRIORITY_META: Record<TaskPriority, { label: string; dot: string; hint: string }> = {
  urgent: { label: "Urgent", dot: "bg-danger-fg", hint: "Needs immediate attention or blocks a critical outcome" },
  high: { label: "High", dot: "bg-warning-fg", hint: "Important and should be completed soon" },
  normal: { label: "Normal", dot: "bg-sirius", hint: "Standard planned work" },
  low: { label: "Low", dot: "bg-fg-subtle", hint: "Useful but not time-sensitive" },
};

export interface AccountTask {
  id: string;
  title: string;
  category: string;
  dueDate: string | null;
  notes: string | null;
  status: string;
  ownerEmail: string | null;
  priority: string | null;
}

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius";

const categoryLabel = (id: string): string => TASK_CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Whole-day difference, computed from date strings only — a task due "today"
 *  must not flip to overdue because of the viewer's clock time. */
function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  const a = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

function dueLabel(due: string | null, today: string): { text: string; tone: "overdue" | "today" | "soon" | "later" | "none" } {
  const d = daysUntil(due, today);
  if (d == null) return { text: "No date", tone: "none" };
  if (d < 0) return { text: `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`, tone: "overdue" };
  if (d === 0) return { text: "Due today", tone: "today" };
  if (d === 1) return { text: "Due tomorrow", tone: "soon" };
  if (d <= 7) return { text: `Due in ${d} days`, tone: "soon" };
  return { text: new Date(`${due!.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" }), tone: "later" };
}

const TONE: Record<string, string> = {
  overdue: "text-[#B23A57] font-semibold",
  today: "text-[#8A6D12] font-semibold",
  soon: "text-fg-muted",
  later: "text-fg-subtle",
  none: "text-fg-subtle",
};

const blankForm = () => ({
  title: "", category: "reminder", customCategory: "", dueDate: "",
  notes: "", priority: "normal" as TaskPriority, assignee: "",
});

/* NO PROJECT FIELD, deliberately. today_tasks has a project_id column and
   createTaskAction accepts it, but NOTHING reads it: Project Management is
   built on a separate table (client_projects → project_milestones →
   project_tasks), and the Today board's projects rail is fed from project
   data, not from tasks. Offering the picker here would file a task against a
   project and then show it nowhere. Add it back when there is a surface that
   actually renders linked tasks. */
export function AccountTasks({
  clientId, clientName, initial, canEdit, today, teamEmails = [], canAssignOthers = false,
}: {
  clientId: string;
  clientName: string;
  initial: AccountTask[];
  canEdit: boolean;
  today: string;
  /** Assignable owners. */
  teamEmails?: { email: string; name: string | null }[];
  /** Reassigning to someone else is admin-only. createTaskAction is the real
   *  gate and now REFUSES a non-admin request outright, so showing the picker
   *  to everyone only produced an error they could have been spared. Same
   *  predicate the server uses — editsAllClients(role) — passed from the page,
   *  matching how AddTaskModal on /today already hides it. */
  canAssignOthers?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [done, setDone] = useState<Record<string, boolean>>({});
  /* Which task's thread is open. One at a time: several expanded threads turn a
     scannable list into a wall, and the sidebar is meant to be glanced at. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const open = useMemo(() => {
    const rank = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 } as const;
    return items
      .filter((t) => t.status !== "done" && !done[t.id])
      // Missed first — the only ordering that makes a short list like this useful.
      .sort((a, b) => rank[dueLabel(a.dueDate, today).tone] - rank[dueLabel(b.dueDate, today).tone]);
  }, [items, done, today]);

  /* Completed tasks, behind a disclosure. This list showed OPEN tasks only,
     which was fine when a task was just a checkbox — but a task now carries a
     conversation, and completing it took the whole thread out of reach. The
     discussion about why something was done is usually worth more after it is
     done. */
  const finished = useMemo(
    () => items.filter((t) => t.status === "done" || done[t.id]),
    [items, done],
  );

  async function add() {
    const title = form.title.trim();
    if (!title) { setError("What needs to happen?"); return; }
    const category = form.category === CUSTOM_CATEGORY ? form.customCategory.trim() : form.category;
    if (!category) { setError("Name the focus area."); return; }
    setBusy(true); setError(null);
    const r = await createTaskAction({
      category, title, accountId: clientId,
      dueDate: form.dueDate || null,
      notes: form.notes.trim() || null,
      priority: form.priority,
      assigneeEmail: form.assignee || null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the task."); return; }
    if (r.task) {
      setItems((prev) => [...prev, {
        id: r.task!.id, title: r.task!.title, category: r.task!.category, dueDate: r.task!.dueDate ?? null,
        notes: r.task!.notes ?? null, status: "open", ownerEmail: r.task!.ownerEmail ?? null,
        priority: r.task!.priority ?? null,
      }]);
    }
    setForm(blankForm());
    setAdding(false);
  }

  async function complete(id: string) {
    setDone((d) => ({ ...d, [id]: true })); // optimistic
    setError(null);
    const r = await toggleTaskAction(id, "done");
    if (!r.ok) { setDone((d) => ({ ...d, [id]: false })); setError(r.error ?? "Couldn't complete."); }
  }

  if (!sheetOpen) {
    return (
      <button type="button" onClick={() => setSheetOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 font-body text-[12.5px] font-semibold text-fg-muted shadow-sm transition-colors hover:border-sirius hover:text-sirius">
        <span className="grid size-6 place-items-center rounded-lg bg-accent-soft text-sirius"><ListChecks size={13} /></span>
        Tasks
        <span className="tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bg-muted px-1.5 font-body text-[11px] font-semibold text-fg-muted">
          {open.length}
        </span>
        {/* Overdue is the one thing worth escalating onto the closed trigger —
            the whole point of a task list is knowing what you've already missed. */}
        {open.some((t) => dueLabel(t.dueDate, today).tone === "overdue") && (
          <span className="font-body text-[11.5px] font-medium text-[#B23A57]">overdue</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={() => setSheetOpen(false)} />
      <div role="dialog" aria-modal="true" aria-labelledby="tasks-h"
        className="pm-slide-in relative flex h-full w-full flex-col overflow-y-auto bg-surface p-6 shadow-2xl sm:w-[540px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="tasks-h" className="flex items-center gap-1.5 font-display text-[17px] font-semibold text-fg">
            <ListChecks size={16} className="text-fg-subtle" aria-hidden /> Tasks
          </h3>
          <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
            Work against this account. These are the same rows the Today board reads — a task added here appears
            there under its focus area, so you don&rsquo;t have to open this page to see it.{" "}
            <Link href="/today" className="font-medium text-sirius underline decoration-dotted underline-offset-2">
              Open Today board
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit && !adding && (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <Plus size={12} /> Add task
            </button>
          )}
          <button onClick={() => setSheetOpen(false)} aria-label="Close"
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"><X size={18} /></button>
        </div>
      </div>

      {adding && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3">
          <label className="flex flex-col gap-1">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Task</span>
            <input autoFocus className={inputCls} value={form.title} placeholder={`e.g. Prepare the QBR deck for ${clientName}`}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Focus area</span>
              <div className="relative">
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className={cn(inputCls, "appearance-none pr-7")}>
                  {TASK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  <option value={CUSTOM_CATEGORY}>Custom…</option>
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">When</span>
              <input type="date" className={inputCls} value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </label>
          </div>
          {form.category === CUSTOM_CATEGORY && (
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Focus area name</span>
              <input className={inputCls} value={form.customCategory} placeholder="e.g. Onboarding"
                onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))} />
            </label>
          )}

          <fieldset className="flex flex-col gap-1">
            <legend className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Priority</legend>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => {
                const on = form.priority === p;
                return (
                  <button key={p} type="button" aria-pressed={on} title={PRIORITY_META[p].hint}
                    onClick={() => setForm((f) => ({ ...f, priority: p }))}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[12px] font-medium transition-colors",
                      on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                    <span className={cn("size-1.5 rounded-full", PRIORITY_META[p].dot)} aria-hidden />
                    {PRIORITY_META[p].label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {canAssignOthers && teamEmails.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Assignee</span>
              <div className="relative">
                <select value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                  className={cn(inputCls, "appearance-none pr-7")}>
                  <option value="">Me</option>
                  {teamEmails.map((m) => <option key={m.email} value={m.email}>{m.name ?? m.email}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              </div>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Notes (optional)</span>
            <textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Add task
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} aria-label="Cancel"
              className="rounded-lg border border-border p-1.5 text-fg-muted hover:text-fg"><X size={13} /></button>
          </div>
        </div>
      )}

      {/* OUTSIDE the add form. This sheet lists the account's tasks across all
          owners, so completing one can be rejected (toggleTaskAction is
          owner-scoped and returns NOT_YOURS for a teammate's task). While this
          lived inside {adding} the checkbox just bounced back in silence,
          which defeats the rows-affected hardening in the action. */}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[11.5px] text-[#B23A57]">
          {error}
        </p>
      )}

      {open.length === 0 && !adding ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center font-body text-[12.5px] text-fg-muted">
          No open tasks on this account.
          {canEdit && " Add one for a renewal conversation, a QBR, or an executive follow-up."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {open.map((t) => {
            const d = dueLabel(t.dueDate, today);
            return (
              <li key={t.id} className="flex flex-col rounded-lg border border-border-subtle px-3 py-2">
                <div className="flex items-start gap-2">
                  {canEdit && (
                    <button onClick={() => complete(t.id)} aria-label={`Mark "${t.title}" done`}
                      className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-border text-transparent transition-colors hover:border-sirius hover:text-sirius">
                      <Check size={10} strokeWidth={3} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="flex flex-wrap items-center gap-1.5 font-body text-[12.5px] text-fg">
                      {/* Priority as a dot, not a word — four labelled pills per row
                          would out-shout the task itself. Named for screen readers. */}
                      {t.priority && t.priority !== "normal" && PRIORITY_META[t.priority as TaskPriority] && (
                        <span title={`${PRIORITY_META[t.priority as TaskPriority].label} priority`}
                          className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_META[t.priority as TaskPriority].dot)}>
                          <span className="sr-only">{PRIORITY_META[t.priority as TaskPriority].label} priority</span>
                        </span>
                      )}
                      <span>{t.title}</span>
                    </p>
                    {t.notes && <p dir="auto" className="mt-0.5 font-body text-[11.5px] text-fg-subtle">{t.notes}</p>}
                    {t.ownerEmail && <p className="mt-0.5 font-body text-[11px] text-fg-subtle">{t.ownerEmail}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 font-body text-[10.5px] font-medium text-fg-muted">
                    {categoryLabel(t.category)}
                  </span>
                  {/* Text, not just colour — WCAG 1.4.1. */}
                  <span className={cn("shrink-0 font-body text-[11.5px]", TONE[d.tone])}>{d.text}</span>
                  <button onClick={() => setOpenTaskId((id) => id === t.id ? null : t.id)}
                    aria-expanded={openTaskId === t.id}
                    aria-label={`${openTaskId === t.id ? "Hide" : "Show"} updates on "${t.title}"`}
                    className="shrink-0 text-fg-subtle transition-colors hover:text-sirius">
                    <MessageSquare size={13} />
                  </button>
                </div>
                {openTaskId === t.id && <TaskUpdates taskId={t.id} canPost={canEdit} />}
              </li>
            );
          })}
        </ul>
      )}

      {finished.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer list-none font-body text-[11.5px] text-fg-subtle hover:text-fg">
            {finished.length} completed
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {finished.map((t) => (
              <li key={t.id} className="flex flex-col rounded-lg border border-border-subtle px-3 py-2">
                <div className="flex items-start gap-2">
                  <Check size={12} className="mt-0.5 shrink-0 text-[#2F7D52]" aria-hidden />
                  <p dir="auto" className="min-w-0 flex-1 font-body text-[12.5px] text-fg-muted line-through">{t.title}</p>
                  <button onClick={() => setOpenTaskId((id) => id === t.id ? null : t.id)}
                    aria-expanded={openTaskId === t.id}
                    aria-label={`${openTaskId === t.id ? "Hide" : "Show"} updates on "${t.title}"`}
                    className="shrink-0 text-fg-subtle transition-colors hover:text-sirius">
                    <MessageSquare size={13} />
                  </button>
                </div>
                {openTaskId === t.id && <TaskUpdates taskId={t.id} canPost={canEdit} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      </div>
    </div>
  );
}
