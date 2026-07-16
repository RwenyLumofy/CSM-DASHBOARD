"use client";

/* =========================================================================
   ARR waterfall — opening → movement → closing.

   Replaces the old "bridge", which drew every bar from x=0 at a shared scale.
   That made Expansion/Contraction/Churn (tens of thousands) invisible slivers
   next to Starting/Ending ARR (over a million), and — the real problem — it
   didn't show a bridge at all: you couldn't see that the deltas connect the
   opening balance to the closing one. Here each movement bar FLOATS between
   the running balance before and after it, which is the whole point of the
   form: the eye follows the steps down from opening to closing.

   Two subtotals, deliberately distinct:
     Retained  = start + expansion − contraction − churn   (the NRR numerator)
     Closing   = retained + new business                   (the book's real size)
   New business is charted but sits AFTER the Retained subtotal so it can never
   be mistaken for retention — the same reason computeRetention excludes it.
   ========================================================================= */

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";

type Kind = "total" | "up" | "down";

interface Step {
  label: string;
  value: number; // signed for movement steps; absolute for totals
  kind: Kind;
  /** Totals are measured from zero; movements float on the running balance. */
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

  const steps: Step[] = [
    { label: "Opening", value: startingArr, kind: "total", isTotal: true },
    { label: "Expansion", value: expansion, kind: "up" },
    { label: "Contraction", value: -contraction, kind: "down" },
    { label: "Churn", value: -churn, kind: "down" },
    { label: "Retained", value: retained, kind: "total", isTotal: true },
    { label: "New business", value: newBusiness, kind: "up" },
    { label: "Closing", value: closing, kind: "total", isTotal: true },
  ];

  // Running balance → each bar's [from, to] in value space.
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
  const padL = 52;
  const padR = 12;
  const padT = 16;
  const padB = 42;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1);
  const top = niceCeil(maxVal);
  const yFor = (v: number) => padT + innerH - (v / top) * innerH;
  const slot = innerW / bars.length;
  const barW = Math.min(64, slot * 0.56);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);
  const money = (v: number) => formatCurrency(v, currency, { compact: true });

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="ARR waterfall from opening to closing balance" className="overflow-hidden">
        <defs>
          {/* Totals get a subtle vertical sheen so they read as "pillars" against
              the flat movement bars — cheap hierarchy without another colour. */}
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
              stroke={i === 0 ? "var(--color-border)" : "var(--color-border-subtle)"}
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
          const yBot = yFor(Math.min(b.from, b.to));
          const h = Math.max(b.value === 0 ? 0 : 2, yBot - yTop);
          const dim = hover != null && hover !== i;
          return (
            <g key={b.label} opacity={dim ? 0.42 : 1} className="transition-opacity duration-100">
              {/* connector into the next bar */}
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
              {/* value label above each bar */}
              <text
                x={x + barW / 2}
                y={yTop - 6}
                textAnchor="middle"
                fontSize={10.5}
                className="font-body tabular font-semibold"
                fill={b.isTotal ? "var(--color-fg)" : b.kind === "up" ? "var(--color-success-fg)" : "var(--color-danger-fg)"}
              >
                {b.isTotal ? money(b.value) : `${b.value >= 0 ? "+" : "−"}${money(Math.abs(b.value))}`}
              </text>
              <text
                x={x + barW / 2}
                y={H - 24}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--color-fg-subtle)"
                className="font-body"
              >
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
            transform: "translate(-50%, calc(-100% - 10px))",
          }}
        >
          <div className="text-[11px] font-semibold text-fg">{bars[hover].label}</div>
          <div className="tabular mt-0.5 text-[11.5px] text-fg-muted">
            {bars[hover].isTotal
              ? formatCurrency(bars[hover].value, currency)
              : `${bars[hover].value >= 0 ? "+" : "−"}${formatCurrency(Math.abs(bars[hover].value), currency)}`}
          </div>
          {!bars[hover].isTotal && (
            <div className="tabular mt-0.5 text-[10.5px] text-fg-subtle">
              {money(bars[hover].from)} → {money(bars[hover].to)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10;
  return step * pow;
}
