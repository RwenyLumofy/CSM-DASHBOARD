"use client";

/* =========================================================================
   Prototype — the Projects tab, reimagined.

   Spec: docs/specs/projects/projects-tab-one-definition-of-late.md

   It stays a table. The kanban metaphor is already used correctly one level
   down for tasks, and a board buries the delivery date, which is the payload.
   What changes is the table's JOB: from listing projects to triaging slippage.

   The important part is not visual. This page calls the REAL
   computeProjectDeadlines() from lib/projects/deadlines.ts — the same function
   the Action List and the deadline notifications use. There is no isOverdue()
   here, and no second definition of late. Everything red or amber on this page
   came out of that one function.
   ========================================================================= */

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { computeProjectDeadlines, type ProjectDeadlineItem } from "@/lib/projects/deadlines";
import { isProjectComplete, isTaskDone, optionById } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";
import { BOARD, CONFIG, NOW, fmtDate, initials, personName } from "./data";

/* ── One definition of late, read three ways ──────────────────────────────── */

interface RowState {
  project: ProjectDeadlineItem | null;
  lateTasks: ProjectDeadlineItem[];
  /** Worst thing true about this row. Drives order and colour. */
  tone: "overdue" | "due_soon" | "none";
  label: string | null;
}

function rowState(p: ProjectDetail, items: ProjectDeadlineItem[]): RowState {
  const mine = items.filter((i) => i.projectId === p.id);
  const project = mine.find((i) => i.kind === "project") ?? null;
  const lateTasks = mine.filter((i) => i.kind === "task");

  const overdueTasks = lateTasks.filter((t) => t.state === "overdue");
  if (project?.state === "overdue") {
    return { project, lateTasks, tone: "overdue", label: `${-project.daysUntil}d overdue` };
  }
  if (overdueTasks.length) {
    return { project, lateTasks, tone: "overdue", label: `${overdueTasks.length} task${overdueTasks.length > 1 ? "s" : ""} overdue` };
  }
  if (project?.state === "due_soon") {
    return { project, lateTasks, tone: "due_soon", label: project.daysUntil === 0 ? "Due today" : `Due in ${project.daysUntil}d` };
  }
  if (lateTasks.length) {
    return { project, lateTasks, tone: "due_soon", label: `${lateTasks.length} task${lateTasks.length > 1 ? "s" : ""} due soon` };
  }
  return { project: null, lateTasks: [], tone: "none", label: null };
}

const TONE_TEXT = {
  overdue: "text-danger-fg",
  due_soon: "text-warning-fg",
  none: "text-fg-subtle",
} as const;

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function StatusPill({ id }: { id: string }) {
  const opt = optionById(CONFIG.projectStatuses, id);
  const terminal = CONFIG.projectStatuses.find((s) => s.id === id)?.terminal === "complete";
  // Cancelled is terminal but is NOT a success. The current tab shows both in green.
  const cancelled = id === "cancelled";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium",
      cancelled ? "border-border bg-bg-muted text-fg-subtle"
        : terminal ? "border-success/30 bg-success-bg text-success-fg"
          : id === "at_risk" ? "border-warning/30 bg-warning-bg text-warning-fg"
            : id === "on_hold" ? "border-border bg-bg-subtle text-fg-muted"
              : "border-info/25 bg-info-bg text-info-fg")}>
      {opt?.label ?? id}
    </span>
  );
}

function Avatar({ email }: { email: string | null }) {
  if (!email) {
    return <span title="Unassigned" className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-[8px] text-fg-subtle">?</span>;
  }
  return (
    <span title={personName(email)} className="grid size-5 shrink-0 place-items-center rounded-full bg-bg-muted text-[8px] font-semibold text-fg-muted">
      {initials(email)}
    </span>
  );
}

