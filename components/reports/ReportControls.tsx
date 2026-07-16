"use client";

/* =========================================================================
   /reports controls — period navigator + filter bar.

   All state lives in the URL, not React. That's the point: an exec pastes
   "?period=2026-Q2&csm=zali@lumofy.com" into a board pack and it still means
   the same thing next month. It also makes back/forward work and survives the
   `router.refresh()` a sync triggers.

   Each control is an <a href> under the hood (via router.push on change) so
   the server recomputes the filtered rollup — the numbers themselves change,
   not just which rows are visible.
   ========================================================================= */

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { shiftPeriod } from "@/lib/metrics/arr";
import { periodDisplay, periodGrain, type FilterOptions } from "@/lib/metrics/exec";

const GRAINS = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
] as const;

/** Re-express `period` at a different granularity, anchored on its start date
 *  so switching Quarter→Month lands on that quarter's first month rather than
 *  jumping to today. */
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

const SELECTS: { key: keyof FilterOptions; label: string; width?: string }[] = [
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
  options,
  filteredCount,
  totalCount,
}: {
  period: string;
  options: FilterOptions;
  filteredCount: number;
  totalCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

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

  const grain = periodGrain(period);
  const active = useMemo(
    () => SELECTS.map((s) => ({ ...s, value: sp.get(s.key) })).filter((s) => s.value),
    [sp],
  );
  const isFiltered = active.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* ---- row 1: period navigator + grain + scope readout ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-sm border border-border bg-surface shadow-xs">
          <NavButton
            label="Previous period"
            onClick={() => setParam("period", shiftPeriod(period, -1))}
            icon={ChevronLeft}
          />
          <span className="tabular min-w-[104px] border-x border-border px-3 py-[7px] text-center font-body text-[13px] font-semibold text-fg">
            {periodDisplay(period)}
          </span>
          <NavButton
            label="Next period"
            onClick={() => setParam("period", shiftPeriod(period, 1))}
            icon={ChevronRight}
          />
        </div>

        {/* grain toggle */}
        <div className="flex items-center rounded-sm border border-border bg-bg-subtle p-0.5">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setParam("period", reGrain(period, g.key))}
              aria-pressed={grain === g.key}
              className={cn(
                "rounded-[5px] px-2.5 py-1 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
                grain === g.key
                  ? "bg-surface text-fg shadow-xs"
                  : "text-fg-subtle hover:text-fg",
              )}
            >
              {g.label}
            </button>
          ))}
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

      {/* ---- row 2: filters ---- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-2">
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
        {isFiltered && (
          <button
            type="button"
            onClick={() => push((p) => SELECTS.forEach((s) => p.delete(s.key)))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <RotateCcw size={13} strokeWidth={2} />
            Clear filters
          </button>
        )}
      </div>

      {/* ---- row 3: active filter chips ---- */}
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
                <span className="text-sirius-600/70">{s.label}:</span>
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

function NavButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: typeof ChevronLeft;
}) {
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
    <label className="relative inline-flex">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-[30px] cursor-pointer appearance-none rounded-sm border bg-surface pl-2.5 pr-7 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
          on
            ? "border-sirius-300 text-sirius-600"
            : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
        )}
      >
        <option value="all">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label} ({o.count})
          </option>
        ))}
      </select>
      <ChevronRight
        size={12}
        strokeWidth={2.5}
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90",
          on ? "text-sirius-600" : "text-fg-subtle",
        )}
      />
    </label>
  );
}
