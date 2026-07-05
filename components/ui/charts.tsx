"use client";

/* Lightweight, dependency-free SVG charts for the Usage tab — now interactive:
   hover reveals a cursor-tracked tooltip and highlights the focused datum. All
   colors come from design-system CSS vars so they theme automatically.
   Responsive via a fixed viewBox + width:100%. */

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const AXIS = "var(--color-border)";
const GRID = "var(--color-border-subtle)";
const LABEL = "var(--color-fg-subtle)";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function shortMonth(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[m] ?? ym.slice(5);
}
function longMonth(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[m] ?? ""} ${ym.slice(0, 4)}`;
}
const fmt = (n: number) => n.toLocaleString();

/** Floating tooltip positioned by percentage within a `position:relative` host.
 *  Anchored above and centered on its point; never intercepts the mouse. */
function Tooltip({ left, top, children }: { left: number; top: number; children: ReactNode }) {
  const clampedLeft = Math.max(6, Math.min(94, left));
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[120px] whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body shadow-lg"
      style={{ left: `${clampedLeft}%`, top: `${top}%`, transform: "translate(-50%, calc(-100% - 8px))" }}
    >
      {children}
    </div>
  );
}
function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] leading-tight text-fg-muted">
      {color && <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="text-fg-muted">{label}</span>
      <span className="ml-auto pl-3 font-semibold tabular text-fg">{value}</span>
    </span>
  );
}

export interface LineSeries {
  label: string;
  color: string;
  points: { month: string; value: number }[];
}

/** Multi-series line chart with a hover cursor + tooltip and an area gradient
 *  under a single series. `months` is really an ordered list of x-axis keys —
 *  monthly by default (hence the name + the shortMonth/longMonth formatters),
 *  but any granularity works: pass `formatShort`/`formatLong` to label daily,
 *  weekly, etc. keys. Callers that pass nothing keep the original month
 *  behavior untouched. */
export function LineChart({
  series,
  months,
  height = 200,
  formatShort = shortMonth,
  formatLong = longMonth,
}: {
  series: LineSeries[];
  months: string[];
  height?: number;
  formatShort?: (key: string) => string;
  formatLong?: (key: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = series.flatMap((s) => s.points.map((p) => p.value));
  const max = niceMax(Math.max(1, ...allVals));
  const stepX = months.length > 1 ? innerW / (months.length - 1) : 0;
  const xFor = (i: number) => padL + i * stepX;
  const yFor = (v: number) => padT + innerH - (v / max) * innerH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const band = months.length > 1 ? innerW / (months.length - 1) : innerW;
  // Thin x-labels to ~8 max so they stay legible at any point count (a 30-day
  // period, a 90-day quarter, etc.). For the 12-month default this is step 2 —
  // exactly the labels the old `i % 2 === 0` rule produced.
  const labelStep = Math.max(1, Math.ceil(months.length / 8));

  const valueAt = (s: LineSeries, i: number) => s.points.find((p) => p.month === months[i])?.value ?? 0;
  const single = series.length === 1;
  const gradId = `lc-grad-${series[0]?.label?.replace(/\W/g, "") ?? "x"}`;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" className="overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]?.color ?? AXIS} stopOpacity="0.18" />
            <stop offset="100%" stopColor={series[0]?.color ?? AXIS} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid + y labels */}
        {yTicks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill={LABEL} className="font-body tabular">{t}</text>
            </g>
          );
        })}
        {/* x labels */}
        {months.map((ym, i) =>
          i % labelStep === 0 ? (
            <text key={ym} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={LABEL} className="font-body">{formatShort(ym)}</text>
          ) : null,
        )}
        {/* area fill (single-series only) */}
        {single && series[0] && (
          <path
            d={`M${xFor(0)},${yFor(valueAt(series[0], 0))} ` +
              months.map((_, i) => `L${xFor(i)},${yFor(valueAt(series[0], i))}`).join(" ") +
              ` L${xFor(months.length - 1)},${padT + innerH} L${xFor(0)},${padT + innerH} Z`}
            fill={`url(#${gradId})`}
          />
        )}
        {/* series lines */}
        {series.map((s) => (
          <path
            key={s.label}
            d={months.map((_, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(valueAt(s, i)).toFixed(1)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          />
        ))}
        {/* hover guide + focused dots */}
        {hover != null && (
          <line x1={xFor(hover)} y1={padT} x2={xFor(hover)} y2={padT + innerH} stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" />
        )}
        {series.map((s) =>
          months.map((_, i) => (
            <circle key={`${s.label}-${i}`} cx={xFor(i)} cy={yFor(valueAt(s, i))} r={hover === i ? 4 : 2.4} fill={s.color}
              stroke="var(--color-surface)" strokeWidth={hover === i ? 1.5 : 0} className="transition-all duration-100" />
          )),
        )}
        {/* invisible hover bands */}
        {months.map((_, i) => (
          <rect key={`hit-${i}`} x={xFor(i) - band / 2} y={padT} width={band} height={innerH} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "crosshair" }} />
        ))}
      </svg>
      {hover != null && (
        <Tooltip left={(xFor(hover) / W) * 100} top={(Math.min(...series.map((s) => yFor(valueAt(s, hover)))) / H) * 100}>
          <div className="mb-1 text-[11px] font-semibold text-fg">{formatLong(months[hover])}</div>
          <div className="flex flex-col gap-0.5">
            {series.map((s) => <TipRow key={s.label} color={s.color} label={s.label} value={fmt(valueAt(s, hover))} />)}
          </div>
        </Tooltip>
      )}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Donut with a centered caption; hovering a slice thickens it and reveals a
 *  tooltip with the value + share. Zero-value segments are dropped. */
export function Donut({
  segments, size = 132, centerLabel, centerSub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number; centerLabel?: string; centerSub?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((a, s) => a + s.value, 0);
  const r = size / 2;
  const stroke = size * 0.16;
  const rad = r - stroke / 2;
  const circ = 2 * Math.PI * rad;
  let offset = 0;
  const hoveredSeg = hover != null ? active[hover] : null;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={r} cy={r} r={rad} fill="none" stroke={GRID} strokeWidth={stroke} />
          {total > 0 && active.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * circ;
            const el = (
              <circle key={s.label} cx={r} cy={r} r={rad} fill="none" stroke={s.color}
                strokeWidth={hover === i ? stroke * 1.18 : stroke}
                strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${r} ${r})`} strokeLinecap="butt"
                opacity={hover == null || hover === i ? 1 : 0.45}
                className="transition-all duration-150"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }} />
            );
            offset += dash;
            return el;
          })}
          {centerLabel && (
            <text x={r} y={r - 2} textAnchor="middle" fontSize={size * 0.2} fill="var(--color-fg)" className="font-display font-bold tabular">
              {hoveredSeg ? fmt(hoveredSeg.value) : centerLabel}
            </text>
          )}
          {centerSub && (
            <text x={r} y={r + size * 0.13} textAnchor="middle" fontSize={size * 0.088} fill={LABEL} className="font-body">
              {hoveredSeg ? `${Math.round((hoveredSeg.value / total) * 100)}% ${hoveredSeg.label}` : centerSub}
            </text>
          )}
        </svg>
      </div>
      {active.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {active.map((s, i) => (
            <button key={s.label} type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className={cn("flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left font-body text-[12px] transition-colors",
                hover === i ? "bg-bg-muted" : "")}>
              <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
              <span className="tabular font-semibold text-fg">{fmt(s.value)}</span>
              <span className="text-fg-muted">{s.label}</span>
              {total > 0 && <span className="tabular text-fg-subtle">· {Math.round((s.value / total) * 100)}%</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Semicircular gauge for a 0–100(+)% value. */
export function Gauge({ value, label, color = "var(--color-sirius)" }: { value: number; label?: string; color?: string }) {
  const W = 160, H = 92, cx = W / 2, cy = 84, r = 66;
  const frac = Math.max(0, Math.min(1, value / 100));
  const a = Math.PI * (1 - frac);
  const x = cx + r * Math.cos(a);
  const y = cy - r * Math.sin(a);
  const arc = (f0: number, f1: number) => {
    const a0 = Math.PI * (1 - f0), a1 = Math.PI * (1 - f1);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={arc(0, 1)} fill="none" stroke={GRID} strokeWidth={12} strokeLinecap="round" />
      <path d={arc(0, frac)} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" className="transition-all duration-500" />
      <circle cx={x} cy={y} r={5} fill={color} />
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize={22} fill="var(--color-fg)" className="font-display font-bold tabular">{Math.round(value)}%</text>
      {label && <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fill={LABEL} className="font-body">{label}</text>}
    </svg>
  );
}

/** Grouped vertical bars with per-bar hover tooltip + dimming. */
export function GroupedBars({
  groups, series, height = 180,
}: {
  groups: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
  height?: number;
}) {
  const [hover, setHover] = useState<{ g: number; s: number } | null>(null);
  const W = 720, H = height, padL = 40, padR = 12, padT = 12, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = niceMax(Math.max(1, ...groups.flatMap((g) => g.values)));
  const groupW = innerW / Math.max(1, groups.length);
  const barGap = 6;
  const barW = Math.min(26, (groupW - barGap * (series.length + 1)) / series.length);
  const yFor = (v: number) => padT + innerH - (v / max) * innerH;
  const yTicks = [0, 0.5, 1].map((f) => Math.round(max * f));

  const hoveredX = hover ? padL + hover.g * groupW + (groupW - (series.length * barW + (series.length - 1) * barGap)) / 2 + hover.s * (barW + barGap) + barW / 2 : 0;
  const hoveredY = hover ? yFor(groups[hover.g].values[hover.s]) : 0;

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={padL - 6} y={yFor(t) + 3} textAnchor="end" fontSize={10} fill={LABEL} className="font-body tabular">{t}</text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const gx = padL + gi * groupW;
          const clusterW = series.length * barW + (series.length - 1) * barGap;
          const startX = gx + (groupW - clusterW) / 2;
          return (
            <g key={g.label}>
              {g.values.map((v, si) => {
                const bx = startX + si * (barW + barGap);
                const by = yFor(v);
                const dim = hover != null && !(hover.g === gi && hover.s === si);
                return (
                  <rect key={si} x={bx} y={by} width={barW} height={padT + innerH - by} rx={3}
                    fill={series[si]?.color ?? AXIS} opacity={dim ? 0.4 : 1}
                    className="transition-opacity duration-100"
                    onMouseEnter={() => setHover({ g: gi, s: si })} onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }} />
                );
              })}
              <text x={gx + groupW / 2} y={H - 10} textAnchor="middle" fontSize={10.5} fill={LABEL} className="font-body">{g.label}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip left={(hoveredX / W) * 100} top={(hoveredY / H) * 100}>
          <div className="mb-0.5 text-[11px] font-semibold text-fg">{groups[hover.g].label}</div>
          <TipRow color={series[hover.s]?.color} label={series[hover.s]?.label ?? ""} value={fmt(groups[hover.g].values[hover.s])} />
        </Tooltip>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.label} className={cn("flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted")}>
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
