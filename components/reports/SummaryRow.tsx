import Link from "next/link";
import type { RiskRow } from "@/lib/metrics/movement";
import { ProvisionalTag } from "@/components/reports/ProvisionalTag";
import { cn } from "@/lib/cn";

/* =========================================================================
   Four summary areas — scannable in five seconds.

   The first cut followed the brief too literally and turned each card into an
   essay: metric definitions, a GRR → expansion → NRR diagram, "gross ARR lost",
   a sentence explaining why NRR equalled GRR, and a reconciliation warning
   competing with the number it warned about. All of it true, none of it
   scannable — a summary card that needs reading isn't a summary.

   The rule now, per card: one label, one value, one comparison, one context
   line. Everything else moved:
     - definitions      -> tooltips
     - gross ARR lost   -> the waterfall, which is literally a picture of it
     - the GRR/NRR relationship -> the retention trend's shaded lift band
     - the ARR drift    -> one page-level banner (it affects every figure here,
                           not just the ARR tile)

   Chrome reduced too: no icon chips, no card shadows, one hairline border.
   Four bordered, shadowed, icon-topped boxes is a lot of furniture around
   twelve numbers.
   ========================================================================= */

const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

export interface SummaryData {
  closingArr: number;
  openingArr: number;
  activeAccounts: number;
  isCurrent: boolean;
  periodEndLabel: string;
  comparisonLabel: string | null;
  grr: number;
  nrr: number;
  grrPrev: number | null;
  nrrPrev: number | null;
  renewalArr: number;
  renewalCount: number;
  attentionArr: number;
  attentionCount: number;
  topRisk: RiskRow | null;
  /** ARR sources are unreconciled — mark the ARR-denominated tiles provisional. */
  provisional: boolean;
  qs: string;
}

const GRR_TARGET = 95;
const NRR_TARGET = 100;

export function SummaryRow({ d }: { d: SummaryData }) {
  const link = (p: string) => (d.qs ? `${p}?${d.qs}` : p);
  const arrDelta = d.closingArr - d.openingArr;
  const grrPts = d.grrPrev == null ? null : d.grr - d.grrPrev;
  const nrrPts = d.nrrPrev == null ? null : d.nrr - d.nrrPrev;
  const lift = d.nrr - d.grr;
  // Share of the renewal book that needs attention — more useful than the count
  // alone, and it's the context line rather than a fifth number.
  const attentionShare = d.renewalArr > 0 ? (d.attentionArr / d.renewalArr) * 100 : null;

  // Dividers are EXPLICIT cell borders, not a gap-px bleed. On hi-DPI the gap
  // trick placed 1px lines at fractional pixel positions, so some anti-aliased
  // away (one divider looked missing); painted borders snap to the pixel grid
  // and render consistently. Per breakpoint: 1-col → top borders; 2-col → left
  // on 2 & 4, top on 3 & 4; 4-col → left on 2, 3, 4.
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border [&>*]:border-border [&>*:not(:first-child)]:border-t sm:grid-cols-2 sm:[&>*:nth-child(2)]:border-l sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(4)]:border-l xl:grid-cols-[1fr_1.4fr_1fr_1fr] xl:[&>*:not(:first-child)]:border-t-0 xl:[&>*:not(:first-child)]:border-l">
      <Cell
        href={link("/clients")}
        label={d.isCurrent ? "Current ARR" : "Closing ARR"}
        tip="Ledger balance at the end of the selected period, across the filtered book."
      >
        <span className="flex items-center">
          <Value>{money(d.closingArr)}</Value>
          {d.provisional && <ProvisionalTag />}
        </span>
        <Delta value={arrDelta} unit="money" vs={d.comparisonLabel} />
        <Ctx>
          {d.activeAccounts} active accounts · {d.isCurrent ? "as of today" : d.periodEndLabel}
        </Ctx>
      </Cell>

      {/* Wider: two metrics, but only two LINES — the relationship between them
          is the trend's shaded band, not a diagram in a summary tile. */}
      <Cell label="Retention" tip="GRR is revenue protected before expansion. NRR adds expansion back. New business is excluded from both.">
        <div className="flex flex-col gap-1.5">
          <Rate href={link("/reports/churn")} label="GRR" value={d.grr} pts={grrPts} vs={d.comparisonLabel} target={GRR_TARGET} />
          <Rate href={link("/reports")} label="NRR" value={d.nrr} pts={nrrPts} vs={d.comparisonLabel} target={NRR_TARGET} />
        </div>
        <Ctx>{Math.abs(lift) < 0.05 ? "No expansion lift" : `${lift.toFixed(1)}-pt expansion lift`}</Ctx>
      </Cell>

      <Cell
        href={link("/clients")}
        label="Upcoming renewals"
        tip="ARR on accounts whose renewal date falls in the 90 days after the selected period ends."
      >
        <span className="flex items-center">
          <Value>{money(d.renewalArr)}</Value>
          {d.provisional && <ProvisionalTag />}
        </span>
        <Ctx>{d.renewalCount} accounts</Ctx>
        <Ctx>{d.isCurrent ? "Next 90 days" : `90 days following ${d.periodEndLabel}`}</Ctx>
      </Cell>

      <Cell
        href={link("/reports")}
        label="Renewal ARR requiring attention"
        tip="ARR on upcoming renewals carrying risk signals — declining usage, low health, SLA breaches. Not a churn forecast."
      >
        <span className="flex items-center">
          <Value>{money(d.attentionArr)}</Value>
          {d.provisional && <ProvisionalTag />}
        </span>
        <Ctx>
          {d.attentionCount} renewal{d.attentionCount === 1 ? "" : "s"}
        </Ctx>
        <Ctx>{attentionShare == null ? "—" : `${attentionShare.toFixed(1)}% of upcoming ARR`}</Ctx>
      </Cell>
    </div>
  );
}

