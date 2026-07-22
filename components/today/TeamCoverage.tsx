"use client";

/* Today — Team coverage. Two shapes, one data source (getTeamAllocation):
   • full (My team): the coverage workspace — exception cards first (risk
     concentration / overloaded / unassigned), then the whole roster as a table
     with per-CSM ARR, requiring-attention, overdue and a workload bar, then the
     unassigned-records banner.
   • compact (Company sidebar): exceptions-only list beside the priorities.
   Every figure labels BOTH the account count and the ARR — never a bare "%".
   Clicking a CSM narrows the whole page to their book. */

import { useState } from "react";
import { AlertTriangle, ArrowRight, Users, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PortfolioScope } from "@/lib/today/types";
import { getTeamAllocation, getUser } from "@/lib/today/repo";
import { formatMoney } from "@/lib/today/format";

const initials = (name: string) => {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
};

export function TeamCoverage({ scope, ownerFilter, onPick, onClear, full = false }: {
  scope: PortfolioScope;
  ownerFilter: string | null;
  onPick: (userId: string) => void;
  onClear: () => void;
  full?: boolean;
}) {
  const [showAll, setShowAll] = useState(full);
  const rows = getTeamAllocation(scope);
  const totalArr = rows.reduce((s, r) => s + r.arr, 0);
  const unassigned = rows.find((r) => r.userId === "unassigned" && r.accountCount > 0);
  const csms = rows.filter((r) => r.userId !== "unassigned");
  const maxAccts = Math.max(1, ...csms.map((r) => r.accountCount));
  const avgAccts = csms.length ? csms.reduce((s, r) => s + r.accountCount, 0) / csms.length : 0;
  const isOverloaded = (n: number) => n >= 10 && n > avgAccts * 1.5;

  // Drill-in: page already narrowed to this owner — focused summary.
  if (ownerFilter) {
    const r = rows.find((x) => x.userId === ownerFilter);
    const name = r?.name ?? getUser(ownerFilter)?.name ?? "This CSM";
    return (
      <section aria-label="Team coverage" className="rounded-xl border border-sirius/30 bg-accent-soft/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-body text-[13px] font-semibold text-fg">Viewing {name}&apos;s book</span>
          <button onClick={onClear} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted hover:text-fg"><X size={12} /> Clear</button>
        </div>
        {r && (
          <div className="mt-2 flex flex-col gap-1 font-body text-[12px] text-fg-muted">
            <span>{r.accountCount} account{r.accountCount === 1 ? "" : "s"} · {formatMoney(r.arr)} ARR</span>
            {r.atRisk > 0
              ? <span className="font-semibold text-danger-fg">{r.atRisk} of {r.accountCount} at risk · {formatMoney(r.exposedArr)} exposed</span>
              : <span className="text-success-fg">No at-risk accounts</span>}
          </div>
        )}
      </section>
    );
  }

  const exceptions = csms
    .filter((r) => r.exposedArr > 0 || isOverloaded(r.accountCount))
    .sort((a, b) => b.exposedArr - a.exposedArr || b.accountCount - a.accountCount);
  const exceptionCount = exceptions.length + (unassigned ? 1 : 0);
  const clean = exceptions.length === 0 && !unassigned;

  /* ----------------------------------------- full workspace (My team) */
  if (full) {
    return (
      <section aria-label="Team coverage" className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-body text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted">Team coverage</h2>
          <span className="font-body text-[12px] text-fg-subtle">
            {clean ? "Every CSM on track" : `Exceptions first · ${exceptionCount} of ${csms.length} CSMs need review`}
          </span>
          <span className="ml-auto font-body text-[11.5px] tabular-nums text-fg-subtle">{formatMoney(totalArr)} team ARR</span>
        </div>

        {/* exception cards */}
        {exceptions.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {exceptions.map((r, i) => {
              const over = isOverloaded(r.accountCount);
              const concentration = r.exposedArr > 0;
              return (
                <div key={r.userId} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border-subtle")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", concentration ? "bg-danger-bg text-danger-fg" : "bg-warning-bg text-warning-fg")}>
                    {concentration ? <AlertTriangle size={15} /> : <Users size={15} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-body text-[13px] font-semibold text-fg">{r.name} — {concentration ? "risk concentration" : "overloaded"}</div>
                    <div className="font-body text-[11.5px] tabular-nums text-fg-muted">
                      {concentration
                        ? `${r.atRisk} of ${r.accountCount} at risk, but ${formatMoney(r.exposedArr)} of ${formatMoney(r.arr)} ARR exposed`
                        : `${r.accountCount} accounts (avg ${Math.round(avgAccts)})${r.overdue ? ` · ${r.overdue} overdue` : ""}`}
                    </div>
                  </div>
                  <button onClick={() => onPick(r.userId)} className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 font-body text-[11.5px] font-semibold text-sirius hover:bg-accent-soft/50">
                    {over && !concentration ? "Rebalance" : "Review book"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* full roster table */}
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full tabular-nums">
            <thead>
              <tr className="border-b border-border-subtle">
                {["CSM", "Accounts", "ARR owned", "Requiring attention", "Overdue"].map((h, i) => (
                  <th key={h} className={cn("whitespace-nowrap px-4 py-2.5 font-body text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-subtle", i === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
                <th className="hidden whitespace-nowrap px-4 py-2.5 text-right font-body text-[10px] font-semibold uppercase tracking-[0.04em] text-fg-subtle lg:table-cell">Workload</th>
              </tr>
            </thead>
            <tbody>
              {csms.map((r) => {
                const over = isOverloaded(r.accountCount);
                const pct = Math.round((r.accountCount / maxAccts) * 100);
                const load = over ? { w: "bg-danger-fg", t: "Over" } : r.accountCount < avgAccts * 0.7 ? { w: "bg-success-fg", t: "Light" } : { w: "bg-success-fg", t: "Balanced" };
                return (
                  <tr key={r.userId} className="cursor-pointer border-b border-border-subtle last:border-0 hover:bg-bg-muted/40" onClick={() => onPick(r.userId)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sirius text-[9px] font-bold text-white">{initials(r.name)}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-fg">
                            <span className="truncate">{r.name}</span>
                            {over && <span className="shrink-0 rounded bg-warning-bg px-1 py-0.5 font-body text-[9px] font-medium text-warning-fg">Overloaded</span>}
                          </div>
                          <div className="font-body text-[11px] text-fg-subtle">{r.role ?? "CSM"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-body text-[12.5px] text-fg-muted">{r.accountCount}</td>
                    <td className="px-4 py-3 text-right font-body text-[12.5px] text-fg-muted">{formatMoney(r.arr)}</td>
                    <td className="px-4 py-3 text-right font-body text-[12px]">
                      {r.exposedArr > 0
                        ? <span className="font-semibold text-danger-fg">{r.atRisk} of {r.accountCount} · {formatMoney(r.exposedArr)}</span>
                        : <span className="text-success-fg">None</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-body text-[12.5px]">{r.overdue > 0 ? <span className="font-semibold text-danger-fg">{r.overdue}</span> : <span className="text-fg-subtle">0</span>}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-border-subtle"><span className={cn("block h-full rounded-full", load.w)} style={{ width: `${pct}%` }} /></span>
                        <span className="w-14 text-left font-body text-[10.5px] text-fg-subtle">{load.t}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* unassigned banner */}
        {unassigned && (
          <button onClick={() => onPick("unassigned")} className="flex items-center gap-3 rounded-xl border border-warning-fg/40 bg-warning-bg px-4 py-3 text-left">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-fg/15 font-body text-[13px] font-bold text-warning-fg">?</span>
            <div className="min-w-0 flex-1">
              <div className="font-body text-[12.5px] font-semibold tabular-nums text-warning-fg">{unassigned.accountCount} unassigned records · {formatMoney(unassigned.arr)} recorded</div>
              <div className="font-body text-[11.5px] text-warning-fg/80">Not counted in team risk — classify before treating as active.</div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-warning-fg px-2.5 py-1.5 font-body text-[11.5px] font-semibold text-white">Open classification <ArrowRight size={12} /></span>
          </button>
        )}
      </section>
    );
  }

  /* ----------------------------------------- compact sidebar (Company) */
  return (
    <section aria-label="Team coverage" className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3.5 py-3">
        <span className="min-w-0">
          <span className="inline-flex items-center gap-1.5 font-body text-[13px] font-semibold text-fg"><Users size={14} className="text-fg-subtle" /> Team coverage · exceptions</span>
          {!clean && <span className="mt-0.5 block font-body text-[11px] text-fg-subtle">{exceptionCount} of {csms.length} CSM{csms.length === 1 ? "" : "s"} need review</span>}
        </span>
        <span className="shrink-0 font-body text-[11.5px] tabular-nums text-fg-subtle">{formatMoney(totalArr)}</span>
      </div>

      {clean ? (
        <p className="px-3.5 py-4 font-body text-[12.5px] text-fg-subtle">Every CSM is on track — no coverage exceptions.</p>
      ) : (
        <ul className="flex flex-col p-1.5">
          {!showAll && <li className="px-2 pb-1 pt-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">Needs attention</li>}
          {(showAll ? csms : exceptions).map((r) => {
            const over = isOverloaded(r.accountCount);
            return (
              <li key={r.userId}>
                <button onClick={() => onPick(r.userId)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-muted/50">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sirius text-[9px] font-bold text-white">{initials(r.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-body text-[12.5px] font-semibold text-fg">{r.name}</span>
                      {over && <span className="shrink-0 rounded bg-warning-bg px-1 py-0.5 font-body text-[9.5px] font-medium text-warning-fg">Overloaded</span>}
                    </span>
                    <span className="block font-body text-[11px] tabular-nums text-fg-subtle">{r.accountCount} account{r.accountCount === 1 ? "" : "s"} · {formatMoney(r.arr)}</span>
                    {r.exposedArr > 0
                      ? <span className="mt-0.5 inline-flex items-center gap-1 font-body text-[11px] font-semibold text-danger-fg"><AlertTriangle size={10} /> {r.atRisk} of {r.accountCount} at risk · {formatMoney(r.exposedArr)}</span>
                      : showAll && <span className="mt-0.5 block font-body text-[11px] text-success-fg">On track</span>}
                  </span>
                  <ArrowRight size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
                </button>
              </li>
            );
          })}

          {unassigned && !showAll && (
            <li>
              <button onClick={() => onPick("unassigned")} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-muted/50">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-fg-subtle text-[9px] font-bold text-white">?</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-[12.5px] font-semibold text-fg">Unassigned</span>
                  <span className="block font-body text-[11px] tabular-nums text-fg-subtle">{unassigned.accountCount} records · {formatMoney(unassigned.arr)} recorded</span>
                  <span className="mt-0.5 block font-body text-[11px] font-medium text-warning-fg">Review classification</span>
                </span>
                <ArrowRight size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
              </button>
            </li>
          )}
        </ul>
      )}

      {csms.length > exceptions.length && (
        <button onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-center gap-1 border-t border-border-subtle px-3 py-2 font-body text-[11.5px] font-semibold text-sirius hover:bg-accent-soft/40">
          {showAll ? "Show exceptions only" : `View all ${csms.length} CSMs`} <ChevronDown size={13} className={cn("transition-transform", showAll && "rotate-180")} />
        </button>
      )}
    </section>
  );
}
