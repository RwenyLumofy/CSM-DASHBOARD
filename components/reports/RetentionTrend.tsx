"use client";

/* =========================================================================
   NRR/GRR over time, with the comparison period drawn — not just chipped.

   The controls said "compared to Q1 2026" and the KPI tiles showed a delta, but
   the chart itself ignored the comparison entirely. Stripe's overview is the
   reference: pick a range, pick "compared to", and the CHART carries it — the
   current series solid, the comparison ghosted behind it, both values in the
   header. The comparison stops being a number you're asked to trust and becomes
   a shape you can see.

   Here the ghost is the same-length window ending at the comparison period, so
   "last 6 quarters" is laid over "the 6 quarters before that", aligned by
   position rather than by date. Aligning by index is the whole trick: it's what
   lets two different stretches of time sit on one x-axis.

   It draws only when the comparison window actually has data. This book's ARR
   ledger thins out fast going back, and a ghost line pinned flat at a
   no-data default would invent a trend that never happened — worse than
   omitting it.

   Exists as a client component because LineChart's formatShort/formatLong are
   FUNCTIONS, and a Server Component can't serialize a closure across the
   boundary (that crashed the page once already).
   ========================================================================= */

import { Info } from "lucide-react";
import { LineChart } from "@/components/ui/charts";
import { periodDisplay } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

export interface TrendRow {
  period: string;
  nrr: number;
  grr: number;
}

export function RetentionTrend({
  trend,
  compareTrend,
  comparePeriod,
  firstRealPeriod,
  height = 188,
}: {
  trend: TrendRow[];
  /** Same-length window ending at the comparison period; null when compare="none". */
  compareTrend?: TrendRow[] | null;
  comparePeriod?: string | null;
  /** Earliest period with real retention movement — anything before it plots
   *  100% because the ledger has nothing there, not because it was perfect. */
  firstRealPeriod?: string | null;
  height?: number;
}) {
  const blindCount = firstRealPeriod ? trend.findIndex((t) => t.period === firstRealPeriod) : 0;
  const current = trend[trend.length - 1];
  const compare = compareTrend?.[compareTrend.length - 1];

  // The ghost is aligned by POSITION: index i of the comparison window is drawn
  // at index i of the current window's x-axis. It borrows the current keys so
  // both series share one axis.
  const hasGhost =
    !!compareTrend && compareTrend.length === trend.length && compareTrend.some((t) => t.nrr > 0);

  const series = [
    {
      label: "NRR %",
      color: "var(--color-sirius)",
      points: trend.map((t) => ({ month: t.period, value: t.nrr })),
    },
    {
      label: "GRR %",
      color: "var(--color-success)",
      points: trend.map((t) => ({ month: t.period, value: t.grr })),
    },
    ...(hasGhost
      ? [
          {
            label: comparePeriod ? `NRR % · ${periodDisplay(comparePeriod)} window` : "NRR % · previous",
            color: "var(--color-neutral-300)",
            points: trend.map((t, i) => ({ month: t.period, value: compareTrend![i].nrr })),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Stripe's header pattern: the two numbers side by side, so the
          comparison is legible before you read the chart. */}
      {compare && current && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Reading
            label={periodDisplay(current.period)}
            value={`${current.nrr}%`}
            swatch="var(--color-sirius)"
            strong
          />
          <Reading
            label={comparePeriod ? periodDisplay(comparePeriod) : "previous"}
            value={`${compare.nrr}%`}
            swatch="var(--color-neutral-300)"
          />
          {(() => {
            const d = current.nrr - compare.nrr;
            const flat = Math.abs(d) < 0.05;
            return (
              <span
                className={cn(
                  "tabular rounded-pill px-1.5 py-0.5 text-[11px] font-semibold",
                  flat
                    ? "bg-bg-muted text-fg-subtle"
                    : d > 0
                      ? "bg-success-bg text-success-fg"
                      : "bg-danger-bg text-danger-fg",
                )}
              >
                {flat ? "flat" : `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}pp`}
              </span>
            );
          })()}
        </div>
      )}

      <LineChart months={trend.map((t) => t.period)} formatShort={periodDisplay} formatLong={periodDisplay} height={height} series={series} />

      {/* Say where the data actually starts. A flat 100% tail is what
          computeRetention returns for a period with no churn and no expansion —
          identical to a period the ledger has never heard of. Unlabelled, the
          line reads "retention was perfect, then collapsed". */}
      {blindCount > 0 && (
        <p className="caption flex items-start gap-1.5 rounded-md bg-bg-subtle px-2.5 py-1.5">
          <Info size={11} strokeWidth={2} className="mt-[3px] shrink-0" aria-hidden />
          <span>
            The ARR ledger records no churn or expansion before{" "}
            <strong className="font-semibold text-fg">{periodDisplay(firstRealPeriod!)}</strong>, so the{" "}
            {blindCount === 1 ? "first point" : `first ${blindCount} points`} plot 100% because there was nothing to
            retain against — not because retention was perfect.
          </span>
        </p>
      )}
    </div>
  );
}

function Reading({
  label,
  value,
  swatch,
  strong,
}: {
  label: string;
  value: string;
  swatch: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="inline-block size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: swatch }} />
      <span className="caption">{label}</span>
      <span className={cn("tabular font-body font-semibold", strong ? "text-[15px] text-fg" : "text-[13px] text-fg-muted")}>
        {value}
      </span>
    </span>
  );
}
