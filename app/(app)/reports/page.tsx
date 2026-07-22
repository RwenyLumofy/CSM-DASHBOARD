import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SummaryRow } from "@/components/reports/SummaryRow";
import { DataQualityBanner } from "@/components/reports/DataQualityBanner";
import { Headline } from "@/components/reports/Headline";
import { ConcentrationPanel } from "@/components/reports/ConcentrationPanel";
import { MovementPanel } from "@/components/reports/MovementPanel";
import { ForwardOutlook } from "@/components/reports/ForwardOutlook";
import { TakeawayInfo } from "@/components/reports/TakeawayInfo";
import { DateTag } from "@/components/reports/DateTag";
import { InsightsControls } from "@/components/reports/InsightsControls";
import { RetentionTrend } from "@/components/reports/RetentionTrend";
import { RevenueWaterfall } from "@/components/reports/RevenueWaterfall";
import { getExecutiveReport, getFilterOptions } from "@/lib/data";
import {
  buildHeadline,
  defaultExecPeriod,
  parseCompare,
  parseFilters,
  periodDisplay,
  periodInProgress,
  periodProgress,
} from "@/lib/metrics/exec";
import { buildArrTakeaway, buildRetentionTakeaway } from "@/lib/metrics/takeaways";
import { cn } from "@/lib/cn";

export const metadata = { title: "Insights · Lumofy Signals" };

/** Compact money — 2dp at millions so a 6.6% move stays visible ($1.80M vs
 *  $1.68M), 1dp at thousands. */
const moneyM = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

