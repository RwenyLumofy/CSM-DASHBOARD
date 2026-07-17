"use client";

/* =========================================================================
   GRR and NRR over time, with targets.

   MISSING DATA IS NEVER PLOTTED. computeRetention returns 100% for a period
   where nothing happened, which is indistinguishable from a period the ledger
   has never heard of — and this ledger records no churn before 2025-Q4. The
   previous version drew those points at 100% and captioned the boundary
   underneath, which doesn't help: a drawn line is a claim, and the caption was
   arguing with the chart. The no-data head is now dropped from the SERIES and
   reported as a gap.

   ONE LINE WHEN THEY OVERLAP. GRR and NRR are identical whenever expansion is
   zero, which is most periods here. Drawing NRR over GRR hides one series
   behind the other and makes the chart look like it has one metric. When they
   coincide, one line is drawn and labelled as both — with both values still in
   the tooltip and the legend, because they are still two separate metrics that
   happen to agree.

   Targets are reference lines, not series: GRR ≥95%, NRR ≥100%. They're a
   different KIND of thing from a measurement and shouldn't compete in the
   legend.
   ========================================================================= */

import { useState } from "react";
import { periodDisplay } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

export interface TrendRow {
  period: string;
  nrr: number;
  grr: number;
}

const GRR_TARGET = 95;
const NRR_TARGET = 100;

export function RetentionTrend({
  trend,
  omitted,
  firstRealPeriod,
  height = 190,
}: {
  /** Already stripped of no-data periods by the caller — this component never
   *  decides what's plottable, it just refuses to invent points. */
  trend: TrendRow[];
  omitted?: number;
  firstRealPeriod?: string | null;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (!trend.length) {
    return (
      <div className="flex h-[190px] items-center justify-center rounded-md bg-bg-subtle">
        <p className="caption">No reliable retention data in this window.</p>
      </div>
    );
  }

  const W = 720;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const vals = trend.flatMap((t) => [t.grr, t.nrr]);
  // Include both targets in the domain — a reference line you can't see isn't a
  // reference. Padded so a 100% NRR target isn't flush with the ceiling.
  const lo = Math.min(...vals, GRR_TARGET) - 6;
  const hi = Math.max(...vals, NRR_TARGET) + 6;
  const span = hi - lo || 1;
  const yFor = (v: number) => padT + innerH - ((v - lo) / span) * innerH;
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : 0;
  const xFor = (i: number) => padL + (trend.length > 1 ? i * stepX : innerW / 2);

  // Do the two series coincide everywhere? Then draw one.
  const identical = trend.every((t) => Math.abs(t.nrr - t.grr) < 0.05);
  const ticks = [lo, lo + span / 2, hi].map((v) => Math.round(v));
  const path = (get: (t: TrendRow) => number) =>
    trend.map((t, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(get(t)).toFixed(1)}`).join(" ");

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel(trend, identical)} className="overflow-visible">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke="var(--color-border-subtle)" strokeWidth={1} />
              <text x={padL - 6} y={yFor(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" className="font-body tabular">
                {t}%
              </text>
            </g>
          ))}

          {/* Targets as reference lines — a different kind of thing from a
              measurement, so dashed and unlabelled in the legend. */}
          {[
            { v: GRR_TARGET, label: "GRR ≥95%" },
            { v: NRR_TARGET, label: "NRR ≥100%" },
          ].map((t) => (
            <g key={t.v}>
              <line x1={padL} y1={yFor(t.v)} x2={W - padR} y2={yFor(t.v)} stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={W - padR} y={yFor(t.v) - 4} textAnchor="end" fontSize={9} fill="var(--color-fg-subtle)" className="font-body">
                {t.label}
              </text>
            </g>
          ))}

          {/* The expansion-lift band: the space BETWEEN the series is the lift,
              which is the relationship a diagram was previously asserting in
              the summary card. Nothing to shade when they coincide. */}
          {!identical && (
            <path
              d={`${path((t) => t.nrr)} L${xFor(trend.length - 1)},${yFor(trend[trend.length - 1].grr)} ${trend
                .slice()
                .reverse()
                .map((t, i) => `L${xFor(trend.length - 1 - i)},${yFor(t.grr)}`)
                .join(" ")} Z`}
              fill="var(--color-success)"
              opacity={0.12}
            />
          )}

          {!identical && <path d={path((t) => t.grr)} fill="none" stroke="var(--color-sirius)" strokeWidth={2} strokeLinecap="round" />}
          <path
            d={path((t) => t.nrr)}
            fill="none"
            stroke={identical ? "var(--color-sirius)" : "var(--color-success)"}
            strokeWidth={2}
            strokeLinecap="round"
          />

          {trend.map((t, i) => (
            <g key={t.period}>
              {!identical && <circle cx={xFor(i)} cy={yFor(t.grr)} r={hover === i ? 4 : 2.4} fill="var(--color-sirius)" />}
              <circle
                cx={xFor(i)}
                cy={yFor(t.nrr)}
                r={hover === i ? 4 : 2.4}
                fill={identical ? "var(--color-sirius)" : "var(--color-success)"}
              />
              <text x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)" className="font-body">
                {periodDisplay(t.period)}
              </text>
              <rect
                x={xFor(i) - (stepX || innerW) / 2}
                y={padT}
                width={stepX || innerW}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "crosshair" }}
              />
            </g>
          ))}
        </svg>

        {/* Both values in the tooltip ALWAYS, even when one line is drawn —
            they're two metrics that agree, not one metric. */}
        {hover != null && (
          <div
            className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-lg"
            style={{
              left: `${(xFor(hover) / W) * 100}%`,
              top: `${(yFor(Math.max(trend[hover].grr, trend[hover].nrr)) / H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 10px))",
            }}
          >
            <div className="text-[11px] font-semibold text-fg">{periodDisplay(trend[hover].period)}</div>
            <div className="tabular mt-0.5 text-[11.5px] text-fg-muted">
              GRR {trend[hover].grr}% · NRR {trend[hover].nrr}%
            </div>
            <div className="tabular text-[10.5px] text-fg-subtle">
              Expansion lift {(trend[hover].nrr - trend[hover].grr).toFixed(1)} pts
            </div>
          </div>
        )}
      </div>

      {/* Legend: the two series only. Targets label themselves on the chart. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {identical ? (
          <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-sirius" />
            GRR and NRR — identical, no expansion in these periods
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-sirius" />
              GRR
            </span>
            <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              NRR
            </span>
          </>
        )}
        {omitted ? (
          <span className={cn("caption ml-auto")}>
            Ledger data from {firstRealPeriod ? periodDisplay(firstRealPeriod) : "—"} · {omitted} earlier{" "}
            {omitted === 1 ? "period" : "periods"} — no data
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ariaLabel(trend: TrendRow[], identical: boolean): string {
  const last = trend[trend.length - 1];
  return identical
    ? `GRR and NRR retention trend, identical across ${trend.length} periods, ending at ${last.grr}%`
    : `GRR and NRR retention trend over ${trend.length} periods, ending at GRR ${last.grr}% and NRR ${last.nrr}%`;
}
