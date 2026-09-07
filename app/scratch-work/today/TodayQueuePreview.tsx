"use client";

/* Prototype — which project tasks reach the Today board.

   Renders lib/work/today-rule.ts against the Work prototype's sample board.
   The "today" date is editable so every boundary case can be checked by hand:
   move it onto a due date and the row should appear as Due today; move it one
   day past and it should read Overdue; move it one day before and the row
   should drop out entirely.

   Sample data only. Nothing reads or writes the database. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { PROJECTS, STANDALONE_TASKS, fmt, name } from "../data";
import { REASON_LABEL, selectForToday, type SurfaceReason } from "@/lib/work/today-rule";

const REASON_TONE: Record<SurfaceReason, string> = {
  blocked: "border-[#B23A57]/25 bg-[#B23A57]/[0.06] text-[#B23A57]",
  overdue: "border-[#B23A57]/25 bg-[#B23A57]/[0.06] text-[#B23A57]",
  due_today: "border-[#C99A14]/30 bg-[#8A6D12]/[0.07] text-[#8A6D12]",
};

interface Flat {
  id: string;
  name: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  dueDate: string | null;
  ownerEmail: string | null;
  project: string;
  milestone: string;
}

const BOARD: Flat[] = PROJECTS.flatMap((p) =>
  p.milestones.flatMap((m) =>
    m.tasks.map((t) => ({
      id: t.id, name: t.name, status: t.status, dueDate: t.dueDate,
      ownerEmail: t.ownerEmail, project: p.name, milestone: m.name,
    })),
  ),
);

export function TodayQueuePreview() {
  const [today, setToday] = useState("2026-08-08");

  const surfaced = useMemo(() => selectForToday(BOARD, today), [today]);
  const surfacedIds = useMemo(() => new Set(surfaced.map((s) => s.task.id)), [surfaced]);
  const held = BOARD.filter((t) => !surfacedIds.has(t.id));

  return (
    <div className="min-h-screen bg-bg p-6 md:p-10">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5">

        <div>
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.09em] text-sirius">Prototype</span>
          <h1 className="mt-1 font-display text-[19px] font-bold tracking-[-0.01em] text-fg">Project tasks on the Today board</h1>
          <p className="mt-1 max-w-[74ch] font-body text-[12.5px] leading-relaxed text-fg-muted">
            A project task reaches Today when it is <b>blocked</b>, <b>overdue</b> or <b>due today</b>. Everything
            else stays in Work. Move the date below to test the boundaries.{" "}
            <Link href="/scratch-work" className="font-semibold text-sirius underline decoration-dotted underline-offset-2">Back to Work</Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
          <label className="flex items-center gap-2 font-body text-[12.5px] text-fg-muted">
            Today is
            <input type="date" value={today} onChange={(e) => setToday(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2" />
          </label>
          <span className="font-body text-[12px] text-fg-subtle">
            {surfaced.length} of {BOARD.length} project tasks reach Today
          </span>
        </div>

        <section>
          <h2 className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            On Today — from projects
          </h2>
          {surfaced.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center font-body text-[12.5px] text-fg-muted">
              No project task qualifies on this date.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {surfaced.map(({ task, reason, daysUntil }) => (
                <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                  <span className={cn("shrink-0 rounded-md border px-2 py-0.5 font-body text-[11px] font-medium", REASON_TONE[reason])}>
                    {REASON_LABEL[reason]}
                  </span>
                  <span className="min-w-[180px] flex-1 font-body text-[13px] text-fg">
                    {task.name}
                    <span className="mt-0.5 block font-body text-[11.5px] text-fg-subtle">{task.project} · {task.milestone}</span>
                  </span>
                  <span className="font-body text-[11.5px] text-fg-subtle">{name(task.ownerEmail)}</span>
                  <span className="w-[112px] text-right font-body text-[11.5px] text-fg-subtle">
                    {fmt(task.dueDate)}{daysUntil !== null && daysUntil < 0 ? ` · ${Math.abs(daysUntil)}d late` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            Already on Today — standalone, signal and Pulse tasks
          </h2>
          <ul className="flex flex-col gap-2">
            {STANDALONE_TASKS.filter((t) => t.status !== "done").map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3">
                <span className="min-w-[180px] flex-1 font-body text-[13px] text-fg">
                  {t.title}
                  {t.origin && <span className="mt-0.5 block font-body text-[11.5px] text-fg-subtle">{t.origin}</span>}
                </span>
                <span className="w-[112px] text-right font-body text-[11.5px] text-fg-subtle">{fmt(t.dueDate)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-body text-[11.5px] text-fg-subtle">Unchanged by this rule — these already appear on Today.</p>
        </section>

        <section>
          <h2 className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            Stays in Work — {held.length} project tasks
          </h2>
          <ul className="flex flex-col divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface px-4">
            {held.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={cn("min-w-[180px] flex-1 font-body text-[12.5px]", t.status === "done" ? "text-fg-subtle line-through" : "text-fg-muted")}>
                  {t.name}
                  <span className="mt-0.5 block font-body text-[11px] text-fg-subtle">{t.project}</span>
                </span>
                <span className="w-[128px] text-right font-body text-[11.5px] text-fg-subtle">
                  {t.status === "done" ? "done" : fmt(t.dueDate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
