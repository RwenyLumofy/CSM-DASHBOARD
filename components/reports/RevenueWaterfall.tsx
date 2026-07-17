"use client";

/* =========================================================================
   ARR waterfall + zero-baseline movement comparison.

   THE CHART HAS TO MAKE ONE EQUATION OBVIOUS:
     $1.797M opening − $124.7K churn + $7.0K new business = $1.679M closing

   Three decisions carry that:

   1. NO "RETAINED" COLUMN. It was an intermediate subtotal (the NRR numerator)
      inserted mid-waterfall, and it made the eye stop somewhere the equation
      doesn't. The NRR-vs-closing distinction still exists — it lives on the KPI
      tiles, which is where a definitional nuance belongs, not in the middle of
      a bridge.

   2. TOTALS ARE PRECISE TO 3 DECIMALS AT MILLIONS. Compact formatting rendered
      both $1.797M and $1.679M as "$1.8M" and "$1.7M" — or worse, both as
      "$1.7M" — hiding the entire decline the chart exists to show. A 7% fall
      cannot survive 1-significant-figure rounding. Movements stay in $K, where
      that precision is meaningless.

   3. TWO CHARTS, TWO SCALES, BOTH ZERO-BASED. The waterfall is zero-based, so
      column heights are honest — which is exactly why a $124.7K step against a
      $1.797M balance is a 6% sliver. The comparison beneath is the same
      movements on a SHARED, SYMMETRIC scale around zero: churn extends left,
      new business right, neither normalized to itself. That asymmetry — new
      business reaching 5.6% of churn's length — is the finding, and it only
      exists because both bars share one scale.

   Every figure is derived from the values passed in, so this holds for any
   period the filter produces — no hardcoded quarter, no assumed sign.
   ========================================================================= */

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

type Kind = "total" | "up" | "down";

interface Step {
  label: string;
  value: number;
  kind: Kind;
  isTotal?: boolean;
}

const COLORS: Record<Kind, string> = {
  total: "var(--color-sirius)", // blue — opening / closing
  up: "var(--color-success)", // green — new business, expansion
  down: "var(--color-danger)", // red — churn, contraction
};

/** Totals: 3 decimals at millions so a 7% decline survives the formatting.
 *  "$1.8M" vs "$1.7M" loses it; "$1.797M" vs "$1.679M" does not. */
