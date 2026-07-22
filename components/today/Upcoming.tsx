"use client";

/* Today — "Your day" (artifact parity). The agenda rail for My portfolio: tasks
   due and renewal dates in scope, grouped Today / This week / Next 30 days,
   ordered by WHEN (complements Focus now, which is ordered by priority). */

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { getUpcoming, getTasks, getToday } from "@/lib/today/repo";
import type { UpcomingItem } from "@/lib/today/repo";
import { formatDate } from "@/lib/today/format";
import { useToday } from "./TodayContext";

const DOT: Record<string, string> = { danger: "bg-danger-fg", warning: "bg-warning-fg", neutral: "bg-fg-subtle" };

function whenLabel(it: UpcomingItem, today: string): { text: string; tone?: "danger" | "warning" } {
  if (it.date < today) return { text: "overdue", tone: "danger" };
  if (it.date.slice(0, 10) === today.slice(0, 10)) return { text: "today", tone: "warning" };
  return { text: formatDate(it.date) };
}

export function Upcoming() {
  const { scope, openAccount, localTasks } = useToday();
  const today = getToday();
  const tasks = useMemo(() => [...localTasks, ...getTasks()], [localTasks]);
  const up = getUpcoming(scope, tasks);
  const groups: [string, UpcomingItem[]][] = [["Today", up.today], ["This week", up.week], ["Next 30 days", up.month]];
  const empty = up.today.length + up.week.length + up.month.length === 0;

  return (
    <section aria-label="Your day" className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border-subtle px-3.5 py-2.5">
        <span className="font-body text-[12.5px] font-semibold text-fg">Your day</span>
        <span className="font-body text-[11px] text-fg-subtle">Next 30 days</span>
      </div>
      {empty ? (
        <p className="px-3.5 py-4 font-body text-[12.5px] text-fg-subtle">Nothing scheduled.</p>
      ) : (
        <div className="pb-2">
          {groups.filter(([, items]) => items.length > 0).map(([label, items]) => (
            <div key={label}>
              <div className="px-3.5 pb-1 pt-2.5 font-body text-[10px] font-bold uppercase tracking-[0.05em] text-fg-subtle">{label}</div>
              {items.map((it) => {
                const when = whenLabel(it, today);
                return (
                  <button key={it.id} onClick={() => it.accountId && openAccount(it.accountId)} disabled={!it.accountId}
                    className="flex w-full items-start gap-2.5 px-3.5 py-1.5 text-left transition-colors enabled:hover:bg-bg-muted/50">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[it.tone ?? "neutral"])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-[12px] font-medium text-fg">{it.title}</span>
                      <span className="font-body text-[10.5px] text-fg-subtle">{it.sub} · <span className={cn(when.tone === "danger" && "font-semibold text-danger-fg", when.tone === "warning" && "font-semibold text-warning-fg")}>{when.text}</span></span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
