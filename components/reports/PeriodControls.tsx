"use client";

/* =========================================================================
   Date range + comparison — Overview ONLY.

   Not in the layout with the filters: filters are universal, a period is not.
   Churn is all-time and a coverage audit is as-of-today, so a period selector
   on those pages would be inert decoration — the same broken promise the
   page-level "compare" control was making when it sat above eight panels and
   governed two. This lives inside the section it governs, which is what Stripe
   does.

   THE PICKER, and why it looks like this:

   - CALENDAR and ROLLING are separate groups, never one blended "relative"
     list. Salesforce's own literals prove why: LAST_N_DAYS:30 includes today,
     LAST_N_MONTHS:3 excludes the current month — same shape, opposite meaning.
     Offering both is the convention (Mixpanel leads rolling, Stripe Reports
     leads calendar); the first cut offered only calendar and argued the other
     away.
   - The RESOLVED DATES are always on screen. "Last 90 days" is unreadable
     without them, and Stripe shows "Last 6 months · Dec 1–Jun 1" for exactly
     this reason.
   - CUSTOM takes two dates, inclusive — "through Apr 30" includes the 30th.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, GitCompareArrows, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { periodBounds, rangeKey, shiftPeriod } from "@/lib/metrics/arr";
import {
  COMPARE_MODES,
  PRESETS,
  comparisonPeriod,
  matchPreset,
  periodDisplay,
  resolvePreset,
  type CompareMode,
} from "@/lib/metrics/exec";

const GROUPS = [
  { key: "calendar" as const, label: "Calendar periods" },
  { key: "rolling" as const, label: "Rolling windows" },
];

export function PeriodControls({ period, compare }: { period: string; compare: CompareMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [router, pathname, sp],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const preset = matchPreset(period);
  const label = preset ? PRESETS.find((p) => p.key === preset)!.label : "Custom";
  const bounds = useMemo(() => periodBounds(period), [period]);
  // periodBounds' end is exclusive; a picker shows the inclusive day.
  const inclusiveEnd = useMemo(() => {
    const d = new Date(`${bounds.end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [bounds.end]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex h-[31px] items-center gap-2 rounded-sm border border-border bg-surface px-2.5 font-body text-[12.5px] font-semibold text-fg transition-colors hover:border-border-strong"
        >
          <CalendarRange size={13} strokeWidth={2} className="text-fg-subtle" aria-hidden />
          {label}
          {/* The resolved dates, always — a range label without them is a
              riddle, and this is the bit the old picker was missing. */}
          <span className="tabular font-medium text-fg-subtle">{periodDisplay(period)}</span>
          <ChevronDown size={12} strokeWidth={2.5} className={cn("transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Date range"
            className="pm-overlay-in absolute left-0 top-[calc(100%+6px)] z-50 w-[min(92vw,340px)] rounded-lg border border-border bg-surface p-2 shadow-lg"
          >
            {GROUPS.map((g) => (
              <div key={g.key} className="mb-1.5 last:mb-0">
                <div className="eyebrow px-2 py-1 text-[10px]">{g.label}</div>
                {PRESETS.filter((p) => p.group === g.key).map((p) => {
                  const target = resolvePreset(p.key);
                  const on = preset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setParam("period", target);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-baseline justify-between gap-3 rounded-sm px-2 py-1.5 text-left font-body text-[12.5px] transition-colors",
                        on ? "bg-sirius-50 font-semibold text-sirius-600" : "text-fg hover:bg-bg-muted",
                      )}
                    >
                      {p.label}
                      <span className="tabular shrink-0 text-[11px] text-fg-subtle">{periodDisplay(target)}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Custom — two inclusive dates. */}
            <div className="mt-1.5 border-t border-border-subtle pt-2">
              <div className="eyebrow px-2 py-1 text-[10px]">Custom range</div>
              <div className="flex items-center gap-1.5 px-2 pb-1">
                <input
                  type="date"
                  defaultValue={bounds.start}
                  onChange={(e) => e.target.value && setParam("period", rangeKey(e.target.value, inclusiveEnd))}
                  aria-label="Start date"
                  className="h-[28px] w-full rounded-sm border border-border bg-surface px-1.5 font-body text-[11.5px] text-fg"
                />
                <span className="caption shrink-0">to</span>
                <input
                  type="date"
                  defaultValue={inclusiveEnd}
                  onChange={(e) => e.target.value && setParam("period", rangeKey(bounds.start, e.target.value))}
                  aria-label="End date"
                  className="h-[28px] w-full rounded-sm border border-border bg-surface px-1.5 font-body text-[11.5px] text-fg"
                />
              </div>
              <p className="caption px-2 pb-1 text-[10.5px]">Both dates included.</p>
            </div>
          </div>
        )}
      </div>

      {/* Pager — steps in the period's own unit: a quarter by a quarter, a
          30-day window by 30 days. */}
      <div className="flex items-center rounded-sm border border-border bg-surface shadow-xs">
        <NavButton label="Previous period" onClick={() => setParam("period", shiftPeriod(period, -1))} icon={ChevronLeft} />
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
