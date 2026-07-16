"use client";

/* =========================================================================
   Insights controls — period navigator, comparison, and filters.

   All state lives in the URL, not React. That's the point: an exec pastes
   "?period=2026-Q2&csm=zali@lumofy.com" into a board pack and it still means
   the same thing next month. It also makes back/forward work and survives the
   router.refresh() a sync triggers. Every control recomputes the report on the
   server — the numbers change, not just which rows are visible.

   LAYOUT: one row, and filters COLLAPSE.
   The first cut rendered all eight filter selects permanently expanded, each
   reading "CSM: All", "Segment: All", … — two wrapped rows of controls
   announcing, at length, that nothing was filtered. Together with a redundant
   eyebrow and a static description it pushed the first real number ~550px down
   the page. Filters now cost one button until used, and an active filter is a
   chip you can see and dismiss. (Vitally tucks its filter panel away for the
   same reason.)
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, GitCompareArrows, Loader2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { shiftPeriod } from "@/lib/metrics/arr";
import {
  COMPARE_MODES,
  comparisonPeriod,
  periodDisplay,
  periodGrain,
  type CompareMode,
  type FilterOptions,
} from "@/lib/metrics/exec";

const GRAINS = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
] as const;

/** Re-express `period` at a different granularity, anchored on its start date so
 *  Quarter→Month lands on that quarter's first month rather than jumping to
 *  today. */
function reGrain(period: string, grain: (typeof GRAINS)[number]["key"]): string {
  const q = period.match(/^(\d{4})-Q([1-4])$/i);
  const mo = period.match(/^(\d{4})-(\d{2})$/);
  const yr = period.match(/^(\d{4})$/);
  const year = Number(q?.[1] ?? mo?.[1] ?? yr?.[1] ?? new Date().getUTCFullYear());
  const month = q ? (Number(q[2]) - 1) * 3 + 1 : mo ? Number(mo[2]) : 1;
  if (grain === "year") return String(year);
  if (grain === "quarter") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

const SELECTS: { key: keyof FilterOptions; label: string }[] = [
  { key: "csm", label: "CSM" },
  { key: "segment", label: "Segment" },
  { key: "status", label: "Status" },
  { key: "health", label: "Health" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "tier", label: "Tier" },
  { key: "customerType", label: "Type" },
];

export function ReportControls({
  period,
  compare,
  options,
  filteredCount,
  totalCount,
}: {
  period: string;
  compare: CompareMode;
  options: FilterOptions;
  filteredCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const push = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(sp.toString());
      mutate(next);
      start(() => router.push(`/reports?${next.toString()}`, { scroll: false }));
    },
    [router, sp],
  );

  const setParam = useCallback(
    (key: string, value: string) => push((p) => (value && value !== "all" ? p.set(key, value) : p.delete(key))),
    [push],
  );

  // Dismiss the filter panel on outside click / Escape — a popover that can only
  // be closed by the button that opened it is a trap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grain = periodGrain(period);
  const active = useMemo(() => SELECTS.map((s) => ({ ...s, value: sp.get(s.key) })).filter((s) => s.value), [sp]);
  const isFiltered = active.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* period navigator */}
        <div className="flex items-center rounded-sm border border-border bg-surface shadow-xs">
          <NavButton label="Previous period" onClick={() => setParam("period", shiftPeriod(period, -1))} icon={ChevronLeft} />
          <span className="tabular min-w-[96px] border-x border-border px-3 py-[7px] text-center font-body text-[13px] font-semibold text-fg">
            {periodDisplay(period)}
          </span>
          <NavButton label="Next period" onClick={() => setParam("period", shiftPeriod(period, 1))} icon={ChevronRight} />
        </div>

        {/* grain */}
        <div className="flex items-center rounded-sm border border-border bg-bg-subtle p-0.5">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setParam("period", reGrain(period, g.key))}
              aria-pressed={grain === g.key}
              className={cn(
                "rounded-[5px] px-2.5 py-1 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
                grain === g.key ? "bg-surface text-fg shadow-xs" : "text-fg-subtle hover:text-fg",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* comparison — spells out the resolved target so a delta is never
            ambiguous about what it measures against */}
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

        {/* filters — one button, not eight selects */}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              "inline-flex h-[31px] items-center gap-1.5 rounded-sm border px-2.5 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
              isFiltered
                ? "border-sirius-300 bg-sirius-50 text-sirius-600"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
            Filters
            {isFiltered && (
              <span className="tabular grid size-4 place-items-center rounded-pill bg-sirius text-[10px] font-bold text-white">
                {active.length}
              </span>
            )}
            <ChevronDown size={12} strokeWidth={2.5} className={cn("transition-transform", open && "rotate-180")} />
          </button>

          {open && (
            <div
              role="dialog"
              aria-label="Filters"
              className="pm-overlay-in absolute left-0 top-[calc(100%+6px)] z-50 w-[min(92vw,460px)] rounded-lg border border-border bg-surface p-3 shadow-lg"
            >
              <div className="grid grid-cols-2 gap-2">
                {SELECTS.map((s) => {
                  const opts = options[s.key];
                  if (!opts?.length) return null;
                  return (
                    <FilterSelect
                      key={s.key}
                      label={s.label}
                      value={sp.get(s.key) ?? "all"}
                      options={opts}
                      onChange={(v) => setParam(s.key, v)}
                    />
                  );
                })}
              </div>
              {isFiltered && (
                <button
                  type="button"
                  onClick={() => push((p) => SELECTS.forEach((s) => p.delete(s.key)))}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-border py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {pending && <Loader2 size={14} className="animate-spin text-fg-subtle" aria-hidden />}
          <span className="caption tabular" aria-live="polite">
            {isFiltered ? (
              <>
                <span className="font-semibold text-fg">{filteredCount}</span> of {totalCount} accounts
              </>
            ) : (
              <>
                <span className="font-semibold text-fg">{totalCount}</span> accounts
              </>
            )}
          </span>
        </div>
      </div>

      {/* active filters — visible and individually dismissible, so a filtered
          view never silently misleads about what it's showing */}
      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((s) => {
            const opt = options[s.key]?.find((o) => o.value === s.value);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setParam(s.key, "")}
                className="group inline-flex items-center gap-1.5 rounded-pill border border-sirius-200 bg-sirius-50 py-1 pl-2.5 pr-1.5 font-body text-[11.5px] font-semibold text-sirius-600 transition-colors hover:border-sirius-300"
              >
                <span className="opacity-70">{s.label}:</span>
                {opt?.label ?? s.value}
                <X size={12} strokeWidth={2.5} className="opacity-50 group-hover:opacity-100" aria-hidden />
                <span className="sr-only">Remove {s.label} filter</span>
              </button>
            );
          })}
        </div>
      )}
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

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (v: string) => void;
}) {
  const on = value !== "all";
  return (
    <label className="relative inline-flex flex-col gap-1">
      <span className="eyebrow text-[10px]">{label}</span>
      <span className="relative inline-flex">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-[30px] w-full cursor-pointer appearance-none rounded-sm border bg-surface pl-2.5 pr-7 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
            on ? "border-sirius-300 text-sirius-600" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
        >
          <option value="all">All</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count})
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          aria-hidden
          className={cn("pointer-events-none absolute right-2 top-1/2 -translate-y-1/2", on ? "text-sirius-600" : "text-fg-subtle")}
        />
      </span>
    </label>
  );
}
