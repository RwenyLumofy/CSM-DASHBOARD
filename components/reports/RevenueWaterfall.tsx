"use client";

/* =========================================================================
   ARR waterfall — opening → movement → closing.

   THE AXIS STARTS AT ZERO. That's the rule for bars: a bar's length IS its
   value, and truncating the axis breaks it. A zoomed axis drew Opening ($1.80M)
   and Closing ($1.68M) at near-identical height when one is 7% smaller — one
   distortion traded for another.

   But zero-based has the failure that caused the zoom in the first place: this
   book's movements are ~7% of its balance, so a $124.7K churn step is a 6%-tall
   sliver between two towers, and the thing the chart exists to show is the thing
   you can't see.

   Both are the same problem: a $1.8M balance and a $124K movement do not belong
   on one axis. So they get two.

     TOP    — balances, zero-based, honest lengths. Opening vs Closing is a fair
              comparison, and the steps float where a waterfall puts them.
     BOTTOM — the same movements on their OWN zero-based scale, so churn vs new
              business is also a fair comparison.

   Neither chart lies about length, because neither mixes the two magnitudes.
   The strip isn't a duplicate: it answers "how do the movements compare to each
   other", which the top physically cannot at a 14:1 ratio.

   ZERO MOVEMENTS ARE DROPPED from both — a "$0 expansion" column spent a
   seventh of the width saying nothing. Named in a line underneath instead.

   Two subtotals, deliberately distinct:
     Retained = start + expansion − contraction − churn   (the NRR numerator)
     Closing  = retained + new business                   (the book's real size)
   New business sits AFTER Retained so it can't be mistaken for retention — the
   same reason computeRetention excludes it.
   ========================================================================= */

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

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
  contraction,
  churn,
  newBusiness,
  currency,
  height = 240,
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
  const zeroed = all.filter((s) => !s.isTotal && s.value === 0).map((s) => s.label);
  const steps = all.filter((s) => s.isTotal || s.value !== 0);
  const moves = steps.filter((s) => !s.isTotal);

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
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Zero-based, rounded up to a clean tick. `|| 1` guards an all-zero book:
  // Math.max of an empty set and a zero balance both land here, and a top of 0
  // would divide by zero into NaN geometry.
  const top = niceMax(Math.max(...bars.map((b) => Math.max(b.from, b.to, b.value)), 0) || 1);
  const yFor = (v: number) => padT + innerH - (v / top) * innerH;
  const slot = innerW / bars.length;
  const barW = Math.min(58, slot * 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
  const money = (v: number) => formatCurrency(v, currency, { compact: true });

  // The strip's scale: the largest MOVEMENT, not the balance.
  const moveMax = Math.max(...moves.map((m) => Math.abs(m.value)), 1);

  return (
    <div className="flex flex-col gap-4">
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

          {bars.map((b, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            const yTop = yFor(Math.max(b.from, b.to));
            const yBot = b.isTotal ? padT + innerH : yFor(Math.min(b.from, b.to));
            const h = Math.max(2, yBot - yTop);
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
                  rx={2}
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
                  {/* NOT `value >= 0`: JavaScript's -0 >= 0 is true, so a zero
                      contraction rendered "+$0" — a fall labelled as a gain. */}
                  {b.isTotal ? money(b.value) : `${down ? "−" : "+"}${money(Math.abs(b.value))}`}
                </text>
                <text x={x + barW / 2} y={H - 22} textAnchor="middle" fontSize={10.5} fill="var(--color-fg-subtle)" className="font-body">
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
      </div>

      {/* The movements, magnified. The chart above is zero-based so its bars are
          honest — which is exactly what makes a 7%-of-balance step nearly
          invisible. Same numbers, own zero-based scale, comparable to each other
          rather than to a balance 14x their size. */}
      {moves.length > 0 && (
        <div className="border-t border-border-subtle pt-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="eyebrow">What moved it</span>
            <span className="caption">the steps above, magnified to their own scale</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {moves.map((m) => {
              const down = m.value < 0;
              return (
                <li key={m.label} className="flex items-center gap-3">
                  <span className="w-[92px] shrink-0 font-body text-[12px] font-semibold text-fg">{m.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-bg-muted">
                    <div
                      className="h-full rounded-pill transition-all duration-[220ms]"
                      style={{
                        width: `${Math.max(1.5, (Math.abs(m.value) / moveMax) * 100)}%`,
                        background: down ? "var(--color-danger)" : "var(--color-success)",
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "tabular w-20 shrink-0 text-right font-body text-[12px] font-semibold",
                      down ? "text-danger-fg" : "text-success-fg",
                    )}
                  >
                    {down ? "−" : "+"}
                    {money(Math.abs(m.value))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {zeroed.length > 0 && (
        <p className="caption -mt-1">No {zeroed.map((z) => z.toLowerCase()).join(" or ")} this period.</p>
      )}
    </div>
  );
}
