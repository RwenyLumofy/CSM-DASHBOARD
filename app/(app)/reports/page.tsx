import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { AtRiskPanel } from "@/components/reports/AtRiskPanel";
import { SummaryRow } from "@/components/reports/SummaryRow";
import { DataQualityBanner } from "@/components/reports/DataQualityBanner";
import { Headline } from "@/components/reports/Headline";
import { ConcentrationPanel } from "@/components/reports/ConcentrationPanel";
import { MovementPanel } from "@/components/reports/MovementPanel";
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
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Insights · Lumofy Signals" };

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
            <AccountCount filtered={r.filteredCount} total={r.totalCount} />
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
              qs: qs,
            }}
          />

          {/* ============ 2. Why ARR changed ============ */}
          <Section title="Why ARR changed" when={periodDisplay(period)} />

          {/* ---------------- waterfall + trend ----------------
              items-start: CSS grid defaults to align-items:stretch, so the
              trend card was being pulled to the waterfall's height and padding
              the difference with dead space. They're independent cards with
              independent content — each should end where its content does. */}
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              {/* Header is now the component's own: a derived insight replaces
                  "ARR waterfall · Q2 2026", and the opening→closing pair
                  replaces a lone compact total that rounded $1.679M to "$1.7M"
                  — hiding the very decline the card is about. */}
              <CardEyebrow>Revenue movement · {periodDisplay(period)}</CardEyebrow>
              <RevenueWaterfall
                startingArr={cur.startingArr}
                expansion={cur.expansion}
                contraction={cur.contraction}
                churn={cur.churn}
                newBusiness={r.newBusiness}
                periodLabel={periodDisplay(period)}
              />
            </Card>

            <Card>
              <CardEyebrow>Trend · last {r.trend.length} periods</CardEyebrow>
              <h3 className="h5 mb-4">Retention over time</h3>
              {/* Plain serializable rows only — the formatter functions live
                  inside RetentionTrend, on the client. */}
              <RetentionTrend
                trend={r.trendPlotted.map((t) => ({ period: t.period, nrr: t.nrr, grr: t.grr }))}
                omitted={r.trendOmitted}
                firstRealPeriod={r.firstRealTrendPeriod}
              />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-4">
                <MiniStat label="Expansion" value={formatCurrency(cur.expansion, currency, { compact: true })} tone="good" />
                <MiniStat label="Contraction" value={formatCurrency(cur.contraction, currency, { compact: true })} tone="warn" />
                <MiniStat label="New business" value={formatCurrency(r.newBusiness, currency, { compact: true })} tone="accent" />
              </div>
            </Card>
          </div>

          {/* ============ 2. Who moved? ============
              The only section with NAMES — which is what makes a reader lean in,
              and what the CS category leads with (a ranked account list, not an
              average). */}
          <Section title="What changed" when={periodDisplay(period)} />
          <MovementPanel
            movements={r.movements}
            currency={currency}
            period={period}
            usageMonth={r.usageMonth}
            params={sp}
          />

          {/* ============ 3. What do we do next? ============
              The only panel that's forward-looking, and the only one that names
              an action. Deliberately NOT period-scoped — it looks ahead from
              today regardless of which quarter is selected above. */}
          <Section title="What's at risk" when="next 90 days · from today" />
          <AtRiskPanel rows={r.atRisk} currency={currency} />

          {/* ============ 4. Context ============
              Questions a board MIGHT ask, not ones it will. Demoted below the
              answer, and labelled point-in-time — these don't move with the
              period selector. */}
          {/* ============ 4. Context ============
              Health lives on its own subpage now — a board asks whether health
              is MOVING, not why it's 67, and the decomposition is a one-time
              diagnostic about the scoring config, not a permanent fixture. */}
          <Section title="Concentration" when="as of today · follows your filters" />
          <div className="grid grid-cols-1 gap-5">
            <ConcentrationPanel
              rows={r.concentration.rows}
              topArrShare={r.concentration.topArrShare}
              topMauShare={r.concentration.topMauShare}
              currency={currency}
            />
          </div>

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
function AccountCount({ filtered, total }: { filtered: number; total: number }) {
  const on = filtered !== total;
  return (
    <span className="caption tabular whitespace-nowrap" aria-live="polite">
      {on ? (
        <>
          <span className="font-semibold text-fg">{filtered}</span> of {total} accounts
        </>
      ) : (
        <>
          <span className="font-semibold text-fg">{total}</span> accounts
        </>
      )}
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
function SectionWithControls({ title, when, controls }: { title: string; when: string; controls: React.ReactNode }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="h5">{title}</h2>
        <span className="tabular font-body text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          {when}
        </span>
      </div>
      {controls}
    </div>
  );
}

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

function monthName(ym: string): string {
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(ym.slice(5, 7))] ?? ym} ${ym.slice(0, 4)}`;
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
