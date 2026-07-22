"use client";

/* Today — Add task. Ordered around how CSMs capture work: what needs to happen →
   what it's connected to → who owns it → when → how it's classified. Only fields
   the today_tasks schema actually supports are shown (no reminder/checklist/etc).
   The creator is always the author; assigning to others is admin-gated server-side. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Search, Building2, Plus, X, Link2, ChevronDown, Calendar, Loader2, Lock, CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { TodayTask, TaskPriority, MentionEntity } from "@/lib/today/types";
import {
  searchMentions, getProjectRefs, getTasks, getAccount, getUsers, getViewer, getViewerUser,
  getAccountSignals, getAccountCommitments, getToday,
} from "@/lib/today/repo";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS, formatDate } from "@/lib/today/format";
import { createTaskAction } from "@/app/(app)/today/task-actions";
import { Drawer } from "./Drawer";
import { MentionInput } from "./mentions";
import type { AddTaskPrefill } from "./TodayContext";
import { useToday } from "./TodayContext";

/* ------------------------------------------------------------------ helpers */

const inputCls = "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2";
const selectCls = "w-full appearance-none rounded-lg border border-border bg-bg px-3 py-2 pr-8 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2";

const PRIORITY_META: Record<TaskPriority, { label: string; dot: string; hint: string }> = {
  urgent: { label: "Urgent", dot: "bg-danger-fg", hint: "Needs immediate attention or blocks a critical outcome" },
  high: { label: "High", dot: "bg-warning-fg", hint: "Important and should be completed soon" },
  normal: { label: "Normal", dot: "bg-sirius", hint: "Standard planned work" },
  low: { label: "Low", dot: "bg-fg-subtle", hint: "Useful but not time-sensitive" },
};

const initials = (name: string) => {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addDays(base: string, n: number): string { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); }
function quickDates(todayIso: string) {
  const base = new Date(todayIso);
  const dow = base.getDay(); // 0 Sun … 6 Sat
  const toFriday = (5 - dow + 7) % 7;
  const toNextMon = ((1 - dow + 7) % 7) || 7;
  return [
    { key: "today", label: "Today", value: iso(base) },
    { key: "tomorrow", label: "Tomorrow", value: addDays(todayIso, 1) },
    { key: "eow", label: "End of this week", value: addDays(todayIso, toFriday) },
    { key: "next", label: "Next week", value: addDays(todayIso, toNextMon) },
  ];
}
function dueLabel(value: string, todayIso: string): string {
  if (!value) return "No due date";
  if (value === iso(new Date(todayIso))) return "Today";
  if (value === addDays(todayIso, 1)) return "Tomorrow";
  return new Date(value).toLocaleDateString(undefined, { weekday: "short" });
}

/** Dropdown/popover shell: a trigger button + a floating panel that closes on
 *  outside-click or Esc. Keyboard-reachable. */
