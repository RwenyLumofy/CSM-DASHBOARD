"use client";

/* =========================================================================
   The shared filter bar — rendered by the Insights LAYOUT, so it applies to
   every subpage.

   Filters are the one control that's universal: "Zainab's enterprise accounts"
   is a meaningful lens on the quarterly report, on all-time churn, and on a
   coverage audit alike. Everything else is per-page — the PERIOD control lives
   on Overview only, because churn is all-time and a coverage audit is
   as-of-today, and a period selector on those would be the same broken promise
   the page-level "compare" control used to make.

   All state is in the URL: an exec pastes "?csm=zali@lumofy.com&segment=enterprise"
   into a board pack and it means the same thing next month. Every change
   recomputes on the server — the numbers change, not just which rows show.

   Filters COLLAPSE behind one button. Rendering all eight selects permanently
   expanded, each reading "CSM: All", cost two wrapped rows to announce that
   nothing was filtered.
   ========================================================================= */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FilterOptions } from "@/lib/metrics/exec";

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

export function ReportFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Push back to the CURRENT subpage, not a hardcoded /reports — this bar is
  // rendered by the layout, so it must not yank you to Overview when you change
  // a filter while reading Churn.
  const push = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(sp.toString());
      mutate(next);
      const q = next.toString();
      start(() => router.push(q ? `${pathname}?${q}` : pathname, { scroll: false }));
    },
    [router, pathname, sp],
  );

  const setParam = useCallback(
    (key: string, value: string) => push((p) => (value && value !== "all" ? p.set(key, value) : p.delete(key))),
    [push],
  );

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

  const active = useMemo(() => SELECTS.map((s) => ({ ...s, value: sp.get(s.key) })).filter((s) => s.value), [sp]);
  const isFiltered = active.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
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

        {/* Active filters inline with the button — they're the answer to "what
            am I looking at?", which every subpage needs. */}
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

        {/* No account count here: it's page-specific truth (and a layout can't
            read searchParams to compute it). Each page states its own. */}
        {pending && <Loader2 size={14} className="ml-auto animate-spin text-fg-subtle" aria-hidden />}
      </div>
    </div>
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
