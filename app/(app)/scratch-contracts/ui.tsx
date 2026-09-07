"use client";

/* Shared primitives for the Contracts prototype, in the issue-tracker idiom:
   status is a glyph, not a coloured pill; metadata is a right-aligned row of
   small monochrome facts; nothing is wrapped in a card. */

import { cn } from "@/lib/cn";
import type { TermState } from "./data";

/** Status glyphs. Fill state carries the meaning; colour is used sparingly
 *  and never as the only signal. */
export function StateIcon({ state, size = 14 }: { state: TermState; size?: number }) {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 1.5;
  if (state === "proposed")
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0 text-warning-fg" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.2 2" />
      </svg>
    );
  if (state === "ended")
    return (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0 text-fg-subtle" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="currentColor" />
        <path d={`M${c - r * 0.45} ${c} l${r * 0.35} ${r * 0.38} l${r * 0.6} -${r * 0.72}`} fill="none" stroke="var(--color-surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  // live — half filled, the way work-in-progress reads
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="shrink-0 text-sirius" aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d={`M${c} ${c} L${c} ${c - r} A${r} ${r} 0 0 1 ${c + r} ${c} Z`} fill="currentColor" />
    </svg>
  );
}

/** A completion glyph for obligations — empty, part, or full. */
export function ProgressIcon({ done, total }: { done: number; total: number | null }) {
  const pct = total ? Math.min(done / total, 1) : done > 0 ? 1 : 0;
  const s = 13, c = 6.5, r = 5;
  return (
    <svg width={s} height={s} viewBox="0 0 13 13" className={cn("shrink-0", pct >= 1 ? "text-success-fg" : pct > 0 ? "text-sirius" : "text-fg-subtle")} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {pct > 0 && pct < 1 && <circle cx={c} cy={c} r={r / 2} fill="none" stroke="currentColor" strokeWidth={r} strokeDasharray={`${pct * Math.PI * r} ${Math.PI * r}`} transform={`rotate(-90 ${c} ${c})`} />}
      {pct >= 1 && <circle cx={c} cy={c} r={r - 1.2} fill="currentColor" />}
    </svg>
  );
}

/** Initials chip. Linear's avatar slot, without inventing photos. */
export function Who({ name }: { name: string | null }) {
  if (!name) return <span className="size-[18px] shrink-0 rounded-full border border-dashed border-border-strong" />;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span
      title={name}
      className="grid size-[18px] shrink-0 place-items-center rounded-full bg-bg-muted font-body text-[9px] font-bold uppercase text-fg-muted"
    >
      {initials}
    </span>
  );
}

/** One property in the right-hand rail. */
export function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2 py-[5px]">
      <span className="font-body text-[12px] text-fg-subtle">{label}</span>
      <span className="min-w-0 font-body text-[12.5px] text-fg">{children}</span>
    </div>
  );
}

export function RailGroup({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-border-subtle py-2 last:border-b-0">{children}</div>;
}
