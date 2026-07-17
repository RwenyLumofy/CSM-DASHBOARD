import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Minus, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { ArrReconciliation } from "@/lib/metrics/exec";
import type { RiskRow } from "@/lib/metrics/movement";
import { cn } from "@/lib/cn";

/* =========================================================================
   Four primary summary areas — the page's first ten seconds.

   It was eight equally-weighted tiles, which is another way of saying no
   hierarchy: average health, open tickets, gross ARR churn and logo retention
   competed for attention with the portfolio's value. Four areas now, and they
   are NOT four identical cards — retention is deliberately wider because it
   carries two related metrics and the relationship between them.

   What was demoted and why:
     - Gross ARR churn -> supporting context under GRR. It's the GRR numerator's
       missing half; a separate tile made a subtraction look like a finding.
     - Logo retention  -> secondary. It answers a different question from revenue
       retention (how many logos vs how much money) and deserves to stay, but not
       at the same weight.
     - Average health / open tickets -> their own pages. Neither is a commercial
       number, and "open tickets" as a raw count isn't even operationally
       actionable (see the intervention section).

   GRR AND NRR STAY SEPARATE even though they're identical this period. They're
   different calculations that happen to coincide when expansion is zero, and
   collapsing them would hide exactly the thing worth noticing: there was no
   expansion at all.
   ========================================================================= */

const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

export interface SummaryData {
  /** Snapshot at the END of the selected period. */
  closingArr: number;
  openingArr: number;
  activeAccounts: number;
  /** True when the selected period contains today — drives "Current" vs
   *  "Closing", per the rule that "current" is only honest if it is. */
  isCurrent: boolean;
  /** Human end-date of the period, for the historical label. */
  periodEndLabel: string;
  comparisonLabel: string | null;
  grr: number;
  nrr: number;
  grrPrev: number | null;
  nrrPrev: number | null;
  grossArrLost: number;
  renewalArr: number;
  renewalCount: number;
  interventionArr: number;
  interventionCount: number;
  topRisk: RiskRow | null;
  arr: ArrReconciliation;
  /** Carries period + filters into every drill-down. */
  qs: string;
}

const GRR_TARGET = 95;
const NRR_TARGET = 100;

export function SummaryRow({ d }: { d: SummaryData }) {
  const link = (path: string) => (d.qs ? `${path}?${d.qs}` : path);
  const arrDelta = d.closingArr - d.openingArr;
  // Percentage POINTS for rates, never relative % — "GRR fell 4%" is ambiguous
  // between 4 points and 4% of 93.1.
  const grrPts = d.grrPrev == null ? null : d.grr - d.grrPrev;
  const nrrPts = d.nrrPrev == null ? null : d.nrr - d.nrrPrev;
  const lift = d.nrr - d.grr;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.7fr_1fr_1fr]">
      {/* ---- 1. ARR ---- */}
      <Card interactive className="flex flex-col gap-2.5">
        <Link href={link("/clients")} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">{d.isCurrent ? "Current ARR" : "Closing ARR"}</span>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-info-bg text-info-fg">
              <Wallet size={14} strokeWidth={1.75} />
            </span>
          </div>
          <span className="tabular font-display text-[28px] font-bold leading-none tracking-tight text-fg">
            {money(d.closingArr)}
          </span>
          <Delta value={arrDelta} unit="money" vs={d.comparisonLabel} />
          <span className="caption">
            {d.activeAccounts} active accounts · {d.isCurrent ? "as of today" : `as of ${d.periodEndLabel}`}
          </span>
        </Link>

        {/* The drift is stated where the number is, not in a footnote. Two
            sources disagree by $369K and neither tile can be trusted until
            someone decides which is authoritative. */}
        {!d.arr.reconciled && (
          <Link
            href={link("/reports")}
            className="mt-0.5 flex items-start gap-1.5 rounded-md border border-warning-bg bg-warning-bg/50 px-2 py-1.5"
          >
            <AlertTriangle size={11} strokeWidth={2} className="mt-[2px] shrink-0 text-warning-fg" aria-hidden />
            <span className="font-body text-[10.5px] leading-snug text-warning-fg">
              Ledger says {money(d.arr.ledgerLive)} — {money(Math.abs(d.arr.drift))} apart across {d.arr.driftAccounts}{" "}
              accounts. Unreconciled.
            </span>
          </Link>
        )}
      </Card>

      {/* ---- 2. Retention — wider: two metrics and the relationship ---- */}
      <Card className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1">
        <span className="eyebrow">Retention</span>

        <div className="grid grid-cols-2 gap-4">
          <Rate
            href={link("/reports/churn")}
            label="GRR"
            sub="Revenue protected before expansion"
            value={d.grr}
            pts={grrPts}
            vs={d.comparisonLabel}
            target={GRR_TARGET}
            support={`${money(d.grossArrLost)} gross ARR lost`}
          />
          <Rate
            href={link("/reports")}
            label="NRR"
            sub="Revenue retained after expansion"
            value={d.nrr}
            pts={nrrPts}
            vs={d.comparisonLabel}
            target={NRR_TARGET}
            support={`${lift.toFixed(1)}-point expansion lift`}
          />
        </div>

        {/* The relationship, stated once. GRR + lift = NRR is the whole reason
            these two live in one block. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-2.5">
          <span className="tabular font-body text-[11.5px] font-semibold text-fg">GRR {d.grr}%</span>
          <span className="caption">→</span>
          <span className="tabular font-body text-[11.5px] font-semibold text-fg-muted">
            Expansion lift {lift.toFixed(1)} pts
          </span>
          <span className="caption">→</span>
          <span className="tabular font-body text-[11.5px] font-semibold text-fg">NRR {d.nrr}%</span>
        </div>
        {Math.abs(lift) < 0.05 && (
          <p className="caption -mt-1">NRR equals GRR this period because no expansion was recorded.</p>
        )}
      </Card>

      {/* ---- 3. Upcoming renewals ---- */}
      <Card interactive className="flex flex-col gap-2.5">
        <Link href={link("/clients")} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Upcoming renewals</span>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-warning-bg text-warning-fg">
              <CalendarClock size={14} strokeWidth={1.75} />
            </span>
          </div>
          <span className="tabular font-display text-[28px] font-bold leading-none tracking-tight text-fg">
            {money(d.renewalArr)}
          </span>
          <span className="caption">
            {d.renewalCount} accounts · next 90 days
            {!d.isCurrent && <> from {d.periodEndLabel}</>}
          </span>
        </Link>
      </Card>

      {/* ---- 4. Intervention exposure ---- */}
      <Card interactive className="flex flex-col gap-2.5">
        <Link href={link("/reports")} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Intervention exposure</span>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-danger-bg text-danger-fg">
              <AlertTriangle size={14} strokeWidth={1.75} />
            </span>
          </div>
          <span className="tabular font-display text-[28px] font-bold leading-none tracking-tight text-fg">
            {money(d.interventionArr)}
          </span>
          {/* Deliberately NOT "predicted churn" or "expected loss" — nothing
              here forecasts anything. It's the ARR attached to renewals that
              carry risk signals. */}
          <span className="caption">ARR attached to elevated-risk renewals</span>
          {d.topRisk && (
            <span className="caption text-danger-fg">
              {money(d.topRisk.arr)} concentrated in {shortName(d.topRisk.client.name)}
            </span>
          )}
        </Link>
      </Card>
    </div>
  );
}

