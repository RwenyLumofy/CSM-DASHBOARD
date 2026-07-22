"use client";

/* =========================================================================
   Today — the operating board. A read-only status overview, then focus-area
   lanes. The five default focus areas are SEEDED from live signals (de-risking,
   projects, escalations, lifecycle, stakeholders); users add their own focus
   areas (task-only). Each lane shows the CSM's tasks (checkable, persisted)
   first, then auto-seeds. Focus areas are dynamic — add as many as you need.
   ========================================================================= */

import { useMemo } from "react";
import {
  Shield, KanbanSquare, Flag, Route, Users, ListChecks, Gauge, Plus, Check, ArrowUpRight, Clock, Info, TrendingUp, UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Category, LaneItem } from "@/lib/today/types";
import { getBoard, getTasks, getToday } from "@/lib/today/repo";
import { dueLabel, DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS, CATEGORY_ACCENT, CATEGORY_DESCRIPTION } from "@/lib/today/format";
import { toggleTaskAction } from "@/app/(app)/today/task-actions";
import { useToday } from "./TodayContext";
import { type StatusTone } from "./primitives";

const ICONS: Record<string, typeof Shield> = { shield: Shield, kanban: KanbanSquare, flag: Flag, route: Route, users: Users, list: ListChecks, "trending-up": TrendingUp };

const ADD_LABEL: Record<string, string> = { escalations: "Flag an escalation", projects: "Add task to a project", stakeholders: "Add mapping task", expansion: "Add expansion task" };

const EMPTY_COPY: Record<string, string> = {
  derisking: "No accounts need de-risking right now.",
  escalations: "Nothing to escalate right now.",
  projects: "No projects need attention right now.",
  expansion: "No expansion signals right now.",
  stakeholders: "No stakeholder gaps right now.",
};

const DOT: Record<StatusTone, string> = {
  danger: "bg-danger", warning: "bg-warning", info: "bg-info", success: "bg-success", eclipse: "bg-eclipse", neutral: "bg-fg-subtle",
};

