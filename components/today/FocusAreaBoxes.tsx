"use client";

/* Today — Focus areas as board-style cards. Each card shows the area, its count,
   and its top few accounts/tasks (the board feel), and — restored from the old
   operating board — lets you ADD A TASK straight into that focus area. Account
   rows open the account; "Add task" opens the drawer prefilled with the area.
   Quiet areas dim; a final tile adds a custom focus area. */

import { useMemo, useState } from "react";
import { Shield, Flag, KanbanSquare, TrendingUp, Users, Plus, ChevronDown, type LucideIcon } from "lucide-react";
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
  // "View all" expands the card in place (no dedicated focus-area route exists).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <section aria-label="Focus areas" className="flex flex-col">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted">Focus areas</h2>
        <span className="ml-auto font-body text-[12px] text-fg-subtle">Where the work sits</span>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Projects live in the right rail (their own pane), not this grid. */}
        {DEFAULT_CATEGORIES.filter((cat) => cat.id !== "projects").map((cat) => {
          const items = laneByKey.get(cat.id)?.items ?? [];
          const count = items.length;
          const tone = CATEGORY_ACCENT[cat.id] ?? "neutral";
          const Icon = ICONS[cat.icon] ?? Shield;
          const noun = FOCUS_COUNT_NOUN[cat.id] ?? "items";
          const empty = count === 0;
          const isOpen = expanded.has(cat.id);
          const rows = isOpen ? items : items.slice(0, 2);
          // Card-level status — the one exception that matters, most-severe first.
          const overdue = items.filter((it) => !it.done && it.dueDate && it.dueDate < today).length;
          const dueToday = items.filter((it) => !it.done && it.dueDate && it.dueDate.slice(0, 10) === today.slice(0, 10)).length;
          const status: { text: string; tone: "danger" | "warning" | "muted" } = empty
            ? { text: `No active ${noun}`, tone: "muted" }
            : overdue ? { text: `${overdue} overdue`, tone: "danger" }
            : dueToday ? { text: `${dueToday} due today`, tone: "warning" }
            : { text: `${count} open`, tone: "muted" };
          return (
            <div key={cat.id} className={cn("flex flex-col rounded-xl border border-border bg-surface shadow-sm", empty && "bg-surface/60")}>
              {/* header: icon · name + one status line · count */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TILE[tone])}><Icon size={15} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-body text-[12.5px] font-semibold capitalize leading-tight text-fg" title={cat.label}>{cat.label}</div>
                  <div className={cn("font-body text-[11px] leading-tight", status.tone === "danger" ? "font-semibold text-danger-fg" : status.tone === "warning" ? "font-semibold text-warning-fg" : "text-fg-subtle")}>{status.text}</div>
                </div>
                <span className="shrink-0 font-display text-[18px] font-semibold tabular-nums text-fg">{count}</span>
              </div>

              {!empty && (
                <ul className="border-t border-border-subtle">
                  {rows.map((item) => {
                    const s = statusOf(item, today);
                    return (
                      <li key={item.id} className="border-b border-border-subtle last:border-0">
                        <button onClick={() => item.accountId && openAccount(item.accountId)} disabled={!item.accountId} title={item.title}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors enabled:hover:bg-bg-muted/50">
                          <span className={cn("size-1.5 shrink-0 rounded-full", DOT[item.tone] ?? "bg-fg-subtle")} />
                          <span className="min-w-0 flex-1 truncate font-body text-[12px] text-fg">{item.title}</span>
                          {s && <span className={cn("shrink-0 font-body text-[10.5px]", s === "overdue" ? "font-semibold text-danger-fg" : s === "due today" ? "font-semibold text-warning-fg" : "text-fg-subtle")}>{s}</span>}
                        </button>
                      </li>
                    );
                  })}
                  {!isOpen && count > 2 && <li className="px-3 py-1 font-body text-[10.5px] text-fg-subtle">+{count - 2} more</li>}
                </ul>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle px-2.5 py-1.5">
                <button onClick={() => openAddTask({ category: cat.id })} className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:text-sirius"><Plus size={12} /> Add task</button>
                {count > 2 && (
                  <button onClick={() => toggle(cat.id)} aria-expanded={isOpen} className="inline-flex items-center gap-0.5 font-body text-[11.5px] font-semibold text-sirius hover:underline">
                    {isOpen ? "Show less" : `View all ${count}`} <ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add a custom focus area — compact tile, same footprint as the cards. */}
        <button onClick={() => openAddTask({ newCategory: true })} className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface/40 px-3 py-4 text-center transition-colors hover:border-sirius hover:bg-accent-soft/30">
          <span className="grid size-7 place-items-center rounded-md bg-accent-soft text-sirius"><Plus size={15} /></span>
          <span className="font-body text-[12px] font-semibold text-fg">Add focus area</span>
          <span className="font-body text-[10.5px] text-fg-subtle">Custom workstream</span>
        </button>
      </div>
    </section>
  );
}
