"use client";

/* Today — Focus areas as board-style cards. Each card shows the area, its count,
   and its top few accounts/tasks (the board feel), and — restored from the old
   operating board — lets you ADD A TASK straight into that focus area. Account
   rows open the account; "Add task" opens the drawer prefilled with the area.
   Quiet areas dim; a final tile adds a custom focus area. */

import { useMemo } from "react";
import { Shield, Flag, KanbanSquare, TrendingUp, Users, Plus, ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LaneItem } from "@/lib/today/types";
import { getBoard, getTasks, getToday } from "@/lib/today/repo";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS, CATEGORY_ACCENT, FOCUS_COUNT_NOUN, formatDate } from "@/lib/today/format";
import { useToday } from "./TodayContext";

const ICONS: Record<string, LucideIcon> = { shield: Shield, flag: Flag, kanban: KanbanSquare, "trending-up": TrendingUp, users: Users };
const TILE: Record<string, string> = {
  danger: "bg-danger-bg text-danger-fg", warning: "bg-warning-bg text-warning-fg",
  info: "bg-info-bg text-info-fg", success: "bg-success-bg text-success-fg", eclipse: "bg-eclipse-bg text-eclipse-fg", neutral: "bg-bg-muted text-fg-muted",
};
const DOT: Record<string, string> = {
  danger: "bg-danger-fg", warning: "bg-warning-fg", info: "bg-info-fg", success: "bg-success-fg", eclipse: "bg-eclipse-fg", neutral: "bg-fg-subtle",
};
const TONE_WORD: Record<string, string> = {
  danger: "at risk", warning: "needs attention", info: "in progress", success: "on track", eclipse: "review", neutral: "",
};

function statusOf(item: LaneItem, today: string): string {
  if (item.done) return "done";
  if (item.dueDate) {
    if (item.dueDate < today) return "overdue";
    if (item.dueDate.slice(0, 10) === today.slice(0, 10)) return "due today";
    return formatDate(item.dueDate);
  }
  return TONE_WORD[item.tone] ?? "";
}

export function FocusAreaBoxes() {
  const { scope, openAccount, openAddTask, localTasks } = useToday();
  const today = getToday();
  const tasks = useMemo(() => [...localTasks, ...getTasks()], [localTasks]);
  const { lanes } = getBoard(scope, tasks, DEFAULT_CATEGORY_IDS);
  const laneByKey = new Map(lanes.map((l) => [l.key, l]));

  return (
    <section aria-label="Focus areas" className="flex flex-col">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted">Focus areas</h2>
        <span className="ml-auto font-body text-[12px] text-fg-subtle">Where the work sits</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEFAULT_CATEGORIES.map((cat) => {
          const items = laneByKey.get(cat.id)?.items ?? [];
          const count = items.length;
          const tone = CATEGORY_ACCENT[cat.id] ?? "neutral";
          const Icon = ICONS[cat.icon] ?? Shield;
          const noun = FOCUS_COUNT_NOUN[cat.id] ?? "items";
          const empty = count === 0;
          const rows = items.slice(0, 3);
          return (
            <div key={cat.id} className={cn("flex flex-col rounded-xl border border-border bg-surface shadow-sm", empty && "opacity-70")}>
              <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-3">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", TILE[tone])}><Icon size={15} /></span>
                <span className="flex-1 truncate font-body text-[13.5px] font-semibold capitalize text-fg">{cat.label}</span>
                <span className="shrink-0 rounded-full border border-border bg-bg-muted px-2 py-0.5 font-body text-[11px] font-semibold text-fg-subtle">{count} {noun}</span>
              </div>

              {empty ? (
                <p className="px-3.5 py-4 font-body text-[12.5px] text-fg-subtle">Nothing needs attention</p>
              ) : (
                <ul>
                  {rows.map((item) => {
                    const status = statusOf(item, today);
                    return (
                      <li key={item.id} className="border-b border-border-subtle last:border-0">
                        <button onClick={() => item.accountId && openAccount(item.accountId)} disabled={!item.accountId}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors enabled:hover:bg-bg-muted/50">
                          <span className={cn("size-1.5 shrink-0 rounded-full", DOT[item.tone] ?? "bg-fg-subtle")} />
                          <span className="min-w-0 flex-1 truncate font-body text-[12.5px] font-medium text-fg">{item.title}</span>
                          {status && <span className={cn("shrink-0 font-body text-[11px]", status === "overdue" ? "font-semibold text-danger-fg" : status === "due today" ? "font-semibold text-warning-fg" : "text-fg-subtle")}>{status}</span>}
                        </button>
                      </li>
                    );
                  })}
                  {count > 3 && <li className="px-3.5 py-1.5 font-body text-[11px] text-fg-subtle">+{count - 3} more {noun}</li>}
                </ul>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
                <button onClick={() => openAddTask({ category: cat.id })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-body text-[12px] font-semibold text-fg-muted hover:text-sirius"><Plus size={13} /> Add task</button>
                {!empty && items[0]?.accountId && (
                  <button onClick={() => openAccount(items[0].accountId!)} className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius hover:underline">View <ArrowRight size={12} /></button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add a custom focus area — restored from the operating board. */}
        <button onClick={() => openAddTask({ newCategory: true })} className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/40 px-4 py-8 text-center transition-colors hover:border-sirius hover:bg-accent-soft/30">
          <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-sirius"><Plus size={16} /></span>
          <span className="font-body text-[13px] font-semibold text-fg">Add focus area</span>
          <span className="font-body text-[11.5px] text-fg-subtle">Track a custom workstream</span>
        </button>
      </div>
    </section>
  );
}