/** Period + every filter is read from the URL, so a filtered view is a link an
 *  exec can paste into a board pack and re-open unchanged next quarter. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const periodRaw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  // Defaults to the last COMPLETE quarter — see defaultExecPeriod(). Opening on
  // a 16-day-old quarter showed a flat, empty report.
  const period = periodRaw || defaultExecPeriod();
  const filters = parseFilters(sp);
  const compare = parseCompare(sp.compare);
  const inProgress = periodInProgress(period);
  const progress = inProgress ? periodProgress(period) : null;

  const [r, options] = await Promise.all([
    getExecutiveReport({ period, filters, trendLength: 6, compare }),
    getFilterOptions(),
  ]);
  const { retention: cur, previous: prev, portfolio, currency } = r;

  // Logo retention moved to the churn detail page — a bare line under the
  // waterfall was an uncontained footer belonging to nothing.
  const headline = buildHeadline(r);
  // Renewals carrying risk signals — the same >=30 threshold the at-risk panel
  // bands as Medium or High. NOT a churn forecast: it's ARR attached to
  // renewals with warning signs, which is a different claim.
  const attentionRows = r.atRisk.filter((x) => x.risk >= 30);
  // Account counts for the waterfall's movement tiles, off the SAME ledger
  // movements the bars are drawn from, so a tile can never disagree with its
  // bar. Distinct clients per kind (a client with two new-business events counts
  // once). Churn uses r.churned — the established period-scoped source.
  const movesByKind = (kind: string) => new Set(r.movements.filter((m) => m.kind === kind).map((m) => m.client.id)).size;
  // Retention trend readouts: distance from each target and the lift between the
  // two lines — what the trend is about, replacing the expansion/contraction/new
  // business ministats that duplicated the waterfall's tiles.
  const GRR_TARGET = 95;
  const NRR_TARGET = 100;
  const grrGap = cur.grr - GRR_TARGET;
  const nrrGap = cur.nrr - NRR_TARGET;
  const expansionLift = cur.nrr - cur.grr;
  const retentionTakeaway = buildRetentionTakeaway(cur.grr, prev?.grr ?? null, GRR_TARGET);
  // Explains why the chart usually shows ONE line: expansion isn't a series, it's
  // the gap between NRR and GRR, and it's zero this period.
  const retentionNote =
    Math.abs(expansionLift) < 0.05
      ? "GRR is revenue kept before expansion; NRR adds expansion back. Expansion — extra ARR from existing customers — isn’t its own line, it’s the gap between NRR and GRR. This period expansion was zero, so NRR equals GRR and the two lines coincide."
      : `GRR is revenue kept before expansion; NRR adds expansion back. Expansion — extra ARR from existing customers — isn’t its own line, it’s the gap between the NRR and GRR lines: ${expansionLift.toFixed(1)} pts here.`;
  // ARR-movement takeaway — generated, revealed behind the chart's "i". Net is
  // the movement sum (independent of closing, which carries ghost ARR).
  const arrNet = cur.expansion - cur.contraction - cur.churn + r.newBusiness;
  const arrTakeaway = buildArrTakeaway({
    net: arrNet,
    churn: cur.churn,
    contraction: cur.contraction,
    expansion: cur.expansion,
    newBusiness: r.newBusiness,
    periodLabel: periodDisplay(period),
  });
  // The impact of the movement — the net effect on the book (endpoints + %),
  // which the takeaway's delta doesn't state. Shown under the takeaway in the "i".
  const arrClosing = cur.startingArr + arrNet;
  const arrPct = cur.startingArr > 0 ? (arrNet / cur.startingArr) * 100 : 0;
  const arrImpact =
    Math.abs(arrNet) < 1
      ? `Impact: the book held flat this period at ${moneyM(arrClosing)}.`
      : `Impact: the book ${arrNet < 0 ? "contracted" : "grew"} ${Math.abs(arrPct).toFixed(1)}% this period — ${moneyM(cur.startingArr)} → ${moneyM(arrClosing)}.`;
  const comparisonLabel = r.comparison.period ? periodDisplay(r.comparison.period) : null;
  // Forward outlook shows the three MOST MATERIAL attention renewals — ranked by
  // ARR, not risk score, so a $181K account leads a $8K one.
  const outlookRows = [...attentionRows].sort((a, b) => b.arr - a.arr).slice(0, 3);
  const attentionArr = attentionRows.reduce((a, x) => a + x.arr, 0);
  // Critical band (risk ≥ 60) splits the exposure bar's red segment from amber.
  const criticalArr = attentionRows.filter((x) => x.risk >= 60).reduce((a, x) => a + x.arr, 0);
  // The forward window's far end. This section is anchored to TODAY, not the
  // selected period, so it says so — 90 days from now.
  const outlookHorizon = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 90);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  })();
  // Carries period + compare + filters into every drill-down, so a summary tile
  // never dumps you into an unfiltered view.
  const qs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      return val ? [[k, val] as [string, string]] : [];
    }),
  ).toString();
  // The period's last DAY (bounds.end is exclusive), for "as of 30 Jun 2026".
  const periodEndLabel = (() => {
    const d = new Date(`${r.bounds.end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  })();

  const noData = cur.startingArr === 0 && cur.endingArr === 0 && r.filteredCount === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Controls left, readouts right. The summary and the account count both
          answer "what does this scope say", so they belong on the bar that sets
          it — not floating beneath it. */}
      <InsightsControls
        options={options}
        period={period}
        compare={compare}
        readout={
          <>
            <AccountCount active={portfolio.totalClients} filtered={r.filteredCount} total={r.totalCount} />
            {!noData && <Headline data={headline} currency={currency} />}
          </>
        }
      />


      {/* An in-progress period's numbers are still accruing — say so, rather
          than letting a half-empty waterfall read as "a quiet quarter". */}
      {inProgress && progress && (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning-bg bg-warning-bg/60 px-3.5 py-2.5">
          <CalendarClock size={15} strokeWidth={2} className="shrink-0 text-warning-fg" aria-hidden />
          <p className="font-body text-[12.5px] text-warning-fg">
            <span className="font-semibold">{periodDisplay(period)} is still in progress</span> — day {progress.elapsed} of{" "}
            {progress.total}. These figures are partial and will keep moving. For a settled view, step back a period.
          </p>
        </div>
      )}

      {/* Page-level: the ARR drift affects every figure below, so it warns once
          here rather than inside the ARR card competing with its own number. */}
      {!noData && <DataQualityBanner arr={r.arr} qs={qs} />}

      {noData ? (
        <EmptyReport />
      ) : (
        <>
          {/* ============ 1. The first ten seconds ============
              Four summary areas, not eight equal tiles. Eight equal tiles is
              another way of saying no hierarchy: average health and open
              tickets competed with the portfolio's value for the same
              attention. Demoted, with reasons, in SummaryRow. */}
          <SummaryRow
            d={{
              closingArr: r.closingArr,
              openingArr: cur.startingArr,
              activeAccounts: portfolio.totalClients,
              isCurrent: inProgress,
              periodEndLabel: periodEndLabel,
              comparisonLabel: r.comparison.period ? periodDisplay(r.comparison.period) : null,
              grr: cur.grr,
              nrr: cur.nrr,
              grrPrev: prev?.grr ?? null,
              nrrPrev: prev?.nrr ?? null,
              renewalArr: portfolio.arrUpForRenewal90d,
              renewalCount: portfolio.renewalsNext90d,
              attentionArr: attentionRows.reduce((a, x) => a + x.arr, 0),
              attentionCount: attentionRows.length,
              topRisk: attentionRows[0] ?? null,
              provisional: !r.arr.reconciled,
              qs: qs,
            }}
          />

          {/* ============ Selected-period performance (the HISTORICAL zone) ====
              Everything under this heading is the closed period compared with
              the previous one. The forward-looking sections come later, under
              their own "as of today" heading, so the two clocks never mix. */}
          <Section
            title="Selected-period performance"
            when={comparisonLabel ? `${periodDisplay(period)} · vs ${comparisonLabel}` : periodDisplay(period)}
          />

          {/* ---------------- waterfall + trend ----------------
              Equal size: two 50/50 columns that stretch to a shared height, so
              the two charts read as a matched pair rather than one dominating.
              (Default align-items:stretch does the height match.) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              {/* Eyebrow is the title; the generated takeaway lives behind the
                  "i" on this same line (TakeawayInfo), not printed on the chart. */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="eyebrow">Revenue movement</span>
                <div className="flex items-center gap-2">
                  <DateTag>{periodDisplay(period)}</DateTag>
                  <TakeawayInfo
                    takeaway={arrTakeaway.text}
                    note={arrImpact}
                    label="Show this period’s ARR-movement takeaway"
                  />
                </div>
              </div>
              <RevenueWaterfall
                startingArr={cur.startingArr}
                expansion={cur.expansion}
                expansionCount={movesByKind("expanded")}
                contraction={cur.contraction}
                contractionCount={movesByKind("downgraded")}
                churn={cur.churn}
                churnCount={r.churned.length}
                newBusiness={r.newBusiness}
                newBusinessCount={movesByKind("new")}
              />
            </Card>

            <Card className="flex flex-col">
              {/* Same pattern as the waterfall: eyebrow + "i" on one line, the
                  generated retention takeaway revealed on click. */}
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="eyebrow">Retention trend</span>
                <div className="flex items-center gap-2">
                  <DateTag>last {r.trend.length} periods</DateTag>
                  <TakeawayInfo takeaway={retentionTakeaway} note={retentionNote} label="Show this period’s retention takeaway" />
                </div>
              </div>
              {/* Plain serializable rows only — the formatter functions live
                  inside RetentionTrend, on the client. */}
              <RetentionTrend
                trend={r.trendPlotted.map((t) => ({ period: t.period, nrr: t.nrr, grr: t.grr }))}
                omitted={r.trendOmitted}
                firstRealPeriod={r.firstRealTrendPeriod}
              />
              {/* NOT expansion/contraction/new business — those are the waterfall's
                  tiles, and repeating them here was the duplication §8 calls out.
                  These three are what the TREND is about: distance from each
                  target, and the gap between the two lines. */}
              <div className="mt-auto grid grid-cols-3 gap-3 border-t border-border-subtle pt-4">
                <MiniStat
                  label="GRR vs target"
                  value={`${grrGap >= 0 ? "+" : "−"}${Math.abs(grrGap).toFixed(1)} pts`}
                  tone={grrGap >= 0 ? "good" : "warn"}
                />
                <MiniStat
                  label="NRR vs target"
                  value={`${nrrGap >= 0 ? "+" : "−"}${Math.abs(nrrGap).toFixed(1)} pts`}
                  tone={nrrGap >= 0 ? "good" : "warn"}
                />
                <MiniStat
                  label="Expansion lift"
                  value={Math.abs(expansionLift) < 0.05 ? "None" : `+${expansionLift.toFixed(1)} pts`}
                  tone={Math.abs(expansionLift) < 0.05 ? "warn" : "good"}
                />
              </div>
            </Card>
          </div>

          {/* ============ What changed — the named accounts to tackle ========
              Restored on the user's call. Generated conclusions read well but
              abstracted away the WHO, and a CS lead acts on names: the two-column
              named movement list (revenue moved | early warnings) is the directly
              actionable view of who needs attention this period, with the full
              detail one "view all" away. Period-scoped, off the same ledger the
              waterfall draws from. */}
          <Section title="Accounts to tackle" when={periodDisplay(period)} />
          <MovementPanel
            movements={r.movements}
            currency={currency}
            period={period}
            usageMonth={r.usageMonth}
            params={sp}
          />

          {/* ============ Forward outlook (the CURRENT zone) ============
              The clock changes here, and the heading says so. Everything above is
              the closed period; this looks ahead from today, independent of which
              quarter is selected. Top three material renewals only — the full
              pipeline is one link away. */}
          <Section title="Forward outlook" when="as of today · next 90 days" />
          <ForwardOutlook
            rows={outlookRows}
            criticalArr={criticalArr}
            attentionArr={attentionArr}
            upcomingArr={portfolio.arrUpForRenewal90d}
            upcomingCount={portfolio.renewalsNext90d}
            horizonLabel={outlookHorizon}
            provisional={!r.arr.reconciled}
            qs={qs}
          />

          {/* ============ Portfolio concentration ============
              Structural, as of today, follows the filters. A signal, not a
              conclusion — the "pricing headroom" claim is gone. */}
          <Section title="Portfolio concentration" when="as of today · follows your filters" />
          <ConcentrationPanel rows={r.concentration.rows} topArrShare={r.concentration.topArrShare} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** The filter dimension as a readout, not a paragraph. It used to be a
 *  full sentence floating under the bar explaining that figures are recomputed
 *  rather than filtered-after-the-fact — true, but a claim nobody asked for
 *  taking a line of the page. The count is the fact; the recomputation is the
 *  behaviour, and it's visible the moment you filter. */
function AccountCount({ active, filtered, total }: { active: number; filtered: number; total: number }) {
  const on = filtered !== total;
  return (
    <span className="group/pop relative" aria-live="polite">
      <span className="caption tabular cursor-help whitespace-nowrap border-b border-dotted border-border-strong">
        <span className="font-semibold text-fg">{active}</span> active
        {on ? (
          <>
            {" "}· <span className="font-semibold text-fg">{filtered}</span> of {total} records
          </>
        ) : (
          <> · {total} total records</>
        )}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 w-[min(80vw,260px)] rounded-lg border border-border bg-surface p-2.5 font-body text-[11px] font-normal normal-case leading-relaxed tracking-normal text-fg-muted opacity-0 shadow-lg transition-opacity duration-[140ms] group-hover/pop:opacity-100"
      >
        <span className="font-semibold text-fg">Active</span> — revenue-bearing accounts, churned excluded; every ARR
        metric on this page is computed from these.{" "}
        <span className="font-semibold text-fg">Records</span> — all account rows, including churned and
        non-revenue.
      </span>
    </span>
  );
}

/** A page-level section heading carrying its own TIME BASE.
 *
 *  The page reads across three different clocks — ARR/retention on the selected
 *  period, usage movement on the last complete month, health/concentration on
 *  right-now. Interleaved as identical cards, every number was quietly
 *  ambiguous, and each card had grown a footnote explaining which clock it was
 *  on. Stating it once per section is what those footnotes were compensating
 *  for. */
function Section({ title, when }: { title: string; when: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
      <h2 className="h5">{title}</h2>
      <span className="tabular font-body text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {when}
      </span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "accent" }) {
  const color =
    tone === "good" ? "text-success-fg" : tone === "warn" ? "text-warning-fg" : tone === "bad" ? "text-danger-fg" : "text-sirius";
  return (
    <div className="flex flex-col gap-1">
      <span className="caption">{label}</span>
      <span className={cn("tabular font-body text-[15px] font-semibold", color)}>{value}</span>
    </div>
  );
}



function EmptyReport() {
  return (
    <Card className="flex flex-col items-center gap-2 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-bg-muted text-fg-subtle">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </span>
      <h3 className="h5 mt-1">No accounts match these filters</h3>
      <p className="caption max-w-sm">
        Every metric on this page is computed from the filtered book, so there is nothing to report. Clear a filter or
        pick a different period.
      </p>
    </Card>
  );
}
