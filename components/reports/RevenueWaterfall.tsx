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

   WHAT WAS CUT, AND WHY (the card had five representations of three numbers):
     - "Net ARR movement −$122.0K" — the heading already says "reducing ARR by
       $122.0K". Same number, twice, one wearing a metric's clothes.
     - "$1.801M → $1.679M" in the corner — the waterfall's first and last
       columns ARE that pair, labelled.
     - The equation line underneath — the chart IS the equation; writing it out
       again admits the chart didn't land.
     - ARR growth survives as the only figure nothing else carried, folded into
       the heading where it costs a clause instead of a card.
   Each was added for a real reason and none of them removed what it superseded.
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
 * The headline: the NET, and nothing else.
 *
 * It used to read "Churn exceeded new business by 46.7×, reducing ARR by
 * $122.0K (−6.8%) in Jun 2026" — four facts, three of which are already on the
 * card. The 46.7× IS the movements strip; that's the entire reason the strip
 * exists, showing the ratio as LENGTH rather than asserting it as a number. The
 * period is the card's eyebrow. So the sentence was narrating the chart to
 * someone already looking at it, which is noise dressed as insight.
 *
 * The net is the one figure nothing else carries — the chart draws opening,
 * churn, new business and closing, but never the difference between the ends.
 * So that's what the heading says, and only that.
 *
 * Still derived per period: growth is undefined without an opening balance, and
 * "fell"/"grew"/"didn't move" are three different sentences, all reachable by
 * filtering.
 */
function buildInsight(net: number, growth: number | null): string {
  const flat = Math.abs(net) < 1;
  if (flat) return "ARR didn't move";
  const pct = growth == null || Math.abs(growth * 100) < 0.05 ? "" : ` (${growth > 0 ? "+" : "−"}${Math.abs(growth * 100).toFixed(1)}%)`;
  return `ARR ${net < 0 ? "fell" : "grew"} ${moneyK(Math.abs(net))}${pct}`;
}

export function RevenueWaterfall({
  startingArr,
  expansion,
  contraction,
  churn,
  newBusiness,
  periodLabel,
  height = 190,
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
  // No "churn replacement rate" metric: it was newBusiness/churn = 5.6%, which
  // is the headline's "17.9×" inverted (1 / 17.9 = 5.6%). The same fact stated
  // twice in two notations, one of them wearing a metric's clothes. The ratio
  // reads better in the sentence, so the sentence keeps it.

  const all: Step[] = [
    { label: "Opening", value: startingArr, kind: "total", isTotal: true },
    { label: "Expansion", value: expansion, kind: "up" },
    { label: "Contraction", value: -contraction, kind: "down" },
    { label: "Churn", value: -churn, kind: "down" },
    { label: "New business", value: newBusiness, kind: "up" },
    { label: "Closing", value: closing, kind: "total", isTotal: true },
  ];
  const steps = all.filter((s) => s.isTotal || s.value !== 0);
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

  return (
    <div className="flex flex-col gap-4">
      {/* The net — the one figure the chart below can't show, since it draws
          the ends but not the distance between them. The ratio is the strip;
          the period is the eyebrow. */}
      <h3 className="h5">{buildInsight(net, growth)}</h3>

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

      {/* Three compact metrics instead of the "Movements compared" strip. The
          strip re-drew churn and new business, which the waterfall already
          shows — and these three are the figures the waterfall CAN'T show: it
          draws the ends but never the distance between them, nor the ratio. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle">
        <Stat label="Net ARR movement" value={moneyK(net)} tone={net < 0 ? "bad" : net > 0 ? "good" : "flat"} />
        <Stat
          label="ARR growth"
          value={
            growth == null
              ? "—"
              : Math.abs(growth * 100) < 0.05
                ? "0.0%"
                : `${growth > 0 ? "+" : "−"}${Math.abs(growth * 100).toFixed(1)}%`
          }
          tone={growth == null || Math.abs(growth * 100) < 0.05 ? "flat" : growth < 0 ? "bad" : "good"}
        />
        <Stat
          label="Churn replacement"
          // newBusiness/churn — undefined without churn, since "replaced 0" is
          // not a rate.
          value={churn > 0 ? `${((newBusiness / churn) * 100).toFixed(1)}%` : "—"}
          tone={churn > 0 && newBusiness / churn >= 1 ? "good" : churn > 0 ? "bad" : "flat"}
        />
      </div>

      {noExpOrContra && <p className="caption">No expansion or contraction recorded in {periodLabel}.</p>}
    </div>
  );
}



function Stat({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "flat" }) {
  return (
    <div className="bg-surface px-3 py-2">
      <div className="caption truncate">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 font-display text-base font-bold leading-none",
          tone === "bad" ? "text-danger-fg" : tone === "good" ? "text-success-fg" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}