function preciseTotal(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(3)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Movements: $K is the natural grain — 3 decimals there is false precision. */
function moneyK(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * The headline, derived — never asserted.
 *
 * The obvious sentence ("churn exceeded new business by N×") is only true in
 * one of five cases, and the others are all reachable by filtering: no churn at
 * all, churn with nothing to offset it (a division by zero), new business
 * winning, or a period where nothing happened. Each gets its own reading rather
 * than a template with a hole in it.
 */
function buildInsight(churn: number, newBusiness: number, net: number, periodLabel: string): string {
  const gone = churn > 0;
  const won = newBusiness > 0;

  if (!gone && !won) return `No revenue movement recorded in ${periodLabel}`;
  if (!gone) return `${moneyK(newBusiness)} of new business and no churn — ARR grew ${moneyK(net)} in ${periodLabel}`;
  if (!won) return `${moneyK(churn)} churned with no new business to offset it, reducing ARR by ${moneyK(Math.abs(net))} in ${periodLabel}`;

  const ratio = churn / newBusiness;
  if (ratio >= 1.05) {
    return `Churn exceeded new business by ${ratio.toFixed(1)}×, reducing ARR by ${moneyK(Math.abs(net))} in ${periodLabel}`;
  }
  if (ratio <= 0.95) {
    return `New business exceeded churn by ${(1 / ratio).toFixed(1)}×, growing ARR by ${moneyK(net)} in ${periodLabel}`;
  }
  return `New business almost exactly replaced churn in ${periodLabel} — ARR moved ${moneyK(net)}`;
}

export function RevenueWaterfall({
  startingArr,
  expansion,
  contraction,
  churn,
  newBusiness,
  periodLabel,
  height = 230,
}: {
  startingArr: number;
  expansion: number;
  contraction: number;
  churn: number;
  newBusiness: number;
  /** e.g. "Q2 2026" — the insight reads for whatever period is filtered. */
  periodLabel: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const closing = startingArr + expansion - contraction - churn + newBusiness;
  const net = closing - startingArr;
  const growth = startingArr > 0 ? net / startingArr : null;
  // What share of churned ARR new business put back. Undefined without churn —
  // "replaced 0" is not a rate.
  const replacement = churn > 0 ? newBusiness / churn : null;

  const all: Step[] = [
    { label: "Opening", value: startingArr, kind: "total", isTotal: true },
    { label: "Expansion", value: expansion, kind: "up" },
    { label: "Contraction", value: -contraction, kind: "down" },
    { label: "Churn", value: -churn, kind: "down" },
    { label: "New business", value: newBusiness, kind: "up" },
    { label: "Closing", value: closing, kind: "total", isTotal: true },
  ];
  const steps = all.filter((s) => s.isTotal || s.value !== 0);
  const moves = steps.filter((s) => !s.isTotal);
  const noExpOrContra = expansion === 0 && contraction === 0;

  let run = 0;
  const bars = steps.map((s) => {
    if (s.isTotal) {
      run = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });

  const W = 720;
  const H = height;
  const padL = 64;
  const padR = 14;
  const padT = 24;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Zero-based: a column's height IS its value. `|| 1` guards an empty book —
  // a top of 0 divides into NaN geometry.
  const top = niceMax(Math.max(...bars.map((b) => Math.max(b.from, b.to, b.value)), 0) || 1);
  const yFor = (v: number) => padT + innerH - (v / top) * innerH;
  const slot = innerW / bars.length;
  const barW = Math.min(64, slot * 0.46);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);

  // Comparison scale: SYMMETRIC around zero and SHARED. Normalizing each bar to
  // itself would make a $7K gain and a $124.7K loss the same length, which is
  // the opposite of the point.
  const cmpMax = niceMax(Math.max(...moves.map((m) => Math.abs(m.value)), 1));

  return (
    <div className="flex flex-col gap-5">
      {/* The finding, not a chart title. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="h5 max-w-[46ch] text-balance">{buildInsight(churn, newBusiness, net, periodLabel)}</h3>
        <div className="flex shrink-0 items-baseline gap-1.5 font-display">
          <span className="tabular text-base font-bold text-fg-subtle">{preciseTotal(startingArr)}</span>
          <span className="text-xs text-fg-subtle">→</span>
          <span className="tabular text-2xl font-bold text-fg">{preciseTotal(closing)}</span>
        </div>
      </div>

      {/* ---------- summary metrics ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Net ARR movement" value={moneyK(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : "flat"} />
        <Metric
          label={`${periodLabel} ARR growth`}
          // No sign on zero: "+0.0%" puts a direction on something that didn't
          // move. Keyed on the rounded DISPLAY value, not the raw one, or a
          // −0.04% move renders as a signed "0.0%".
          value={
            growth == null
              ? "—"
              : Math.abs(growth * 100) < 0.05
                ? "0.0%"
                : `${growth > 0 ? "+" : "−"}${Math.abs(growth * 100).toFixed(1)}%`
          }
          tone={growth == null || Math.abs(growth * 100) < 0.05 ? "flat" : growth < 0 ? "bad" : "good"}
        />
        <Metric
          label="Churn replacement rate"
          value={replacement == null ? "—" : `${(replacement * 100).toFixed(1)}%`}
          sub={replacement == null ? "no churn to replace" : "of churned ARR won back"}
          tone={replacement == null ? "flat" : replacement >= 1 ? "good" : "bad"}
        />
      </div>

      {/* ---------- the waterfall ----------
          Scrolls horizontally below ~620px rather than shrinking. A viewBox
          scales its TEXT too: at 375px the 10.5px labels rendered at 4.9px —
          no overlap, and completely unreadable, which is the same failure by a
          different route. min-w keeps the smallest label ≈9px and lets the
          chart scroll inside the card instead. The page itself never scrolls
          sideways: the overflow is scoped to this container. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="relative w-full min-w-[620px]">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`ARR waterfall: ${preciseTotal(startingArr)} opening to ${preciseTotal(closing)} closing`} className="overflow-visible">
          <defs>
            <linearGradient id={`wf-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-sirius)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--color-sirius)" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={yFor(t)}
                x2={W - padR}
                y2={yFor(t)}
                stroke={i === 0 ? "var(--color-border-strong)" : "var(--color-border-subtle)"}
                strokeWidth={1}
              />
              <text x={padL - 8} y={yFor(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" className="font-body tabular">
                {moneyK(t)}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            const yTop = yFor(Math.max(b.from, b.to));
            const yBot = b.isTotal ? padT + innerH : yFor(Math.min(b.from, b.to));
            const h = Math.max(2, yBot - yTop);
            const dim = hover != null && hover !== i;
            const down = !b.isTotal && b.value < 0;
            return (
              <g key={b.label} opacity={dim ? 0.4 : 1} className="transition-opacity duration-100">
                {/* Dotted connector carrying the running balance into the next
                    step — this is the line that makes the equation legible. */}
                {i < bars.length - 1 && (
                  <line
                    x1={x + barW}
                    y1={yFor(b.to)}
                    x2={padL + (i + 1) * slot + (slot - barW) / 2}
                    y2={yFor(b.to)}
                    stroke="var(--color-fg-subtle)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.7}
                  />
                )}
                <rect
                  x={x}
                  y={yTop}
                  width={barW}
                  height={h}
                  rx={2}
                  fill={b.isTotal ? `url(#wf-${gid})` : COLORS[b.kind]}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={x + barW / 2}
                  y={yTop - 7}
                  textAnchor="middle"
                  fontSize={b.isTotal ? 11 : 10.5}
                  className="font-body tabular font-semibold"
                  fill={b.isTotal ? "var(--color-fg)" : down ? "var(--color-danger-fg)" : "var(--color-success-fg)"}
                >
                  {/* `< 0`, never `>= 0`: JS treats -0 >= 0 as true, which
                      labelled a zero contraction "+$0" — a fall as a gain. */}
                  {b.isTotal ? preciseTotal(b.value) : `${down ? "−" : "+"}${moneyK(Math.abs(b.value))}`}
                </text>
                <text x={x + barW / 2} y={H - 16} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-subtle)" className="font-body">
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hover != null && (
          <div
            className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 shadow-lg"
            style={{
              left: `${((padL + hover * slot + slot / 2) / W) * 100}%`,
              top: `${(yFor(Math.max(bars[hover].from, bars[hover].to)) / H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 14px))",
            }}
          >
            <div className="text-[11px] font-semibold text-fg">{bars[hover].label}</div>
            <div className="tabular mt-0.5 text-[11.5px] text-fg-muted">
              {bars[hover].isTotal
                ? preciseTotal(bars[hover].value)
                : `${bars[hover].value < 0 ? "−" : "+"}${moneyK(Math.abs(bars[hover].value))}`}
            </div>
            {!bars[hover].isTotal && (
              <div className="tabular mt-0.5 text-[10.5px] text-fg-subtle">
                {preciseTotal(bars[hover].from)} → {preciseTotal(bars[hover].to)}
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- zero-baseline movement comparison ---------- */}
      {moves.length > 0 && (
        <div className="border-t border-border-subtle pt-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="eyebrow">Movements compared</span>
            <span className="caption">same scale, from zero — lengths are directly comparable</span>
          </div>
          <Diverging moves={moves} max={cmpMax} />
        </div>
      )}

      {noExpOrContra && <p className="caption">No expansion or contraction recorded in {periodLabel}.</p>}

      <p className="caption tabular border-t border-border-subtle pt-3">
        {preciseTotal(startingArr)} opening
        {moves.map((m) => ` ${m.value < 0 ? "−" : "+"} ${moneyK(Math.abs(m.value))} ${m.label.toLowerCase()}`).join("")}
        {" = "}
        <span className="font-semibold text-fg">{preciseTotal(closing)} closing</span>
      </p>
    </div>
  );
}

/** Diverging bars about a shared zero line: negatives left, positives right, one
 *  scale. Per-bar normalization would draw $7K and $124.7K the same length. */
function Diverging({ moves, max }: { moves: Step[]; max: number }) {
  return (
    <div className="flex flex-col gap-2">
      {moves.map((m) => {
        const down = m.value < 0;
        const pct = (Math.abs(m.value) / max) * 50; // 50% = half-width = one side
        return (
          <div key={m.label} className="flex items-center gap-3">
            <span className="w-[92px] shrink-0 truncate font-body text-[12px] font-semibold text-fg sm:w-[104px]">
              {m.label}
            </span>

            <div className="relative h-4 flex-1">
              {/* the zero line */}
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border-strong" aria-hidden />
              <span
                className={cn("absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px] transition-all duration-[220ms]", down ? "rounded-l-pill" : "rounded-r-pill")}
                style={{
                  width: `${Math.max(0.4, pct)}%`,
                  background: down ? "var(--color-danger)" : "var(--color-success)",
                  ...(down ? { right: "50%" } : { left: "50%" }),
                }}
              />
            </div>

            <span
              className={cn(
                "tabular w-[76px] shrink-0 text-right font-body text-[12px] font-semibold",
                down ? "text-danger-fg" : "text-success-fg",
              )}
            >
              {down ? "−" : "+"}
              {moneyK(Math.abs(m.value))}
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <span className="w-[92px] shrink-0 sm:w-[104px]" />
        <div className="relative flex-1">
          <span className="caption absolute left-1/2 -translate-x-1/2 text-[10px]">0</span>
        </div>
        <span className="w-[76px] shrink-0" />
      </div>
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "good" | "bad" | "flat" }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="caption truncate">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 font-display text-lg font-bold leading-none",
          tone === "bad" ? "text-danger-fg" : tone === "good" ? "text-success-fg" : "text-fg",
        )}
      >
        {value}
      </div>
      {sub && <div className="caption mt-1 truncate text-[10.5px]">{sub}</div>}
    </div>
  );
}