function Rate({
  href,
  label,
  sub,
  value,
  pts,
  vs,
  target,
  support,
}: {
  href: string;
  label: string;
  sub: string;
  value: number;
  pts: number | null;
  vs: string | null;
  target: number;
  support: string;
}) {
  const hit = value >= target;
  return (
    <Link href={href} className="group flex flex-col gap-1 rounded-md transition-colors">
      <div className="flex items-baseline gap-1.5">
        <span className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
        <span
          className={cn(
            "tabular font-display text-2xl font-bold leading-none tracking-tight transition-colors group-hover:text-sirius",
            hit ? "text-success-fg" : "text-fg",
          )}
        >
          {value}%
        </span>
      </div>
      <span className="caption leading-snug">{sub}</span>
      <Delta value={pts} unit="pts" vs={vs} />
      <span className="caption tabular">{support}</span>
      <span className={cn("caption tabular", hit ? "text-success-fg" : "text-fg-subtle")}>
        Target ≥{target}%{hit ? " · met" : ` · ${(target - value).toFixed(1)} pts short`}
      </span>
    </Link>
  );
}

/** Percentage POINTS for rates, absolute money for money. Never a relative %
 *  on a rate — "GRR fell 4%" can't distinguish 4 points from 4% of 93.1. */
function Delta({ value, unit, vs }: { value: number | null; unit: "money" | "pts"; vs: string | null }) {
  if (value == null || !vs) return null;
  const flat = unit === "pts" ? Math.abs(value) < 0.05 : Math.abs(value) < 1;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tabular inline-flex w-fit items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[10.5px] font-semibold",
        flat ? "bg-bg-muted text-fg-subtle" : up ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg",
      )}
    >
      <Icon size={10} strokeWidth={2.5} aria-hidden />
      {flat ? "flat" : unit === "money" ? money(value) : `${up ? "+" : "−"}${Math.abs(value).toFixed(1)} pts`}
      <span className="font-normal opacity-70"> vs {vs}</span>
    </span>
  );
}

/** Long Arabic-English account names blow out a summary tile. Trim to the
 *  first clause; the drill-down shows the full name. */
function shortName(n: string): string {
  const cut = n.split(/[|·—-]/)[0].trim();
  return cut.length > 24 ? `${cut.slice(0, 24)}…` : cut;
}
