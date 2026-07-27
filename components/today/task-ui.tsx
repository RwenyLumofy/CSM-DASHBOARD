"use client";

/* =========================================================================
   Shared task UI — the controls a task is edited with, wherever that happens.

   These all started life private to AddTaskModal. TaskDrawer then needed the
   same things and grew its own plainer versions (bare selects, different radii
   and borders), so creating a task and editing one looked like two different
   products. Extracted here so there is exactly one assignee picker, one
   priority picker, one field label and one input style.
   ========================================================================= */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskPriority } from "@/lib/today/types";
import { getUsers } from "@/lib/today/repo";

export const inputCls = "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2";
export const selectCls = "w-full appearance-none rounded-lg border border-border bg-bg px-3 py-2 pr-8 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2";
/** The trigger surface for a Popover-backed field — matches inputCls visually. */
export const triggerCls = "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-left";

export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string; hint: string }> = {
  urgent: { label: "Urgent", dot: "bg-danger-fg", hint: "Needs immediate attention or blocks a critical outcome" },
  high: { label: "High", dot: "bg-warning-fg", hint: "Important and should be completed soon" },
  normal: { label: "Normal", dot: "bg-sirius", hint: "Standard planned work" },
  low: { label: "Low", dot: "bg-fg-subtle", hint: "Useful but not time-sensitive" },
};

export const initials = (name: string) => {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
};

/** Dropdown/popover shell: a trigger button + a floating panel that closes on
 *  outside-click or Esc. Keyboard-reachable. */
export function Popover({ trigger, children, align = "left", width = "w-64" }: {
  trigger: (o: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    // Capture-phase + stopPropagation so Esc closes THIS popover without also
    // closing the drawer it sits inside.
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

export function FieldLabel({ children, required, hint }: { children: ReactNode; required?: boolean; hint?: string }) {
  return <span className="mb-1 flex items-center gap-1.5 font-body text-[12px] font-medium text-fg-muted">{children}{required && <span className="text-danger-fg">*</span>}{hint && <span className="font-normal text-fg-subtle">{hint}</span>}</span>;
}

export function Avatar({ name }: { name: string }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sirius text-[9px] font-bold text-white">{initials(name)}</span>;
}

export function AssigneeList({ people, viewerId, onPick }: {
  people: ReturnType<typeof getUsers>;
  viewerId: string;
  onPick: (id: string) => void;
}) {
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

/** Priority picker — trigger AND list together, so every surface renders the
 *  same dot+label control instead of re-deriving it. */
export function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (p: TaskPriority) => void }) {
  return (
    <Popover width="w-72" trigger={(o) => (
      <span className={cn(triggerCls, o && "ring-2 ring-sirius")}>
        <span className="inline-flex items-center gap-2 font-body text-[13px] font-medium text-fg">
          <span className={cn("size-1.5 rounded-full", PRIORITY_META[value].dot)} /> {PRIORITY_META[value].label}
        </span>
        <ChevronDown size={14} className="shrink-0 text-fg-subtle" />
      </span>
    )}>
      {(close) => (
        <div className="flex flex-col gap-0.5">
          {(Object.keys(PRIORITY_META) as TaskPriority[]).map((p) => (
            <button key={p} onClick={() => { onChange(p); close(); }}
              className={cn("flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-bg-muted", p === value && "bg-bg-muted/60")}>
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PRIORITY_META[p].dot)} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-fg">{PRIORITY_META[p].label}</span>
                <span className="block font-body text-[11px] text-fg-subtle">{PRIORITY_META[p].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
