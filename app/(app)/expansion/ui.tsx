"use client";

/* Expansion — the small shared pieces. Chips, buttons, popovers and the two
   in-place pickers, kept out of the board and the record so both render an
   owner, a type or a confidence exactly the same way.

   Every writable control takes `canWrite`. A guest sees the value and no
   affordance — which is a courtesy, not the permission: every action re-checks
   server-side (see app/(app)/expansion/actions.ts). */

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/expansion/format";
import {
  CONFIDENCE_LABEL, OUTCOME_LABEL, TYPE_LABEL,
  type Confidence, type ExpansionPerson, type Opportunity, type Outcome,
} from "@/lib/expansion/types";
import type { DueState, MomentumState, Tone } from "@/lib/expansion/attention";

/* ── Tokens for the two read-outs ─────────────────────────────────────────── */

export const DUE_TONE: Record<DueState, string> = {
  overdue: "text-danger-fg font-medium",
  none: "text-warning-fg font-medium",
  today: "text-warning-fg font-medium",
  tomorrow: "text-warning-fg",
  soon: "text-fg-muted",
  later: "text-fg-subtle",
};

export const MOMENTUM_DOT: Record<MomentumState, string> = {
  progressed: "bg-border-strong",
  stalled: "bg-warning",
  waiting: "bg-info",
  moving: "bg-border-strong",
};

export const MOMENTUM_TEXT: Record<MomentumState, string> = {
  progressed: "text-fg-subtle",
  stalled: "text-warning-fg",
  waiting: "text-info-fg",
  moving: "text-fg-subtle",
};

export const TONE_TEXT: Record<Tone, string> = {
  danger: "text-danger-fg font-medium",
  warning: "text-warning-fg font-medium",
  info: "text-info-fg",
  muted: "text-fg-muted",
  subtle: "text-fg-subtle",
};

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "text-fg-muted",
  medium: "text-fg-subtle",
  low: "text-fg-subtle/70",
};

export const field =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent";

/**
 * The in-place edits a card and the record share.
 *
 * One object, passed down, rather than each component reaching for its own
 * action: the board and the record then cannot drift into editing the same
 * opportunity two different ways. Absent (undefined) means read-only.
 */
export interface EditHandlers {
  addStep: (text: string, dueDate: string) => void;
  updateStep: (stepId: string, text: string, dueDate: string) => void;
  completeStep: (stepId: string) => void;
  setOwner: (email: string | null) => void;
  setConfidence: (c: Confidence | null) => void;
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

export function Avatar({ name, size = 18 }: { name: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size <= 18 ? 8 : 10 };
  if (!name) {
    return (
      <span title="Unassigned" style={style}
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-fg-subtle">?</span>
    );
  }
  return (
    <span title={name} style={style}
      className="grid shrink-0 place-items-center rounded-full bg-bg-muted font-semibold text-fg-muted">
      {initialsOf(name)}
    </span>
  );
}

export function TypeChip({ o }: { o: Pick<Opportunity, "product" | "expansionType"> }) {
  return (
    <span className="inline-flex items-center rounded border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
      {o.product ? `${o.product} · ${TYPE_LABEL[o.expansionType]}` : TYPE_LABEL[o.expansionType]}
    </span>
  );
}

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const tone: Record<Outcome, string> = {
    won: "border-success/30 bg-success-bg text-success-fg",
    lost: "border-danger/30 bg-danger-bg text-danger-fg",
    dropped: "border-border bg-bg-muted text-fg-subtle",
  };
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", tone[outcome])}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function Btn({ primary, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button {...p} className={cn(
      "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
      primary ? "bg-accent text-fg-on-accent hover:bg-accent-hover" : "border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg",
      className,
    )} />
  );
}

export function Popover({ open, onClose, children, align = "right", width = "w-56" }: {
  open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right"; width?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className={cn("absolute top-full z-30 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg",
        width, align === "right" ? "right-0" : "left-0")}>
        {children}
      </div>
    </>
  );
}

export function PopRow({ label, onClick, selected }: { label: string; onClick: () => void; selected?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
      <span className="flex-1 truncate">{label}</span>
      {selected && <span className="text-accent">✓</span>}
    </button>
  );
}

export function PopLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{children}</div>;
}

/* ── Pickers ──────────────────────────────────────────────────────────────── */

/** Owner. Grouped by permission tier, using the workspace's own labels. Guests
 *  are absent because they cannot write — enforced again in the action. */
export function OwnerPicker({ value, name, people, canWrite, onChange, size = 16 }: {
  value: string | null;
  name: string | null;
  people: ExpansionPerson[];
  canWrite: boolean;
  onChange: (email: string | null) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite) return <Avatar name={name} size={size} />;

  const tiers: ExpansionPerson["tier"][] = ["operator", "admin", "super_admin"];
  return (
    <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)} title={name ?? "Assign an owner"}
        className="rounded-full transition hover:ring-2 hover:ring-accent/30">
        <Avatar name={name} size={size} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
            {tiers.map((tier) => {
              const group = people.filter((p) => p.tier === tier);
              if (!group.length) return null;
              return (
                <div key={tier}>
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                    {group[0].roleLabel}
                  </div>
                  {group.map((p) => (
                    <button key={p.email} onClick={() => { onChange(p.email); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                      <Avatar name={p.name} size={16} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {value === p.email && <span className="text-accent">✓</span>}
                    </button>
                  ))}
                </div>
              );
            })}
            <div className="mt-1 border-t border-border pt-1">
              <button onClick={() => { onChange(null); setOpen(false); }}
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-fg-subtle hover:bg-bg-subtle">
                Unassigned
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

export function ConfidencePicker({ value, canWrite, onChange }: {
  value: Confidence | null; canWrite: boolean; onChange: (c: Confidence | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite) {
    return value
      ? <span className={cn("text-[11px]", CONFIDENCE_TONE[value])}>{CONFIDENCE_LABEL[value]}</span>
      : null;
  }
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)}
        className={cn("rounded px-1 py-0.5 text-[11px] transition hover:bg-bg-subtle",
          value ? CONFIDENCE_TONE[value] : "text-fg-subtle/60")}>
        {value ? CONFIDENCE_LABEL[value] : "Confidence"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-surface p-1 shadow-lg">
            {(["high", "medium", "low"] as Confidence[]).map((c) => (
              <button key={c} onClick={() => { onChange(c); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                <span className="flex-1">{CONFIDENCE_LABEL[c]}</span>
                {value === c && <span className="text-accent">✓</span>}
              </button>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button onClick={() => { onChange(null); setOpen(false); }}
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-fg-subtle hover:bg-bg-subtle">Clear</button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/** Native date input with the value echoed back in readable form. */
export function DateField({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className={cn(field, "w-[150px] py-2", className)} />
      <span className="text-[12px] tabular-nums text-fg-subtle">{value || "not set"}</span>
    </div>
  );
}

export function Fld({ label, hint, required, error, children }: {
  label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
        {required && <span className="text-[11px] text-danger-fg">Required</span>}
      </span>
      {children}
      {error
        ? <span className="mt-1 block text-[11px] text-danger-fg">{error}</span>
        : hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[92px] shrink-0 text-[12px] text-fg-subtle">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[86px] shrink-0 text-fg-subtle">{k}</dt>
      <dd className="min-w-0 flex-1 text-fg">{v}</dd>
    </div>
  );
}