function Popover({ trigger, children, align = "left", width = "w-64" }: { trigger: (o: boolean) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full">{trigger(open)}</button>
      {open && (
        <div className={cn("pm-in absolute z-20 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg", width, align === "right" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, required, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return <span className="mb-1 flex items-center gap-1.5 font-body text-[12px] font-medium text-fg-muted">{children}{required && <span className="text-danger-fg">*</span>}{hint && <span className="font-normal text-fg-subtle">{hint}</span>}</span>;
}

/* ------------------------------------------------------------------ modal */

export function AddTaskModal({ prefill, onClose, onCreated }: { prefill: AddTaskPrefill; onClose: () => void; onCreated?: (title: string) => void }) {
  const { addTask, localTasks } = useToday();
  const viewer = getViewer();
  const canAssignOthers = viewer.canSeeAll;
  const today = getToday();
  const titleRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const custom = [...new Set([...localTasks, ...getTasks()].map((t) => t.category))].filter((id) => !DEFAULT_CATEGORY_IDS.includes(id));
    return [...DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })), ...custom.map((id) => ({ id, label: id }))];
  }, [localTasks]);

  const [title, setTitle] = useState(prefill.title ?? "");
  const [details, setDetails] = useState("");
  const [detailMentions, setDetailMentions] = useState<MentionEntity[]>([]);
  const [accountId, setAccountId] = useState<string | null>(prefill.accountId ?? null);
  const [showProject, setShowProject] = useState(!!prefill.projectId);
  const [projectId, setProjectId] = useState(prefill.projectId ?? "");
  const [assignee, setAssignee] = useState<string>(viewer.userId);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [creating, setCreating] = useState(!!prefill.newCategory);
  const [category, setCategory] = useState<string>(prefill.category ?? "derisking");
  const [newArea, setNewArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);

  const accountName = accountId ? getAccount(accountId)?.name : null;
  const projects = useMemo(() => getProjectRefs().filter((p) => !accountId || p.accountId === accountId), [accountId]);

  // Assignee options — person-first, current user first, account owner surfaced.
  const people = useMemo(() => {
    const all = getUsers().filter((u) => u.id !== "unassigned");
    const ownerId = accountId ? getAccount(accountId)?.csmUserId : undefined;
    const rank = (id: string) => (id === viewer.userId ? 0 : id === ownerId ? 1 : 2);
    return [...all].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  }, [accountId, viewer.userId]);
  const assigneeUser = people.find((u) => u.id === assignee) ?? getViewerUser();

  // Source backlink (health signal / renewal / commitment the task came from).
  const source = useMemo(() => {
    if (!prefill.sourceType || !prefill.sourceId || !accountId) return null;
    if (prefill.sourceType === "signal") { const s = getAccountSignals(accountId).find((x) => x.id === prefill.sourceId); return s ? { label: s.type } : null; }
    const c = getAccountCommitments(accountId).find((x) => x.id === prefill.sourceId); return c ? { label: c.title } : null;
  }, [prefill.sourceType, prefill.sourceId, accountId]);

  const effectiveCategory = creating ? newArea.trim() : category;
  const titleOk = title.trim().length > 0;
  const titleTooShort = titleOk && title.trim().split(/\s+/).length < 2;
  const canSubmit = titleOk && !!assignee && effectiveCategory.length > 0 && !busy;

  const dirty = title.trim().length > 0 || details.trim().length > 0 || accountId !== (prefill.accountId ?? null) || !!projectId || !!due || priority !== "normal";
  const requestClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  async function submit(again: boolean) {
    setError(null);
    setTitleTouched(true);
    if (!title.trim()) { setError("Enter a task title."); return; }
    if (!assignee) { setError("Choose an assignee."); return; }
    if (!effectiveCategory) { setError("Name the focus area."); return; }
    setBusy(true);
    const r = await createTaskAction({
      category: effectiveCategory, title: title.trim(),
      accountId, projectId: projectId || null, dueDate: due || null,
      priority, notes: details.trim() || null,
      assigneeEmail: assignee || null,
      sourceType: prefill.sourceType ?? null, sourceId: prefill.sourceId ?? null,
    });
    setBusy(false);
    if (!r.ok || !r.task) { setError(r.error ?? "Task could not be created. Your changes have been preserved. Try again."); return; }
    const task: TodayTask = {
      id: r.task.id, category: r.task.category, title: r.task.title, accountId: r.task.accountId, projectId: r.task.projectId,
      dueDate: r.task.dueDate, priority: r.task.priority, notes: r.task.notes, ownerEmail: r.task.ownerEmail,
      sourceType: r.task.sourceType, sourceId: r.task.sourceId, status: "open", createdAt: r.task.createdAt,
    };
    addTask(task);
    onCreated?.(task.title);
    if (again) {
      // Keep the useful context; reset only what's unique to a task.
      setTitle(""); setDetails(""); setDetailMentions([]); setDue("");
      setTitleTouched(false); setAddedFlash(true); setTimeout(() => setAddedFlash(false), 1800);
      requestAnimationFrame(() => titleRef.current?.focus());
    } else {
      onClose();
    }
  }

  return (
    <Drawer
      title="Add task"
      subtitle="Capture the work, connect it to the right context and assign an owner."
      onClose={requestClose}
      width="lg"
      resizable
      footer={
        <div className="flex items-center justify-between gap-2">
          <button onClick={requestClose} className="rounded-lg border border-border px-4 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          <div className="flex items-center gap-2">
            {addedFlash && <span className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-success-fg"><Check size={13} /> Added</span>}
            <button onClick={() => submit(true)} disabled={!canSubmit} className="rounded-lg border border-border px-3 py-2 font-body text-[13px] font-semibold text-fg-muted hover:text-fg disabled:opacity-40">Create and add another</button>
            <button onClick={() => submit(false)} disabled={!canSubmit} title="⌘/Ctrl + Enter" className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Create task
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 1 — What needs to happen */}
        <label className="block">
          <FieldLabel required>What needs to happen?</FieldLabel>
          <input ref={titleRef} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setTitleTouched(true)}
            placeholder="Follow up with MEP on the permission remediation plan"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 font-body text-[15px] font-semibold text-fg outline-none ring-sirius placeholder:font-normal placeholder:text-fg-subtle focus:ring-2" />
          {titleTouched && !titleOk && <p className="mt-1 font-body text-[12px] text-danger-fg">Enter a task title.</p>}
          {titleTooShort && <p className="mt-1 font-body text-[11.5px] text-fg-subtle">Add an action or outcome so this task is clear to the assignee.</p>}
        </label>

        {/* 2 — Details */}
        <label className="block">
          <FieldLabel>Details</FieldLabel>
          <MentionInput value={details} onChange={setDetails} mentions={detailMentions} onMentionsChange={setDetailMentions}
            placeholder="Add notes, links, context, or mention @people, @accounts, @projects and @pages" rows={2} ariaLabel="Details" />
        </label>

        {/* 3 — Linked to */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
          <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Linked to</span>
          {source && (
            <div className="flex items-center gap-1.5 rounded-md bg-bg-muted/50 px-2.5 py-1.5 font-body text-[11.5px] text-fg-muted">
              <Link2 size={12} className="shrink-0 text-fg-subtle" /> Created from: <span className="font-semibold text-fg">{accountName}</span> · {source.label}
            </div>
          )}
          {accountId ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg-muted/40 px-3 py-2">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-sirius/10 text-sirius"><Building2 size={13} /></span>
                <span className="truncate font-body text-[13px] font-semibold text-fg">{accountName ?? accountId}</span>
              </span>
              <button onClick={() => { setAccountId(null); setProjectId(""); setShowProject(false); }} className="shrink-0 font-body text-[12px] text-fg-subtle hover:text-fg">Change</button>
            </div>
          ) : <AccountPicker onPick={setAccountId} />}

          {/* progressive project link */}
          {showProject ? (
            <label className="block">
              <FieldLabel hint="optional">Project</FieldLabel>
              <div className="relative">
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectCls}>
                  <option value="">None</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              </div>
            </label>
          ) : projects.length > 0 && (
            <button onClick={() => setShowProject(true)} className="inline-flex w-fit items-center gap-1 font-body text-[12px] font-semibold text-fg-muted hover:text-sirius"><Plus size={12} /> Add project</button>
          )}
        </div>

        {/* 4 — Plan (two-column on desktop) */}
        <div className="grid grid-cols-1 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
          <div>
            <FieldLabel required>Assignee</FieldLabel>
            {canAssignOthers ? (
              <Popover width="w-72" trigger={(o) => (
                <span className={cn("flex items-center justify-between gap-2 rounded-lg border bg-bg px-2.5 py-2", o ? "border-sirius ring-2 ring-sirius" : "border-border")}>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Avatar name={assigneeUser?.name ?? "You"} />
                    <span className="truncate font-body text-[13px] font-medium text-fg">{assigneeUser?.name ?? "You"}{assignee === viewer.userId && <span className="text-fg-subtle"> · You</span>}</span>
                  </span>
                  <ChevronDown size={15} className="shrink-0 text-fg-subtle" />
                </span>
              )}>
                {(close) => <AssigneeList people={people} viewerId={viewer.userId} onPick={(id) => { setAssignee(id); close(); }} />}
              </Popover>
            ) : (
              <div title="Only admins can assign tasks to others" className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-muted/40 px-2.5 py-2">
                <span className="inline-flex min-w-0 items-center gap-2"><Avatar name={assigneeUser?.name ?? "You"} /><span className="truncate font-body text-[13px] font-medium text-fg">{assigneeUser?.name ?? "You"} · You</span></span>
                <Lock size={13} className="shrink-0 text-fg-subtle" />
              </div>
            )}
          </div>

          <div>
            <FieldLabel hint="optional">Due date</FieldLabel>
            <Popover width="w-60" align="right" trigger={(o) => (
              <span className={cn("flex items-center justify-between gap-2 rounded-lg border bg-bg px-2.5 py-2", o ? "border-sirius ring-2 ring-sirius" : "border-border")}>
                <span className="inline-flex items-center gap-2 font-body text-[13px] text-fg">
                  <Calendar size={14} className="text-fg-subtle" />
                  {due ? <>{dueLabel(due, today)} <span className="text-fg-subtle">· {formatDate(due)}</span></> : <span className="text-fg-subtle">No due date</span>}
                </span>
                <ChevronDown size={15} className="shrink-0 text-fg-subtle" />
              </span>
            )}>
              {(close) => (
                <div className="flex flex-col">
                  {quickDates(today).map((q) => (
                    <button key={q.key} onClick={() => { setDue(q.value); close(); }} className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-left font-body text-[12.5px] text-fg hover:bg-bg-muted">
                      {q.label} <span className="font-body text-[11px] text-fg-subtle">{formatDate(q.value)}</span>
                    </button>
                  ))}
                  <label className="mt-1 flex items-center gap-2 border-t border-border-subtle px-2.5 pt-2 font-body text-[12px] text-fg-muted">
                    Pick a date
                    <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none ring-sirius focus:ring-2" />
                  </label>
                  <button onClick={() => { setDue(""); close(); }} className="mt-1 rounded-md px-2.5 py-1.5 text-left font-body text-[12.5px] text-fg-subtle hover:bg-bg-muted">No due date</button>
                </div>
              )}
            </Popover>
            {priority === "urgent" && !due && <p className="mt-1 font-body text-[11px] text-fg-subtle">Urgent tasks are usually due today. <button onClick={() => setDue(iso(new Date(today)))} className="font-semibold text-sirius hover:underline">Set today?</button></p>}
          </div>

          <div>
            <FieldLabel>Priority</FieldLabel>
            <Popover width="w-72" trigger={(o) => (
              <span className={cn("flex items-center justify-between gap-2 rounded-lg border bg-bg px-2.5 py-2", o ? "border-sirius ring-2 ring-sirius" : "border-border")}>
                <span className="inline-flex items-center gap-2 font-body text-[13px] font-medium text-fg"><span className={cn("size-1.5 rounded-full", PRIORITY_META[priority].dot)} /> {PRIORITY_META[priority].label}</span>
                <ChevronDown size={15} className="shrink-0 text-fg-subtle" />
              </span>
            )}>
              {(close) => (
                <div className="flex flex-col">
                  {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
                    <button key={p} onClick={() => { setPriority(p); close(); }} className={cn("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-bg-muted", p === priority && "bg-bg-muted/60")}>
                      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", PRIORITY_META[p].dot)} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-fg">{PRIORITY_META[p].label}{p === priority && <Check size={12} className="text-sirius" />}</span>
                        <span className="font-body text-[11px] text-fg-subtle">{PRIORITY_META[p].hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          </div>

          <div>
            <FieldLabel>Focus area</FieldLabel>
            {creating ? (
              <div className="flex items-center gap-1.5">
                <input autoFocus value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="e.g. QBR prep" className={inputCls} />
                {categories.length > 0 && <button onClick={() => setCreating(false)} title="Pick an existing area" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-fg-muted hover:text-fg"><X size={14} /></button>}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(selectCls, "capitalize")}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                </div>
                <button onClick={() => { setCreating(true); setNewArea(""); }} title="New focus area" className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-fg-muted hover:border-sirius hover:text-sirius"><Plus size={14} /></button>
              </div>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg border border-[#B23A57]/30 bg-danger-bg px-3 py-2 font-body text-[12.5px] text-danger-fg">{error}</div>}
        <p className="flex items-center gap-1 font-body text-[11px] text-fg-subtle"><CornerDownLeft size={11} /> Press ⌘/Ctrl + Enter to create</p>
      </div>

      {confirmDiscard && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={() => setConfirmDiscard(false)}>
          <div className="pm-in w-full max-w-xs rounded-xl border border-border bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-[15px] font-semibold text-fg">Discard this task?</div>
            <p className="mt-1 font-body text-[12.5px] text-fg-muted">Your unsaved changes will be lost.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Keep editing</button>
              <button onClick={onClose} className="rounded-lg bg-[#B23A57] px-3 py-1.5 font-body text-[12.5px] font-semibold text-white">Discard</button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------ sub-components */

function Avatar({ name }: { name: string }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sirius text-[9px] font-bold text-white">{initials(name)}</span>;
}

function AssigneeList({ people, viewerId, onPick }: { people: ReturnType<typeof getUsers>; viewerId: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const ql = q.toLowerCase();
  const results = people.filter((u) => !q || u.name.toLowerCase().includes(ql) || (u.email ?? "").toLowerCase().includes(ql) || (u.role ?? "").toLowerCase().includes(ql));
  return (
    <div>
      <div className="relative p-1">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or role…" className="w-full rounded-md border border-border bg-bg py-1.5 pl-8 pr-2 font-body text-[12.5px] outline-none ring-sirius focus:ring-2" />
      </div>
      <ul className="max-h-56 overflow-y-auto">
        {results.length === 0 ? <li className="px-3 py-2 font-body text-[12px] text-fg-subtle">No people match.</li> :
          results.map((u) => (
            <li key={u.id}>
              <button onClick={() => onPick(u.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-muted">
                <Avatar name={u.name} />
                <span className="min-w-0">
                  <span className="block truncate font-body text-[12.5px] font-medium text-fg">{u.name}{u.id === viewerId && <span className="text-fg-subtle"> · You</span>}</span>
                  {u.role && <span className="block truncate font-body text-[11px] text-fg-subtle">{u.role}</span>}
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function AccountPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const results = searchMentions(q).accounts;
  return (
    <div>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts…" className={cn(inputCls, "pl-9")} />
      </div>
      {q && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-sm">
          {results.length === 0 ? <li className="px-3 py-2 font-body text-[12px] text-fg-subtle">No accounts found for “{q}”</li> :
            results.map((a) => (
              <li key={a.id}><button onClick={() => onPick(a.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-body text-[12.5px] text-fg hover:bg-bg-muted"><Building2 size={13} className="text-sirius" /> {a.type === "account" ? a.name : ""}</button></li>
            ))}
        </ul>
      )}
    </div>
  );
}