/** Throughput only. Never mixed with schedule — that is the whole point. */
function Completion({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1 w-16 overflow-hidden rounded-full bg-bg-muted">
        <span className="block h-full rounded-full bg-border-strong" style={{ width: `${pct}%` }} />
      </span>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-fg-subtle">{done}/{total}</span>
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function ProjectsReimagined() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);

  // The real function. Same inputs the Action List and notifications use.
  const items = useMemo(() => computeProjectDeadlines(BOARD, CONFIG, NOW), []);

  const rows = useMemo(() => BOARD.map((p) => {
    const tasks = p.milestones.flatMap((m) => m.tasks);
    const done = tasks.filter((t) => isTaskDone(CONFIG, t.status)).length;
    const nextMilestone = p.milestones.find((m) => m.tasks.some((t) => !isTaskDone(CONFIG, t.status))) ?? null;
    return { p, state: rowState(p, items), done, total: tasks.length, nextMilestone, closed: isProjectComplete(CONFIG, p.status) };
  }), [items]);

  const rank = { overdue: 0, due_soon: 1, none: 2 } as const;
  const visible = rows
    .filter((r) => (showClosed ? true : !r.closed))
    .filter((r) => (lateOnly ? r.state.tone !== "none" : true))
    .sort((a, b) => rank[a.state.tone] - rank[b.state.tone]);

  const open = rows.filter((r) => !r.closed);
  const overdueCount = open.filter((r) => r.state.tone === "overdue").length;
  const dueSoonCount = open.filter((r) => r.state.tone === "due_soon").length;
  const closedCount = rows.length - open.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <p className="shrink-0 border-b border-border bg-bg-subtle px-4 py-1 text-[11px] text-fg-subtle">
        Prototype — sample projects. Lateness is computed by the real <code>computeProjectDeadlines()</code>.
      </p>

      {/* Header: what exists, and what is slipping */}
      <header className="shrink-0 border-b border-border-subtle">
        <div className="flex h-12 items-center gap-3 px-5">
          <h1 className="text-[14px] font-semibold text-fg">Projects</h1>
          <button onClick={() => setLateOnly((v) => !v)}
            className={cn("rounded-md border px-2 py-1 text-[12px] transition",
              lateOnly ? "border-danger/40 bg-danger-bg text-danger-fg"
                : "border-transparent text-fg-muted hover:bg-bg-subtle hover:text-fg")}>
            Needs attention <span className="tabular-nums">{overdueCount + dueSoonCount}</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setShowClosed((v) => !v)}
              className="rounded-md px-2 py-1 text-[12px] text-fg-muted transition hover:bg-bg-subtle hover:text-fg">
              {showClosed ? "Hide closed" : `Show closed (${closedCount})`}
            </button>
            <button className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-fg-on-accent">+ New project</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border-subtle bg-bg-subtle/60 px-5 py-2 text-[12px]">
          <span><span className="font-semibold tabular-nums text-fg">{open.length}</span> <span className="text-fg-subtle">open</span></span>
          <span><span className={cn("font-semibold tabular-nums", overdueCount ? "text-danger-fg" : "text-fg")}>{overdueCount}</span> <span className="text-fg-subtle">overdue</span></span>
          <span><span className={cn("font-semibold tabular-nums", dueSoonCount ? "text-warning-fg" : "text-fg")}>{dueSoonCount}</span> <span className="text-fg-subtle">due soon</span></span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-bg-subtle">
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
              <th className="px-5 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Tasks done</th>
              <th className="px-5 py-2 font-medium">Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {visible.map(({ p, state, done, total, nextMilestone, closed }) => (
              <tr key={p.id} onClick={() => setOpenId(p.id)} className={cn("cursor-pointer align-top transition hover:bg-bg-subtle", closed && "opacity-70")}>
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-[14px] font-semibold", closed ? "text-fg-muted" : "text-fg")}>{p.name}</span>
                    <span className="text-[11.5px] text-fg-subtle">{optionById(CONFIG.projectTypes, p.type)?.label}</span>
                  </div>
                  {!closed && nextMilestone && (
                    <div className="mt-0.5 text-[12px] text-fg-muted">
                      Next: {nextMilestone.name}
                      {nextMilestone.dueDate && <span className="text-fg-subtle"> · {fmtDate(nextMilestone.dueDate)}</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3"><StatusPill id={p.status} /></td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                    <Avatar email={p.ownerEmail} />{personName(p.ownerEmail).split(" ")[0]}
                  </span>
                </td>
                <td className="px-3 py-3"><Completion done={done} total={total} /></td>
                <td className="py-3 pl-3 pr-5">
                  <div className="whitespace-nowrap text-[12.5px] tabular-nums text-fg">{fmtDate(p.deliveryDate)}</div>
                  {state.label && (
                    <div className={cn("mt-0.5 whitespace-nowrap text-[11.5px] font-medium", TONE_TEXT[state.tone])}>
                      {state.label}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!visible.length && (
          <p className="px-5 py-10 text-center text-[13px] text-fg-subtle">Nothing is slipping.</p>
        )}
      </div>

      {openId && (
        <Journey
          p={BOARD.find((x) => x.id === openId)!}
          items={items}
          onClose={() => setOpenId(null)}
        />
      )}

      <p className="shrink-0 border-t border-border px-5 py-2 text-[11px] leading-relaxed text-fg-subtle">
        Every red and amber state on this page came from <code>computeProjectDeadlines()</code> — the same function
        behind the Action list and the deadline emails. There is no second definition of late here.
      </p>
    </div>
  );
}


/* ── The journey ──────────────────────────────────────────────────────────────
   A project is a path through milestones, and that path is the thing the
   current product hides in a drawer. The rail shows where the work actually
   is; the list underneath shows what is holding each milestone up.

   Lateness here is the same computeProjectDeadlines() output as the table —
   the rows are just filtered by id. Nothing recomputes anything. */

function Journey({ p, items, onClose }: {
  p: ProjectDetail; items: ProjectDeadlineItem[]; onClose: () => void;
}) {
  const mine = items.filter((i) => i.projectId === p.id);
  const lateTaskIds = new Map(mine.filter((i) => i.kind === "task").map((i) => [i.id, i]));
  const projectItem = mine.find((i) => i.kind === "project") ?? null;

  const milestones = p.milestones.map((m) => {
    const done = m.tasks.filter((t) => isTaskDone(CONFIG, t.status)).length;
    const late = m.tasks.filter((t) => lateTaskIds.get(t.id)?.state === "overdue").length;
    return { m, done, total: m.tasks.length, late, complete: m.tasks.length > 0 && done === m.tasks.length };
  });
  const currentIdx = milestones.findIndex((x) => !x.complete);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-cosmos/30 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">

        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-[19px] font-semibold tracking-tight text-fg">{p.name}</h2>
                <span className="text-[12px] text-fg-subtle">{optionById(CONFIG.projectTypes, p.type)?.label}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusPill id={p.status} />
                <span className="text-[12px] text-fg-muted">Delivery {fmtDate(p.deliveryDate)}</span>
                {projectItem && (
                  <span className={cn("text-[12px] font-medium", TONE_TEXT[projectItem.state === "overdue" ? "overdue" : "due_soon"])}>
                    {projectItem.state === "overdue" ? `${-projectItem.daysUntil}d overdue` : `due in ${projectItem.daysUntil}d`}
                  </span>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
              <Avatar email={p.ownerEmail} />{personName(p.ownerEmail)}
            </span>
            <button onClick={onClose} className="rounded-md px-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg" aria-label="Close">✕</button>
          </div>

          {/* The rail — where the work actually is */}
          <div className="mt-4 flex items-start">
            {milestones.map((x, i) => {
              const active = i === currentIdx;
              const reached = x.complete || i <= currentIdx;
              return (
                <div key={x.m.id} className={cn("min-w-0", i === milestones.length - 1 ? "shrink-0" : "flex-1")}>
                  <div className="flex items-center">
                    <span className={cn("size-2.5 shrink-0 rounded-full",
                      x.late ? "bg-danger" : x.complete ? "bg-success" : reached ? "bg-accent" : "border border-border-strong bg-surface",
                      active && "ring-4 ring-accent/15")} />
                    {i < milestones.length - 1 && (
                      <span className={cn("h-px flex-1", x.complete ? "bg-success/50" : "bg-border")} />
                    )}
                  </div>
                  <div className={cn("mt-2 truncate pr-3 text-[12.5px]", active ? "font-semibold text-fg" : "text-fg-muted")}>
                    {x.m.name}
                  </div>
                  <div className="pr-3 text-[11px] tabular-nums text-fg-subtle">{fmtDate(x.m.dueDate)}</div>
                  <div className={cn("pr-3 text-[11px]", x.late ? "font-medium text-danger-fg" : "text-fg-subtle")}>
                    {x.late ? `${x.done}/${x.total} · ${x.late} late` : `${x.done}/${x.total} done`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* What is holding each milestone up */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {milestones.map((x) => (
            <section key={x.m.id} className="mb-5 last:mb-0">
              <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1.5">
                <h3 className="text-[13px] font-semibold text-fg">{x.m.name}</h3>
                <span className="text-[11.5px] tabular-nums text-fg-subtle">{fmtDate(x.m.dueDate)}</span>
                <span className="ml-auto text-[11.5px] text-fg-subtle">{x.done}/{x.total} done</span>
              </div>
              <ul className="mt-1.5">
                {x.m.tasks.map((t) => {
                  const late = lateTaskIds.get(t.id);
                  const done = isTaskDone(CONFIG, t.status);
                  return (
                    <li key={t.id} className="flex items-center gap-2.5 border-b border-border-subtle py-2 last:border-0">
                      <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border text-[9px]",
                        done ? "border-success bg-success text-white" : "border-border-strong text-transparent")}>✓</span>
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", done ? "text-fg-muted line-through decoration-border-strong" : "text-fg")}>
                        {t.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-fg-subtle">{optionById(CONFIG.taskStatuses, t.status)?.label}</span>
                      {t.ownerEmail && <Avatar email={t.ownerEmail} />}
                      <span className={cn("w-[92px] shrink-0 text-right text-[11.5px] tabular-nums",
                        late?.state === "overdue" ? "font-medium text-danger-fg"
                          : late?.state === "due_soon" ? "text-warning-fg" : "text-fg-subtle")}>
                        {late?.state === "overdue" ? `${-late.daysUntil}d overdue`
                          : late?.state === "due_soon" ? (late.daysUntil === 0 ? "Due today" : `Due in ${late.daysUntil}d`)
                            : fmtDate(t.deliveryDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
