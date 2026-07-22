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

   3. THE WATERFALL IS THE PICTURE; THE TILES ARE THE NUMBERS. The bridge is
      zero-based, so heights are honest — which is why a $124.7K step against a
      $1.797M balance is a 6% sliver, and why $7.0K of new business is a line,
      not a bar. That legibility ceiling is real and unfixable: a scale fair to
      $1.8M cannot also show $7K. So the exact per-movement figures live in the
      TILE STRIP beneath — one tile per category, each carrying its ARR and its
      account count, with zero movements shown ($0), not hidden. Chart for
      shape, tiles for precision + counts + drill-down: the pairing Vitally
      offers as a graph and a table of the same movements. The tiles carry the
      three things the bars can't — exact dollars, how many accounts, and the
      categories that didn't fire.

   Every figure is derived from the values passed in, so this holds for any
   period the filter produces — no hardcoded quarter, no assumed sign.

   WHAT THE STRIP IS NOT. It is no longer net movement / growth / a ratio —
   those restated the heading (net, growth) or the bars (the ratio), the card's
   old habit of showing three numbers five ways. The heading owns the net; the
   tiles own the decomposition. Nothing appears in both.
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

export function RevenueWaterfall({
  startingArr,
  expansion,
  expansionCount,
  contraction,
  contractionCount,
  churn,
  churnCount,
  newBusiness,
  newBusinessCount,
  height = 190,
}: {
  startingArr: number;
  expansion: number;
  /** Distinct accounts that expanded in-period. */
  expansionCount: number;
  contraction: number;
  /** Distinct accounts that contracted in-period. */
  contractionCount: number;
  churn: number;
  /** Accounts behind the churn bar. Period-scoped, one row per churn event. */
  churnCount: number;
  newBusiness: number;
  /** Distinct accounts that landed as new business in-period. */
  newBusinessCount: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const closing = startingArr + expansion - contraction - churn + newBusiness;
  // Counts ride on the movement tiles below (Vitally's "Churn 3", "Base 89").
  // They're subordinate to the ARR — value is the hero, the count annotates —
  // and together they carry concentration for free: 9 accounts at −$124.7K
  // reads differently from 1 account at −$124.7K, which no single number shows.
  // Opening and Closing carry NO count: they're balances (stocks), and their
  // ledger counts (80/74) reopen the ghost-account gap the page banner already
  // owns. Counts belong on the flows, not the stocks.

  const all: Step[] = [
    { label: "Opening", value: startingArr, kind: "total", isTotal: true },
    { label: "Expansion", value: expansion, kind: "up" },
    { label: "Contraction", value: -contraction, kind: "down" },
    { label: "Churn", value: -churn, kind: "down" },
    { label: "New business", value: newBusiness, kind: "up" },
    { label: "Closing", value: closing, kind: "total", isTotal: true },
  ];
  const steps = all.filter((s) => s.isTotal || s.value !== 0);

  // The tile strip: every category, in waterfall order, movements first. Unlike
  // the bars (which hide zero-height steps), the tiles SHOW zeros — "Expansion
  // 0 · $0" is a fact worth stating, and it retires the old "No expansion or
  // contraction recorded" caption by making the same point in the grid itself.
  const tiles: TileData[] = [
    { label: "Opening", value: preciseTotal(startingArr), tone: "total" },
    { label: "Churn", count: churnCount, value: churn > 0 ? `−${moneyK(churn)}` : "$0", tone: churn > 0 ? "loss" : "zero" },
    { label: "Contraction", count: contractionCount, value: contraction > 0 ? `−${moneyK(contraction)}` : "$0", tone: contraction > 0 ? "loss" : "zero" },
    { label: "Expansion", count: expansionCount, value: expansion > 0 ? `+${moneyK(expansion)}` : "$0", tone: expansion > 0 ? "gain" : "zero" },
    // "New biz", not "New business": the only label that overflows a 6-col
    // tile. Vitally shortens it the same way; the waterfall bar keeps the full
    // word, where it has room.
    { label: "New biz", count: newBusinessCount, value: newBusiness > 0 ? `+${moneyK(newBusiness)}` : "$0", tone: newBusiness > 0 ? "gain" : "zero" },
    { label: "Closing", value: preciseTotal(closing), tone: "total" },
  ];

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

  return (
    <div className="flex flex-col gap-4">
      {/* No header here: the card's eyebrow is the title, and the generated
          takeaway lives behind the "i" on that title line (see TakeawayInfo in
          the page). This component is the chart + tiles only. */}

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

      {/* The decomposition, as tiles: one per movement category, each with its
          ARR and — for the flows — its account count. This is what the bridge
          can't render: exact dollars, how many accounts, and the categories
          that didn't fire. Value is the hero, the count annotates. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </div>
    </div>
  );
}

interface TileData {
  label: string;
  /** Omitted on Opening/Closing — those are balances, not flows. */
  count?: number;
  value: string;
  tone: "total" | "loss" | "gain" | "zero";
}

/** One movement tile. The count sits small beside the label (Vitally's "Base
 *  89"); the ARR is the number the eye lands on. */
function Tile({ label, count, value, tone }: TileData) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="caption flex items-baseline gap-1.5">
        <span className="truncate">{label}</span>
        {count != null && <span className="tabular text-fg-subtle">{count}</span>}
      </div>
      <div
        className={cn(
          "tabular mt-1 font-display text-[15px] font-bold leading-none",
          tone === "loss" ? "text-danger-fg" : tone === "gain" ? "text-success-fg" : tone === "zero" ? "text-fg-subtle" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}