export function TodayBoard() {
  const { scope, ownerFilter, localTasks, taskStatus, openAddTask } = useToday();

  const { lanes, overview, categories } = useMemo(() => {
    const merged = [...localTasks, ...getTasks()];
    const effective = merged.map((t) => ({ ...t, status: taskStatus[t.id] ?? t.status }));
    // Focus areas = the five defaults + any user-created ones present on tasks.
    const customIds = [...new Set(effective.map((t) => t.category))].filter((id) => !DEFAULT_CATEGORY_IDS.includes(id));
    const categories: Category[] = [...DEFAULT_CATEGORIES, ...customIds.map((id) => ({ id, label: id, icon: "list", isDefault: false }))];
    const board = getBoard(scope, effective, categories.map((c) => c.id));
    return { ...board, categories };
    // ownerFilter participates via the repo's active-owner state, set upstream in TodayWorkspace.
  }, [scope, ownerFilter, localTasks, taskStatus]);

  return (
    <div className="flex flex-col gap-5">
      <StatusOverviewCard overview={overview} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {lanes.map((lane) => {
          const cat = categories.find((c) => c.id === lane.key)!;
          return <Lane key={lane.key} category={cat} items={lane.items} onAdd={() => openAddTask({ category: lane.key })} />;
        })}
        <AddFocusAreaCard onAdd={() => openAddTask({ newCategory: true })} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------- status overview */

function StatusOverviewCard({ overview }: { overview: ReturnType<typeof getBoard>["overview"] }) {
  const total = Math.max(1, overview.healthy + overview.watch + overview.atRisk);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1000)}K`);
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-bg-muted text-fg-muted"><Gauge size={14} /></span>
        <h2 className="font-display text-[14px] font-semibold text-fg">Account status</h2>
        <span className="ml-auto font-body text-[12px] text-fg-subtle">{overview.accountCount} accounts</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full">
        <span className="bg-success" style={{ width: pct(overview.healthy) }} />
        <span className="bg-warning" style={{ width: pct(overview.watch) }} />
        <span className="bg-danger" style={{ width: pct(overview.atRisk) }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex gap-4 font-body text-[12.5px]">
          <span className="text-success-fg">{overview.healthy} healthy</span>
          <span className="text-warning-fg">{overview.watch} watch</span>
          <span className="text-danger-fg">{overview.atRisk} at risk</span>
        </div>
        <div className="flex gap-4 font-body text-[12px] text-fg-muted">
          <span>{money(overview.totalArr)} ARR</span>
          <span className="text-danger-fg">{money(overview.exposedArr)} exposed</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- lane */

function Lane({ category, items, onAdd }: { category: Category; items: LaneItem[]; onAdd: () => void }) {
  const Icon = ICONS[category.icon] ?? ListChecks;
  const accent: StatusTone = CATEGORY_ACCENT[category.id] ?? "neutral";
  const description = CATEGORY_DESCRIPTION[category.id];
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className={cn("grid place-items-center rounded-md", statusBg(accent))} style={{ width: 26, height: 26 }}>
          <Icon size={14} />
        </span>
        <h3 className="truncate font-body text-[13.5px] font-semibold capitalize text-fg">{category.label}</h3>
        {description && (
          <span className="group/info relative inline-flex shrink-0">
            <button type="button" aria-label={`About ${category.label}: ${description}`} className="grid place-items-center rounded text-fg-subtle transition-colors hover:text-fg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sirius">
              <Info size={13} />
            </button>
            <span role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-40 hidden w-64 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 font-body text-[11.5px] font-normal leading-relaxed text-fg-muted shadow-lg group-hover/info:block group-focus-within/info:block">
              {description}
            </span>
          </span>
        )}
        {items.length > 0 && <span className="ml-auto rounded-pill bg-bg-muted px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted">{items.length}</span>}
      </div>

      <div className="flex-1 px-2 pb-1">
        {items.length === 0 ? (
          <p className="px-2 py-5 text-center font-body text-[12px] text-fg-subtle">{EMPTY_COPY[category.id] ?? "Nothing here yet — add a task to start."}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => item.source === "task" ? <TaskRow key={item.id} item={item} /> : <SeedRow key={item.id} item={item} categoryId={category.id} />)}
          </ul>
        )}
      </div>

      <button onClick={onAdd} className="flex items-center gap-1.5 border-t border-border-subtle px-4 py-2.5 text-left font-body text-[12.5px] font-semibold text-sirius transition-colors hover:bg-accent-soft/40">
        <Plus size={14} /> {ADD_LABEL[category.id] ?? "Add task"}
      </button>
    </section>
  );
}

function AddFocusAreaCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button onClick={onAdd} className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/50 p-4 text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
      <Plus size={18} />
      <span className="font-body text-[13px] font-semibold">Add focus area</span>
      <span className="font-body text-[11.5px] text-fg-subtle">Create your own lane of work</span>
    </button>
  );
}

function statusBg(tone: StatusTone): string {
  return tone === "danger" ? "bg-danger-bg text-danger-fg" : tone === "warning" ? "bg-warning-bg text-warning-fg"
    : tone === "info" ? "bg-info-bg text-info-fg" : tone === "success" ? "bg-success-bg text-success-fg"
    : tone === "eclipse" ? "bg-eclipse-bg text-eclipse-fg" : "bg-bg-muted text-fg-muted";
}

function SeedRow({ item, categoryId }: { item: LaneItem; categoryId: string }) {
  const { openAccount, openAddTask } = useToday();
  const clickable = !!item.accountId;
  return (
    <li>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => openAccount(item.accountId!) : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAccount(item.accountId!); } } : undefined}
        className={cn("group/seed flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors focus:outline-none focus-visible:bg-accent-soft/50", clickable && "cursor-pointer hover:bg-bg-muted/50")}
      >
        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[item.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate font-body text-[12.5px] font-medium text-fg">{item.title}</div>
          {item.subtitle && <div className="truncate font-body text-[11.5px] text-fg-subtle">{item.subtitle}</div>}
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          {item.accountId && (
            <button
              onClick={(e) => { e.stopPropagation(); openAddTask({ category: categoryId, accountId: item.accountId }); }}
              aria-label="Add a task for this"
              className="hidden rounded p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-sirius group-hover/seed:inline-flex group-focus-within/seed:inline-flex"
            >
              <Plus size={13} />
            </button>
          )}
          {clickable && <ArrowUpRight size={13} className="text-fg-subtle" />}
        </div>
      </div>
    </li>
  );
}

/* Priority is shown only when it needs attention — urgent/high get a colored
   dot; normal/low stay quiet to keep the row scannable. */
function PriorityDot({ priority }: { priority?: LaneItem["priority"] }) {
  if (priority !== "urgent" && priority !== "high") return null;
  const cls = priority === "urgent" ? "bg-danger-fg" : "bg-warning-fg";
  return <span className={cn("size-1.5 shrink-0 rounded-full", cls)} title={priority === "urgent" ? "Urgent" : "High priority"} />;
}

function TaskRow({ item }: { item: LaneItem }) {
  const { setTaskStatus, openAccount } = useToday();
  const done = !!item.done;
  const due = item.dueDate ? dueLabel(item.dueDate, getToday()) : null;
  function toggle() {
    const next = done ? "open" : "done";
    setTaskStatus(item.taskId!, next);
    void toggleTaskAction(item.taskId!, next);
  }
  return (
    <li>
      <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-bg-muted/40">
        <button onClick={toggle} aria-label={done ? "Mark not done" : "Complete task"}
          className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors", done ? "border-success bg-success text-white" : "border-border-strong hover:border-sirius")}>
          {done && <Check size={11} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!done && <PriorityDot priority={item.priority} />}
            <span className={cn("truncate font-body text-[12.5px] font-medium", done ? "text-fg-subtle line-through" : "text-fg")}>{item.title}</span>
            <span className="shrink-0 rounded bg-accent-soft px-1 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-sirius">task</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 font-body text-[11px] text-fg-subtle">
            {item.accountId && <button onClick={() => openAccount(item.accountId!)} className="hover:text-sirius hover:underline">{item.subtitle}</button>}
            {due && <span className={cn("inline-flex items-center gap-0.5", due.tone === "danger" && "text-danger-fg", due.tone === "warning" && "text-warning-fg")}><Clock size={10} /> {due.text}</span>}
            {item.assigneeName && <span className="inline-flex items-center gap-0.5" title={`Assigned to ${item.assigneeName}`}><UserCircle2 size={11} /> {item.assigneeName.split(" ")[0]}</span>}
          </div>
        </div>
      </div>
    </li>
  );
}
