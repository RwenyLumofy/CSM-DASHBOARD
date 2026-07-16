import { AlertCircle, TrendingDown } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import type { ChurnAnalysis, ChurnSlice } from "@/lib/metrics/churn";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

/* Churn analysis — who churns, when, and how much.

   Leads with the SEGMENT GRADIENT because on live data that's the most decisive
   fact in the whole database: SMB 84%, mid-market 50%, enterprise 32%. Nothing
   else on this page came close to that signal, and nothing surfaced it.

   Cohort size is rendered next to every rate on purpose. A rate without its
   denominator invites "Technology churns at 63%!" off a cohort of eight, and
   this book has several small industry buckets exactly like that. */

const rateTone = (rate: number) =>
  rate >= 0.7 ? "danger" : rate >= 0.45 ? "warning" : rate >= 0.25 ? "warning" : "success";

const TONE_BAR: Record<string, string> = {
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
};
const TONE_TEXT: Record<string, string> = {
  danger: "text-danger-fg",
  warning: "text-warning-fg",
  success: "text-success-fg",
};

export function ChurnPanel({ churn, currency }: { churn: ChurnAnalysis; currency: string }) {
  const total = churn.churned + churn.live;
  const overall = total ? churn.churned / total : 0;
  const maxQ = Math.max(...churn.byQuarter.map((q) => q.count), 1);
  const money = (v: number) => formatCurrency(v, currency, { compact: true });

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardEyebrow>Churn · all time</CardEyebrow>
          <h3 className="h5">Who churns</h3>
        </div>
        <div className="text-right">
          <div className="tabular font-display text-xl font-bold leading-none text-danger-fg">
            {churn.churned}
            <span className="text-fg-subtle"> / {total}</span>
          </div>
          <div className="caption mt-1">{money(churn.arrLost)} lost · {Math.round(overall * 100)}% of all accounts</div>
        </div>
      </div>

      {/* The headline. Segment gradient — the strongest signal in the data. */}
      <div className="mb-5">
        <div className="eyebrow mb-2.5">Churn rate by segment</div>
        <ul className="flex flex-col gap-2.5">
          {churn.bySegment.map((s) => (
            <SliceRow key={s.key} slice={s} money={money} />
          ))}
        </ul>
      </div>

      {/* When. A spike an average would erase. */}
      {churn.byQuarter.length > 0 && (
        <div className="mb-5 border-t border-border-subtle pt-4">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <span className="eyebrow">When they churned</span>
            {churn.peak && (
              <span className="caption">
                peak <span className="font-semibold text-fg">{churn.peak.period}</span> · {churn.peak.count} accounts
              </span>
            )}
          </div>
          <div className="flex items-end gap-1.5">
            {churn.byQuarter.map((q) => (
              <div key={q.period} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="tabular font-body text-[11px] font-semibold text-fg">{q.count}</span>
                <div
                  className={cn("w-full rounded-t-[3px]", q.count === churn.peak?.count ? "bg-danger" : "bg-danger/45")}
                  style={{ height: `${Math.max(4, (q.count / maxQ) * 56)}px` }}
                />
                <span className="caption text-[10px]">{q.period.replace("-", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By industry — with denominators, always. */}
      {churn.byIndustry.length > 0 && (
        <div className="mb-4 border-t border-border-subtle pt-4">
          <div className="eyebrow mb-2.5">Churn rate by industry</div>
          <ul className="flex flex-col gap-2">
            {churn.byIndustry.map((s) => (
              <SliceRow key={s.key} slice={s} money={money} compact />
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        {churn.lifetimeDays.median != null && (
          <p className="caption">
            Churned accounts lasted a median of{" "}
            <strong className="font-semibold text-fg">
              {Math.round(churn.lifetimeDays.median / 30)} months
            </strong>{" "}
            ({churn.lifetimeDays.median} days) from first contract to churn, across {churn.lifetimeDays.n} accounts with
            both dates.
          </p>
        )}

        {/* The gap that matters most — stated, not hidden. */}
        <div className="flex items-start gap-2 rounded-md border border-warning-bg bg-warning-bg/50 px-3 py-2">
          <AlertCircle size={13} strokeWidth={2} className="mt-[3px] shrink-0 text-warning-fg" aria-hidden />
          <p className="font-body text-[12px] leading-relaxed text-warning-fg">
            <strong className="font-semibold">No churn reason is recorded anywhere</strong> — there&apos;s no field for
            it on the account or the event, so this answers who, when and how much, but never why.{" "}
            {churn.noteCount > 0 && (
              <>
                {churn.noteCount} churn {churn.noteCount === 1 ? "event carries" : "events carry"} a free-text note,
                which is the only &quot;why&quot; that exists today.
              </>
            )}
          </p>
        </div>

        {/* A real data gap, stated plainly. These accounts are invisible to the
            timing chart AND to NRR — worth more than a footnote, but the fix
            belongs in the import, not in a chart. */}
        {churn.undated > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-danger-bg bg-danger-bg/50 px-3 py-2">
            <TrendingDown size={13} strokeWidth={2} className="mt-[3px] shrink-0 text-danger-fg" aria-hidden />
            <p className="font-body text-[12px] leading-relaxed text-danger-fg">
              <strong className="font-semibold">
                {churn.undated} churned {churn.undated === 1 ? "account has" : "accounts have"} no churn event in the
                ARR ledger
              </strong>{" "}
              — only {churn.dated} of {churn.churned} are dated, so the timing chart above covers those. They still
              carry {money(churn.undatedArr)} of ARR in the ledger, which means retention figures on this page are
              slightly better than reality: that revenue sits in the opening balance and never churns out. The churn
              import writes a baseline/churn event pair per account; these received only the baseline.
            </p>
          </div>
        )}

        <p className="caption text-fg-subtle">
          Rates are cumulative, not annual — &quot;{Math.round((churn.bySegment[0]?.rate ?? 0) * 100)}% of{" "}
          {churn.bySegment[0]?.label ?? "SMB"}&quot; means that share of every such account ever recorded has churned.
          Much of this book&apos;s churn was backfilled from HubSpot in a single import, so quoting these as a periodic
          rate would overstate them badly.
        </p>
      </div>
    </Card>
  );
}

function SliceRow({
  slice,
  money,
  compact,
}: {
  slice: ChurnSlice;
  money: (v: number) => string;
  compact?: boolean;
}) {
  const tone = rateTone(slice.rate);
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn("shrink-0 truncate font-body font-semibold text-fg", compact ? "w-[128px] text-[12px]" : "w-[92px] text-[12.5px]")}
        title={slice.label}
      >
        {slice.label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-bg-muted">
        <div
          className="h-full rounded-pill transition-all duration-[220ms]"
          style={{ width: `${Math.max(2, slice.rate * 100)}%`, background: TONE_BAR[tone] }}
        />
      </div>
      <span className={cn("tabular w-9 shrink-0 text-right font-body text-[12.5px] font-bold", TONE_TEXT[tone])}>
        {Math.round(slice.rate * 100)}%
      </span>
      {/* The denominator, always — a rate without its cohort invites nonsense
          off a base of eight. */}
      <span className="caption tabular w-[104px] shrink-0 text-right">
        {slice.churned}/{slice.total} · {money(slice.arrLost)}
      </span>
    </li>
  );
}
