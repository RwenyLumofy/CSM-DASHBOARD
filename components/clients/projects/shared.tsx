"use client";

/* Shared primitives for the Project Management UI: a modal shell, form fields,
   config-driven pills, owner avatars, and small date/progress helpers. Kept
   separate so ProjectsTab / ProjectDrawer / the forms stay readable. */

import { X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { optionById, unknownOption, type OptionDef, type ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";

/** A person who can own a project/task (login email + display name). */
export interface Member {
  email: string;
  name: string;
}

/** Everything the projects UI needs that isn't the project rows themselves. */
export interface ProjectsContext {
  clientId: string;
  config: ProjectConfig;
  contacts: { id: string; name: string }[];
  csms: Member[];
  implementers: Member[];
  /** Union of csms + implementers, for task-owner pickers. */
  members: Member[];
  canManage: boolean;
}

/* ------------------------------------------------------------------- dates */

/** ISO → "yyyy-mm-dd" for an <input type="date"> value. */
export function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/** True when a due date is strictly before today (date-only comparison). */
export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export { formatDate };

/* ---------------------------------------------------------------- progress */

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

/** Task-completion progress across all of a project's milestones. */
export function projectProgress(project: ProjectDetail, config: ProjectConfig): Progress {
  const doneIds = new Set(config.taskStatuses.filter((s) => s.terminal === "done").map((s) => s.id));
  let done = 0;
  let total = 0;
  for (const m of project.milestones) {
    for (const t of m.tasks) {
      total += 1;
      if (doneIds.has(t.status)) done += 1;
    }
  }
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/* ------------------------------------------------------------------ lookups */

export function memberName(members: Member[], email: string | null | undefined): string | null {
  if (!email) return null;
  return members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name ?? email;
}

export function initialsOf(nameOrEmail: string): string {
  const parts = nameOrEmail.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || nameOrEmail.slice(0, 2).toUpperCase();
}

/* -------------------------------------------------------------------- pills */

/** Render a config option (status/type) as a pill, tolerating a removed id. */
export function OptionPill({ options, id, dot = false }: { options: OptionDef[]; id: string | null | undefined; dot?: boolean }) {
  if (!id) return null;
  const opt = optionById(options, id) ?? unknownOption(id);
  return <Badge tone={opt.color} dot={dot}>{opt.label}</Badge>;
}

/* ------------------------------------------------------------------ avatars */

export function OwnerAvatar({ name, title, size = 24 }: { name: string | null; title?: string; size?: number }) {
  if (!name) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border text-fg-subtle"
        style={{ width: size, height: size }}
        title={title ?? "Unassigned"}
      >
        <span className="text-[10px]">—</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-body font-bold text-sirius"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      title={title ? `${title}: ${name}` : name}
    >
      {initialsOf(name)}
    </span>
  );
}

/* -------------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative z-10 flex max-h-[90vh] w-full flex-col rounded-2xl border border-border bg-bg shadow-2xl", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-[15px] font-semibold text-fg">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- form fields */

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 font-body text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2 disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(INPUT_CLS, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(INPUT_CLS, "min-h-[72px] resize-y", props.className)} />;
}

export function Select({
  value,
  onChange,
  disabled,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={INPUT_CLS}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function DateInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={INPUT_CLS} />;
}

/* --------------------------------------------------------------- empty state */

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-sirius">
        <Icon size={20} />
      </div>
      <p className="font-body text-[14px] font-semibold text-fg">{title}</p>
      <p className="mt-1 max-w-sm font-body text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