/** One cell. `gap-px` on a bordered parent draws the dividers, so no cell needs
 *  its own border or shadow — four shadowed boxes was furniture around twelve
 *  numbers. */
function Cell({
  href,
  label,
  tip,
  children,
}: {
  href?: string;
  label: string;
  tip: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <span className="group/tip relative w-fit">
        <span className="eyebrow cursor-help border-b border-dotted border-border-strong">{label}</span>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-50 w-[min(80vw,240px)] rounded-lg border border-border bg-surface p-2.5 font-body text-[11.5px] font-normal normal-case leading-relaxed tracking-normal text-fg-muted opacity-0 shadow-lg transition-opacity duration-[140ms] group-hover/tip:opacity-100"
        >
          {tip}
        </span>
      </span>
      {children}
    </>
  );
  const cls = "flex flex-col gap-1.5 bg-surface p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-bg-subtle")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="tabular font-display text-2xl font-bold leading-none tracking-tight text-fg">{children}</span>;
}

function Ctx({ children }: { children: React.ReactNode }) {
  return <span className="caption leading-snug">{children}</span>;
}

/** One line: label, value, delta, target. No sub-label, no supporting value —
 *  those were the essay. */
function Rate({
  href,
  label,
  value,
  pts,
  vs,
  target,
}: {
  href: string;
  label: string;
  value: number;
  pts: number | null;
  vs: string | null;
  target: number;
}) {
  const hit = value >= target;
  return (
    <Link href={href} className="group flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-body text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      <span
        className={cn(
          "tabular font-display text-xl font-bold leading-none tracking-tight transition-colors group-hover:text-sirius",
          hit ? "text-success-fg" : "text-fg",
        )}
      >
        {value}%
      </span>
      {pts != null && vs && (
        <span
          className={cn(
            "tabular text-[11px] font-semibold",
            Math.abs(pts) < 0.05 ? "text-fg-subtle" : pts > 0 ? "text-success-fg" : "text-danger-fg",
          )}
        >
          {Math.abs(pts) < 0.05 ? "flat" : `${pts > 0 ? "+" : "−"}${Math.abs(pts).toFixed(1)} pts`} vs {vs}
        </span>
      )}
      <span className={cn("caption tabular ml-auto", hit ? "text-success-fg" : "")}>Target ≥{target}%</span>
    </Link>
  );
}

/** Money deltas absolute; rate deltas in points (handled in Rate). Never a
 *  relative % on a rate. */
function Delta({ value, unit, vs }: { value: number; unit: "money"; vs: string | null }) {
  if (!vs) return null;
  const flat = Math.abs(value) < 1;
  return (
    <span
      className={cn(
        "tabular text-[11px] font-semibold",
        flat ? "text-fg-subtle" : value > 0 ? "text-success-fg" : "text-danger-fg",
      )}
    >
      {flat ? "flat" : money(value)} vs {vs}
    </span>
  );
}
