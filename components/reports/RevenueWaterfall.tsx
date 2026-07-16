"use client";

/* =========================================================================
   ARR waterfall — opening → movement → closing.

   WHY THE Y-AXIS DOESN'T START AT ZERO.
   It used to, and the chart was unreadable: this book's movements are ~7% of
   its balance ($124.7K of churn against $1.8M), so on a $0–2M axis the entire
   story was a 6%-tall sliver floating between two near-identical blue towers.
   The one thing a waterfall exists to show — the steps from opening to closing
   — was the one thing you couldn't see. Worse, the churn bar sitting high on
   the chart READ as a positive value, because "high" means "big" before it
   means "at this balance".

   So the axis is zoomed to the balance band, which is standard practice for a
   financial waterfall and is why they work in board decks. The trade is real
   and gets stated on the chart: bar HEIGHTS are no longer proportional to
   value (the opening and closing columns look similar because they ARE similar
   — $1.80M vs $1.68M), so the axis floor is labelled and captioned rather than
   left for someone to misread. Truncating an axis silently is a lie; truncating
   it with the floor on screen is a zoom.

   ZERO STEPS ARE DROPPED. A "$0 expansion" column consumed a seventh of the
   width to say nothing, twice over. They're reported underneath instead.

   Two subtotals, deliberately distinct:
     Retained = start + expansion − contraction − churn   (the NRR numerator)
     Closing  = retained + new business                   (the book's real size)
   New business sits AFTER Retained so it can never be mistaken for retention —
   the same reason computeRetention excludes it.
   ========================================================================= */

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Kind = "total" | "up" | "down";

interface Step {
  label: string;
  value: number;
  kind: Kind;
  isTotal?: boolean;
}

const COLORS: Record<Kind, string> = {
  total: "var(--color-sirius)",
  up: "var(--color-success)",
  down: "var(--color-danger)",
};

