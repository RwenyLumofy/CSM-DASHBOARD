"use client";

/* =========================================================================
   Period + comparison — Overview ONLY.

   Deliberately not in the layout alongside the filters. Filters are universal;
   a period is not. Churn is an all-time pattern and a coverage audit is
   as-of-today, so a period selector on those pages would be inert decoration —
   the same broken promise the page-level "compare" control was making when it
   sat above eight panels and governed two of them.

   Rendered inside the section it governs, which is what Stripe does: their
   overview puts "[Last 12 months] compared to [Previous period]" in the section
   header, and every card in that section obeys it. A control that governs its
   section honestly beats a global one that lies.

   Known gap, stated rather than hidden: the ranges here are CALENDAR periods
   only. Verified research says the convention is calendar AND rolling ("last 30
   days") offered side by side as visibly separate groups — Salesforce's own
   LAST_N_DAYS:30 includes today while LAST_N_MONTHS:3 excludes the current
   month, which is why blending them into one list is a trap. Rolling needs
   periodBounds to take arbitrary bounds; not done yet.
   ========================================================================= */

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, GitCompareArrows, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { shiftPeriod } from "@/lib/metrics/arr";
import {
  COMPARE_MODES,
  PRESETS,
  comparisonPeriod,
  matchPreset,
  periodDisplay,
  resolvePreset,
  type CompareMode,
  type PresetKey,
} from "@/lib/metrics/exec";

export function PeriodControls({ period, compare }: { period: string; compare: CompareMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
      start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [router, pathname, sp],
  );

  const preset = matchPreset(period);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Named range. The resolved period rides alongside so the label is never
          ambiguous; paging off a preset reads "Custom". */}
      <label className="relative inline-flex items-center">
        <span className="sr-only">Date range</span>
        <CalendarRange size={13} strokeWidth={2} aria-hidden className="pointer-events-none absolute left-2.5 text-fg-subtle" />
        <select
          value={preset ?? "custom"}
          onChange={(e) => {
            const k = e.target.value as PresetKey | "custom";
            if (k !== "custom") setParam("period", resolvePreset(k));
          }}
          className="h-[31px] cursor-pointer appearance-none rounded-sm border border-border bg-surface pl-7 pr-7 font-body text-[12.5px] font-semibold text-fg transition-colors hover:border-border-strong"
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} · {periodDisplay(resolvePreset(p.key))}
            </option>
          ))}
          {!preset && <option value="custom">Custom · {periodDisplay(period)}</option>}
        </select>
        <ChevronDown size={12} strokeWidth={2.5} aria-hidden className="pointer-events-none absolute right-2 text-fg-subtle" />
      </label>

      <div className="flex items-center rounded-sm border border-border bg-surface shadow-xs">
        <NavButton label="Previous period" onClick={() => setParam("period", shiftPeriod(period, -1))} icon={ChevronLeft} />
        <span className="tabular min-w-[84px] border-x border-border px-2.5 py-[7px] text-center font-body text-[12.5px] font-semibold text-fg-muted">
          {periodDisplay(period)}
        </span>
        <NavButton label="Next period" onClick={() => setParam("period", shiftPeriod(period, 1))} icon={ChevronRight} />
      </div>

      <label className="relative inline-flex items-center">
        <span className="sr-only">Compare against</span>
        <GitCompareArrows size={13} strokeWidth={2} aria-hidden className="pointer-events-none absolute left-2.5 text-fg-subtle" />
        <select
          value={compare}
          onChange={(e) => setParam("compare", e.target.value === "prev" ? "" : e.target.value)}
          className="h-[31px] cursor-pointer appearance-none rounded-sm border border-border bg-surface pl-7 pr-7 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          {COMPARE_MODES.map((m) => {
            const target = comparisonPeriod(period, m.value);
            return (
              <option key={m.value} value={m.value}>
                vs {target ? periodDisplay(target) : "nothing"}
              </option>
            );
          })}
        </select>
        <ChevronDown size={12} strokeWidth={2.5} aria-hidden className="pointer-events-none absolute right-2 text-fg-subtle" />
      </label>

      {pending && <Loader2 size={14} className="animate-spin text-fg-subtle" aria-hidden />}
    </div>
  );
}

function NavButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof ChevronLeft }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-[31px] place-items-center text-fg-muted transition-colors duration-[140ms] hover:bg-bg-muted hover:text-fg"
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}
