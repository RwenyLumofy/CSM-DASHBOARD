"use client";

/* Today — portfolio pulse. A compact hairline strip (not a row of oversized
   cards): five scope-specific figures divided by thin rules, tabular numbers,
   colour only where it flags exposure. Every figure comes from getPulse(scope)
   (+ team allocation for the team/company coverage figures) so they reconcile
   against the same scoped population. Metrics that drill scroll to Focus now. */

import { getPulse, getTeamAllocation } from "@/lib/today/repo";
import { formatMoney } from "@/lib/today/format";
import { cn } from "@/lib/cn";
import { useToday } from "./TodayContext";

type Metric = { label: string; value: string; drill?: boolean; tone?: "danger" | "warning" };

function metricsFor(scope: string): Metric[] {
  const p = getPulse(scope as never);
  const dueTotal = p.dueCount + p.overdueCount;

  if (scope === "my_team" || scope === "company") {
    const rows = getTeamAllocation(scope as never);
    const unassigned = rows.find((r) => r.userId === "unassigned");
    const csms = rows.filter((r) => r.userId !== "unassigned");
    const needReview = csms.filter((r) => r.exposedArr > 0).length;
    const arrLabel = scope === "company" ? "Total ARR" : "Team ARR";

    if (scope === "company") {
      return [
        { label: `${arrLabel} · ${p.accountCount}`, value: formatMoney(p.arrOwned) },
        { label: `At-risk ARR · ${p.attentionCount}`, value: p.attentionCount ? formatMoney(p.arrAttention) : "None", drill: true, tone: p.attentionCount ? "danger" : undefined },
        { label: "Renewal ARR · 90d", value: p.renew90Count ? formatMoney(p.renew90Arr) : "None", drill: true },
        { label: "Overdue actions", value: String(p.overdueCount), drill: true, tone: p.overdueCount ? "warning" : undefined },
      ];
    }
    return [
      { label: `${arrLabel} · ${p.accountCount}`, value: formatMoney(p.arrOwned) },
      { label: `At-risk ARR · ${p.attentionCount}`, value: p.attentionCount ? formatMoney(p.arrAttention) : "None", drill: true, tone: p.attentionCount ? "danger" : undefined },
      { label: "Overdue actions", value: String(p.overdueCount), drill: true, tone: p.overdueCount ? "warning" : undefined },
      { label: "Unassigned", value: String(unassigned?.accountCount ?? 0), tone: unassigned?.accountCount ? "warning" : undefined },
      { label: "CSMs need review", value: `${needReview} of ${csms.length}` },
    ];
  }

  // my_portfolio
  return [
    { label: "ARR owned", value: formatMoney(p.arrOwned) },
    { label: `At risk · ${p.attentionCount}`, value: p.attentionCount ? formatMoney(p.arrAttention) : "None", drill: true, tone: p.attentionCount ? "danger" : undefined },
    { label: `Renews 90d · ${p.renew90Count}`, value: p.renew90Count ? formatMoney(p.renew90Arr) : "None", drill: true },
    { label: `Due · ${p.overdueCount} overdue`, value: String(dueTotal), drill: true, tone: p.overdueCount ? "warning" : undefined },
  ];
}

export function PortfolioPulse({ onDrill }: { onDrill: () => void }) {
  const { scope } = useToday();
  const metrics = metricsFor(scope);

  const cols = metrics.length === 5 ? "sm:grid-cols-5" : metrics.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4";

  return (
    <section aria-label="Portfolio pulse" className="overflow-hidden rounded-xl border border-border bg-surface tabular-nums shadow-sm">
      <div className={cn("grid grid-cols-2", cols)}>
        {metrics.map((m, i) => (
          <button key={m.label} type="button" onClick={onDrill} aria-label={`${m.label}: ${m.value} — go to Do today`}
            className={cn("border-border-subtle px-4 py-3 text-left transition-colors hover:bg-bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sirius", i > 0 && "sm:border-l", i % 2 === 1 && "border-l", i >= 2 && "border-t sm:border-t-0")}>
            <div className={cn("font-display text-[18px] font-semibold leading-tight tracking-[-0.01em]", m.tone === "danger" ? "text-danger-fg" : m.tone === "warning" ? "text-warning-fg" : "text-fg")}>{m.value}</div>
            <div className="mt-0.5 font-body text-[10.5px] font-medium uppercase tracking-[0.03em] text-fg-subtle">{m.label}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
