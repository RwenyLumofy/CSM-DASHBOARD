"use client";

/* Shared primitives for the Project Management UI: a modal shell, form fields,
   config-driven pills, owner avatars, and small date/progress helpers. Kept
   separate so ProjectsTab / ProjectDrawer / the forms stay readable. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X, type LucideIcon } from "lucide-react";
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

/**
 * Portal-rendered popover menu. The panel is appended to <body> at fixed
 * coordinates, so it can NEVER be clipped by a parent's overflow:hidden (the
 * bug that made the table/status dropdowns look broken). Closes on outside
 * click, Escape, or scroll/resize.
 */
export function PopMenu({
  trigger,
  children,
  align = "left",
  menuWidth,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  menuWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; minWidth: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      left: align === "left" ? r.left : undefined,
      right: align === "right" ? window.innerWidth - r.right : undefined,
      minWidth: menuWidth ?? Math.max(r.width, 168),
    });
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (btnRef.current?.contains(t) || t.closest?.("[data-pm-menu]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-pm-menu]")) return; // scrolling inside the menu is fine
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else { place(); setOpen(true); } }}
        className="inline-flex"
      >
        {trigger(open)}
      </button>
      {open && pos && createPortal(
        <div
          data-pm-menu
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right, minWidth: pos.minWidth }}
          className="pm-in z-[120] max-h-[320px] overflow-auto rounded-xl border border-border bg-bg p-1 shadow-xl"
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A single row inside a PopMenu. */
export function MenuItem({ onClick, selected, danger, children }: { onClick: () => void; selected?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-[13px] transition-colors hover:bg-bg-muted", danger ? "text-[#B23A57]" : "text-fg")}
    >
      <span className="flex-1">{children}</span>
      {selected && <Check size={13} className="text-sirius" />}
    </button>
  );
}

/** Status picker (pill trigger + portal menu). Static pill when disabled. */
export function StatusSelect({
  options,
  value,
  onChange,
  disabled = false,
  align = "left",
}: {
  options: OptionDef[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const cur = optionById(options, value) ?? unknownOption(value);
  if (disabled) return <Badge tone={cur.color} dot>{cur.label}</Badge>;
  return (
    <PopMenu
      align={align}
      trigger={(open) => (
        <span className="inline-flex items-center gap-1 rounded-pill transition-transform duration-150 hover:scale-[1.03] active:scale-95">
          <Badge tone={cur.color} dot>{cur.label}</Badge>
          <ChevronDown size={12} className={cn("text-fg-subtle transition-transform duration-150", open && "rotate-180")} />
        </span>
      )}
    >
      {(close) =>
        options.map((o) => (
          <MenuItem key={o.id} selected={o.id === value} onClick={() => { onChange(o.id); close(); }}>
            <Badge tone={o.color} dot>{o.label}</Badge>
          </MenuItem>
        ))
      }
    </PopMenu>
  );
}

/** Owner picker (avatar + name trigger + portal menu of members). */
export function OwnerSelect({
  members,
  value,
  onChange,
  disabled = false,
  align = "left",
  placeholder = "Unassigned",
}: {
  members: Member[];
  value: string | null;
  onChange: (email: string | null) => void;
  disabled?: boolean;
  align?: "left" | "right";
  placeholder?: string;
}) {
  const name = value ? memberName(members, value) : null;
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <OwnerAvatar name={name} size={22} />
        <span className="truncate font-body text-[13px] text-fg-muted">{name ?? placeholder}</span>
      </span>
    );
  }
  return (
    <PopMenu
      align={align}
      menuWidth={210}
      trigger={() => (
        <span className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors hover:bg-bg-muted">
          <OwnerAvatar name={name} size={22} />
          <span className="truncate font-body text-[13px] text-fg-muted">{name ?? placeholder}</span>
          <ChevronDown size={12} className="text-fg-subtle" />
        </span>
      )}
    >
      {(close) => (
        <>
          <MenuItem selected={!value} onClick={() => { onChange(null); close(); }}>
            <span className="text-fg-muted">Unassigned</span>
          </MenuItem>
          {members.map((m) => (
            <MenuItem key={m.email} selected={!!value && value.toLowerCase() === m.email.toLowerCase()} onClick={() => { onChange(m.email); close(); }}>
              <span className="inline-flex items-center gap-2"><OwnerAvatar name={m.name} size={18} />{m.name}</span>
            </MenuItem>
          ))}
        </>
      )}
    </PopMenu>
  );
}

/** Minimal toast — bottom-centre, auto-dismisses. Returns a show() fn + node. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const show = (text: string, tone: "error" | "ok" = "error") => setMsg({ text, tone });
  const node = msg ? (
    <div
      className={cn(
        "pm-in fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-xl px-4 py-2.5 font-body text-[13px] font-semibold text-white shadow-xl",
        msg.tone === "error" ? "bg-[#B23A57]" : "bg-cosmos",
      )}
    >
      {msg.text}
    </div>
  ) : null;
  return { show, node };
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
