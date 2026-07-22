import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RiskRow } from "@/lib/metrics/movement";
import { ProvisionalTag } from "@/components/reports/ProvisionalTag";
import { Chip, type ChipTone } from "@/components/reports/Chip";
import { DateTag } from "@/components/reports/DateTag";
import { cn } from "@/lib/cn";

/* =========================================================================
   Forward outlook — the page's one forward-looking section, on its own clock.

   Replaces the full "Renewals at risk" table (14 rows, numeric risk scores,
   per-row bars — a deep-dive tool in an executive summary). Two rules from the
   brief hold: PLAIN LABELS not scores ("Needs attention", not "43"), and the
   TOP THREE material accounts only, with "view all" carrying the rest.

   Design direction A adds two things over the plain list:
     - AN EXPOSURE BAR. "$204K of $331.4K" is a proportion, so it's drawn as
       one: the renewing pipeline split into critical / needs-attention /
       on-track. The reader sees "most of the book is at risk" as a shape.
     - AN EXPLICIT ANCHOR. Everything above this section is the closed period;
       this is "as of today · through {horizon}". Stating the clock stops the
       forward numbers from being read against the historical ones.
   ========================================================================= */

const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

/** Plain label from the risk band — never the raw score. Tones come from the
 *  shared page scale, so these read identically to the concentration chips.
 *  "Data needed" when the account carries no observable signal at all. */
function attention(row: RiskRow): { label: string; tone: ChipTone } {
  const hasSignal = row.reasons.length > 0 || row.usage != null;
  if (!hasSignal) return { label: "Data needed", tone: "nodata" };
  if (row.risk >= 60) return { label: "Critical attention", tone: "danger" };
  if (row.risk >= 30) return { label: "Needs attention", tone: "warning" };
  return { label: "Monitor", tone: "neutral" };
}

/** Row accent spine — same tone as the chip, so the row scans by colour and
 *  reads by label (status is never colour-only). */
const SPINE: Record<ChipTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-sirius",
  neutral: "bg-border-strong",
  muted: "bg-border-subtle",
  nodata: "bg-border-strong",
};

export function ForwardOutlook({
  rows,
  criticalArr,
  attentionArr,
  upcomingArr,
  upcomingCount,
  horizonLabel,
  provisional,
  qs,
}: {
  /** The top three attention renewals, pre-ranked by ARR. */
  rows: RiskRow[];
  /** ARR on renewals in the highest risk band — the red segment of the bar. */
  criticalArr: number;
  /** All renewal ARR needing attention (critical + needs). */
  attentionArr: number;
  /** All renewal ARR in the window. */
  upcomingArr: number;
  upcomingCount: number;
  /** e.g. "through 17 Oct" — the far end of the 90-day window. */
  horizonLabel: string;
  provisional: boolean;
  qs: string;
}) {
  const allHref = qs ? `/clients?${qs}` : "/clients";

  if (upcomingCount === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="caption">No renewals fall in the next 90 days.</p>
        <p className="caption mt-1 text-fg-subtle">As of today · through {horizonLabel}</p>
      </div>
    );
  }

  const share = upcomingArr > 0 ? (attentionArr / upcomingArr) * 100 : 0;
  const needsArr = Math.max(0, attentionArr - criticalArr);
  const onTrackArr = Math.max(0, upcomingArr - attentionArr);
  const w = (v: number) => (upcomingArr > 0 ? (v / upcomingArr) * 100 : 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      {/* Header: the total renewing pipeline, the attention callout, and the
          explicit anchor. */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="caption">Renewing next 90 days</span>
        <DateTag>as of today · through {horizonLabel}</DateTag>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="tabular font-display text-2xl font-bold leading-none tracking-tight text-fg">
          {money(upcomingArr)}
        </span>
        {provisional && <ProvisionalTag />}
        <span className="tabular font-body text-[12.5px] font-semibold text-warning-fg">
          {money(attentionArr)} needs attention · {share.toFixed(1)}%
        </span>
      </div>

      {/* Exposure bar: the pipeline split, so the proportion is a shape. */}
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-bg-muted" role="img" aria-label={`${share.toFixed(0)}% of renewing ARR needs attention`}>
        {criticalArr > 0 && <div className="bg-danger" style={{ width: `${w(criticalArr)}%` }} />}
        {needsArr > 0 && <div className="bg-warning" style={{ width: `${w(needsArr)}%` }} />}
        {onTrackArr > 0 && <div className="bg-success/50" style={{ width: `${w(onTrackArr)}%` }} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <LegendDot className="bg-danger" label="Critical" pct={w(criticalArr)} />
        <LegendDot className="bg-warning" label="Needs attention" pct={w(needsArr)} />
        <LegendDot className="bg-success/50" label="On track" pct={w(onTrackArr)} />
      </div>

      {rows.length > 0 ? (
        <ul className="mt-4 flex flex-col">
          {rows.map((row) => {
            const a = attention(row);
            const signal = row.reasons.length ? row.reasons.slice(0, 2).join(" · ") : "No usage or health signal recorded";
            const soon = row.daysToRenewal > 0 && row.daysToRenewal <= 30;
            return (
              <li key={row.client.id} className="flex items-center gap-3 border-t border-border-subtle py-2.5">
                <div className={cn("h-9 w-1 shrink-0 rounded-full", SPINE[a.tone])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/clients/${row.client.id}`}
                    dir="auto"
                    className="block truncate font-body text-[13px] font-semibold text-fg hover:text-sirius"
                  >
                    {row.client.name}
                  </Link>
                  <p className="caption truncate" dir="auto">
                    {signal}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular font-body text-[13.5px] font-semibold text-fg">{money(row.arr)}</div>
                  <div className={cn("tabular whitespace-nowrap text-[11px]", soon ? "font-semibold text-danger-fg" : "text-fg-muted")}>
                    {row.daysToRenewal <= 0 ? "due now" : `renews in ${row.daysToRenewal} days`}
                  </div>
                </div>
                <Chip tone={a.tone} className="shrink-0">
                  {a.label}
                </Chip>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="caption mt-3">No renewals carry elevated risk signals in this window.</p>
      )}

      <Link
        href={allHref}
        className="mt-4 inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius transition-opacity hover:opacity-80"
      >
        View all {upcomingCount} upcoming renewal{upcomingCount === 1 ? "" : "s"}
        <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
      </Link>
    </div>
  );
}

function LegendDot({ className, label, pct }: { className: string; label: string; pct: number }) {
  return (
    <span className="flex items-center gap-1.5 font-body text-[11px] text-fg-muted">
      <span className={cn("size-2 rounded-full", className)} />
      {label} <span className="tabular font-semibold text-fg">{pct.toFixed(1)}%</span>
    </span>
  );
}
