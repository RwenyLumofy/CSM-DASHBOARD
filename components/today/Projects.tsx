"use client";

/* Today — Projects rail module. Lives in the right pane (beside Focus now) and
   lists the account's delivery/implementation projects, each reflected by its
   type/status (on track / at risk / in progress / overdue). Adding a task here
   records it against the Projects area, so whatever project work is captured
   shows up in this pane. Not the priority queue — this is where ongoing
   delivery work is tracked. */

import { useMemo, useState } from "react";
import { KanbanSquare, Plus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LaneItem, LaneItemTone } from "@/lib/today/types";
import { getBoard, getTasks, getToday } from "@/lib/today/repo";
import { useToday } from "./TodayContext";

const DOT: Record<string, string> = {
  danger: "bg-danger-fg", warning: "bg-warning-fg", info: "bg-info-fg",
  success: "bg-success-fg", eclipse: "bg-eclipse-fg", neutral: "bg-fg-subtle",
};
// The project's recorded type/status, surfaced from its tone.
const TYPE_WORD: Record<LaneItemTone, string> = {
  danger: "At risk", warning: "Needs attention", info: "In progress",
  success: "On track", eclipse: "In review", neutral: "Active",
};

function statusOf(item: LaneItem, today: string): { text: string; tone: "danger" | "warning" | "neutral" | LaneItemTone } {
  if (item.done) return { text: "Done", tone: "neutral" };
  if (item.dueDate && item.dueDate < today) return { text: "Overdue", tone: "danger" };
  if (item.dueDate && item.dueDate.slice(0, 10) === today.slice(0, 10)) return { text: "Due today", tone: "warning" };
  return { text: TYPE_WORD[item.tone] ?? "Active", tone: item.tone };
}

export function Projects() {
  const { scope, openAccount, openAddTask, localTasks } = useToday();
  const today = getToday();
  const tasks = useMemo(() => [...localTasks, ...getTasks()], [localTasks]);
  const { lanes } = getBoard(scope, tasks, ["projects"]);
  const items = lanes.find((l) => l.key === "projects")?.items ?? [];
  const [open, setOpen] = useState(false);
  const count = items.length;
  const rows = open ? items : items.slice(0, 4);

  return (
    <section aria-label="Projects" className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-fg">
          <KanbanSquare size={14} className="text-fg-subtle" /> Projects
          {count > 0 && <span className="rounded-full bg-bg-muted px-1.5 py-0.5 font-body text-[10px] font-semibold tabular-nums text-fg-subtle">{count}</span>}
        </span>
        <button onClick={() => openAddTask({ category: "projects" })} className="inline-flex items-center gap-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:text-sirius"><Plus size={12} /> Add</button>
      </div>

      {count === 0 ? (
        <div className="px-3.5 py-4 font-body text-[12.5px] text-fg-subtle">
          No active projects. <button onClick={() => openAddTask({ category: "projects" })} className="font-semibold text-sirius hover:underline">Add a project task</button>
        </div>
      ) : (
        <>
          <ul>
            {rows.map((item) => {
              const s = statusOf(item, today);
              return (
                <li key={item.id} className="border-b border-border-subtle last:border-0">
                  <button onClick={() => item.accountId && openAccount(item.accountId)} disabled={!item.accountId} title={item.title}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors enabled:hover:bg-bg-muted/50">
                    <span className={cn("size-1.5 shrink-0 rounded-full", DOT[item.tone] ?? "bg-fg-subtle")} />
                    <span className="min-w-0 flex-1 truncate font-body text-[12px] font-medium text-fg">{item.title}</span>
                    <span className={cn("shrink-0 font-body text-[10.5px] font-medium", s.tone === "danger" ? "text-danger-fg" : s.tone === "warning" ? "text-warning-fg" : s.tone === "success" ? "text-success-fg" : "text-fg-subtle")}>{s.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {count > 4 && (
            <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-center gap-1 border-t border-border-subtle px-3 py-2 font-body text-[11.5px] font-semibold text-sirius hover:bg-accent-soft/40">
              {open ? "Show less" : `View all ${count}`} <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