export function RevenueWaterfall({
  startingArr,
  expansion,
  contraction,
  churn,
  newBusiness,
  currency,
  height = 260,
}: {
  startingArr: number;
  expansion: number;
  contraction: number;
  churn: number;
  newBusiness: number;
  currency: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const retained = startingArr + expansion - contraction - churn;
  const closing = retained + newBusiness;

  const all: Step[] = [
    { label: "Opening", value: startingArr, kind: "total", isTotal: true },
    { label: "Expansion", value: expansion, kind: "up" },
    { label: "Contraction", value: -contraction, kind: "down" },
    { label: "Churn", value: -churn, kind: "down" },
    { label: "Retained", value: retained, kind: "total", isTotal: true },
    { label: "New business", value: newBusiness, kind: "up" },
    { label: "Closing", value: closing, kind: "total", isTotal: true },
  ];
  // A movement of exactly zero earns no column — it spent a seventh of the
  // width saying nothing. Named below the chart instead.
  const zeroed = all.filter((s) => !s.isTotal && s.value === 0).map((s) => s.label);
  const steps = all.filter((s) => s.isTotal || s.value !== 0);

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
  const padL = 56;
  const padR = 12;
  const padT = 22;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // The BALANCE levels the chart actually steps through — a total's `from: 0` is
  // a drawing sentinel (its bar is anchored to the floor), not a balance the
  // book ever held, so it must not drag the axis minimum to zero and undo the
  // zoom. Two bugs live here and they pull opposite ways: include that 0 and
  // there's no zoom at all; filter to `v > 0` and an all-zero book leaves the
  // array EMPTY, where Math.max() returns -Infinity and every coordinate becomes
  // NaN. Take each bar's real levels, then guard the empty case explicitly.
  // NO `v > 0` filter: zero is a real balance. A book that churns to nothing
  // genuinely ends at 0, and dropping that level pinned the axis floor near the
  // opening balance while the churn bar plunged far below it — a step drawn
  // 7,692% of the chart's height, off-screen.
  const levels = bars.flatMap((b) => (b.isTotal ? [b.value] : [b.from, b.to])).filter((v) => Number.isFinite(v));
  const rawMin = Math.min(...levels);
  const rawMax = Math.max(...levels);
  const moved = rawMax > rawMin;
  const span = Math.max(rawMax - rawMin, 1);
  // Zoom ONLY when the balance actually moved. A flat period has no band to
  // zoom into — magnifying nothing produced a 22K-wide axis around three
  // identical bars, which reads as precision that isn't there. And a book that
  // reached zero anchors at zero, so the full fall is visible.
  const lo = moved ? Math.max(0, rawMin - span * 0.45) : 0;
  const hi = moved ? rawMax + span * 0.2 : Math.max(rawMax * 1.15, 1);
  const scale = hi - lo || 1;
  const truncated = lo > 0;

  const yFor = (v: number) => padT + innerH - ((v - lo) / scale) * innerH;
  const slot = innerW / bars.length;
  const barW = Math.min(58, slot * 0.5);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + scale * f);
  const money = (v: number) => formatCurrency(v, currency, { compact: true });

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="ARR waterfall from opening to closing balance" className="overflow-hidden">
        <defs>
          <linearGradient id={`wf-total-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-sirius)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-sirius)" stopOpacity="0.72" />
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
              {money(t)}
            </text>
          </g>
        ))}

        {/* The axis break — says outright that the floor isn't zero, right where
            someone would otherwise assume it is. */}
        {truncated && (
          <text x={padL - 8} y={yFor(lo) + 15} textAnchor="end" fontSize={9} fill="var(--color-fg-subtle)" className="font-body">
            ⌇
          </text>
        )}

        {bars.map((b, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const yTop = yFor(Math.max(b.from, b.to));
          const yBot = b.isTotal ? padT + innerH : yFor(Math.min(b.from, b.to));
          const h = Math.max(3, yBot - yTop);
          const dim = hover != null && hover !== i;
          const down = !b.isTotal && b.value < 0;
          return (
            <g key={b.label} opacity={dim ? 0.42 : 1} className="transition-opacity duration-100">
              {i < bars.length - 1 && (
                <line
                  x1={x}
                  y1={yFor(b.to)}
                  x2={padL + (i + 1) * slot + (slot + barW) / 2}
                  y2={yFor(b.to)}
                  stroke="var(--color-border-strong)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
              <rect
                x={x}
                y={yTop}
                width={barW}
                height={h}
                rx={3}
                fill={b.isTotal ? `url(#wf-total-${gid})` : COLORS[b.kind]}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              />
              <text
                x={x + barW / 2}
                y={yTop - 7}
                textAnchor="middle"
                fontSize={10.5}
                className="font-body tabular font-semibold"
                fill={b.isTotal ? "var(--color-fg)" : down ? "var(--color-danger-fg)" : "var(--color-success-fg)"}
              >
                {/* NOT `value >= 0 ? "+" : "−"`: JavaScript's -0 >= 0 is true, so
                    a zero contraction rendered "+$0" — a downward step labelled
                    as a gain. */}
                {b.isTotal ? money(b.value) : `${down ? "−" : "+"}${money(Math.abs(b.value))}`}
              </text>
              <text x={x + barW / 2} y={H - 24} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-subtle)" className="font-body">
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
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <div className="text-[11px] font-semibold text-fg">{bars[hover].label}</div>
          <div className="tabular mt-0.5 text-[11.5px] text-fg-muted">
            {bars[hover].isTotal
              ? formatCurrency(bars[hover].value, currency)
              : `${bars[hover].value < 0 ? "−" : "+"}${formatCurrency(Math.abs(bars[hover].value), currency)}`}
          </div>
          {!bars[hover].isTotal && (
            <div className="tabular mt-0.5 text-[10.5px] text-fg-subtle">
              {money(bars[hover].from)} → {money(bars[hover].to)}
            </div>
          )}
        </div>
      )}

      <p className="caption mt-1">
        {truncated && (
          <>
            Axis starts at <span className="tabular font-semibold text-fg">{money(lo)}</span>, not zero — movements here
            are a few percent of the balance and vanish on a full scale. Bar heights show the <em>steps</em>, not the
            totals.
          </>
        )}
        {zeroed.length > 0 && (
          <>
            {truncated && " "}
            No {zeroed.map((z) => z.toLowerCase()).join(" or ")} this period.
          </>
        )}
      </p>
    </div>
  );
}
