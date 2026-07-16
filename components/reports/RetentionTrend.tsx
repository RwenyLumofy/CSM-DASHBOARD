"use client";

/* =========================================================================
   NRR/GRR trend across periods.

   Exists as its own client component for one specific reason: LineChart's
   `formatShort`/`formatLong` are FUNCTIONS, and a Server Component cannot pass
   a function across the server/client boundary — React has to serialize props,
   and a closure has no serial form ("Functions cannot be passed directly to
   Client Components"). The reports page is a Server Component, so it passes
   plain serializable data (the trend rows) here, and this file — already on the
   client — hands periodDisplay to LineChart locally.

   The alternative was teaching LineChart to look up labels from a serializable
   map, but its month-key defaults are load-bearing for the Usage tab and not
   worth reworking for one caller.
   ========================================================================= */

import { LineChart } from "@/components/ui/charts";
import { periodDisplay } from "@/lib/metrics/exec";

export interface TrendRow {
  period: string;
  nrr: number;
  grr: number;
}

export function RetentionTrend({ trend, height = 188 }: { trend: TrendRow[]; height?: number }) {
  return (
    <LineChart
      months={trend.map((t) => t.period)}
      formatShort={periodDisplay}
      formatLong={periodDisplay}
      height={height}
      series={[
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
      ]}
    />
  );
}
