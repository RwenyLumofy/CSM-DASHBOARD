import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Donut } from "@/components/ui/charts";
import { AtRiskPanel } from "@/components/reports/AtRiskPanel";
import { Headline } from "@/components/reports/Headline";
import { ConcentrationPanel } from "@/components/reports/ConcentrationPanel";
import { MovementPanel } from "@/components/reports/MovementPanel";
import { ReportControls } from "@/components/reports/ReportControls";
import { RetentionTrend } from "@/components/reports/RetentionTrend";
import { RevenueWaterfall } from "@/components/reports/RevenueWaterfall";
import { getExecutiveReport } from "@/lib/data";
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

  const r = await getExecutiveReport({ period, filters, trendLength: 6, compare });
  const { retention: cur, previous: prev, portfolio, currency } = r;

  // Deltas are only meaningful when a comparison period exists (compare="none"
  // → prev is null → every tile renders without a delta chip).
  const pctOf = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
  const grossChurnPct = pctOf(cur.churn + cur.contraction, cur.startingArr);
  const logoRet = cur.logoCount ? ((cur.logoCount - cur.logoChurnCount) / cur.logoCount) * 100 : 0;
  const d = prev
    ? {
        nrr: cur.nrr - prev.nrr,
        grr: cur.grr - prev.grr,
        churn: grossChurnPct - pctOf(prev.churn + prev.contraction, prev.startingArr),
        logo:
          logoRet - (prev.logoCount ? ((prev.logoCount - prev.logoChurnCount) / prev.logoCount) * 100 : 0),
      }
    : null;
  const vs = r.comparison.period ? `vs ${periodDisplay(r.comparison.period)}` : undefined;
  const headline = buildHeadline(r);

  const noData = cur.startingArr === 0 && cur.endingArr === 0 && r.filteredCount === 0;

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      {/* Compact: the eyebrow used to read "Portfolio · Q3 2026" six inches from
          a period navigator saying "Q3 2026", and the description restated the
          title. Both gone — the headline below carries the actual news. */}
      <h1 className="h2">Insights</h1>

      <ReportControls
        period={period}
        compare={compare}
        options={r.options}
        filteredCount={r.filteredCount}
        totalCount={r.totalCount}
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

      {noData ? (
        <EmptyReport />
      ) : (
        <>
          {/* The sentence the whole page is evidence for. */}
          <Headline data={headline} currency={currency} />

          {/* ============ 1. How did the period go? ============ */}
          <Section title="How the book performed" when={periodDisplay(period)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Net revenue retention"
              value={`${cur.nrr}%`}
              delta={d?.nrr}
              vs={vs}
              unit="pp"
              tone={cur.nrr >= 100 ? "good" : "bad"}
              icon={cur.nrr >= 100 ? TrendingUp : TrendingDown}
              sub="incl. expansion, excl. new business"
            />
            <Kpi
              label="Gross revenue retention"
              value={`${cur.grr}%`}
              delta={d?.grr}
              vs={vs}
              unit="pp"
              tone={cur.grr >= 90 ? "good" : "warn"}
              sub="excl. expansion"
            />
            <Kpi
              label="Gross ARR churn"
              value={`${grossChurnPct.toFixed(1)}%`}
              delta={d?.churn}
              vs={vs}
              unit="pp"
              invert
              tone={grossChurnPct > 5 ? "bad" : "good"}
              sub={`${formatCurrency(cur.churn + cur.contraction, currency, { compact: true })} lost`}
            />
            <Kpi
              label="Logo retention"
              value={`${logoRet.toFixed(1)}%`}
              delta={d?.logo}
              vs={vs}
              unit="pp"
              tone={logoRet >= 90 ? "good" : "warn"}
              sub={`${cur.logoChurnCount} of ${cur.logoCount} churned`}
            />
          </div>

          {/* ---------------- waterfall + trend ---------------- */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card>
              <div className="mb-1 flex items-start justify-between gap-4">
                <div>
                  <CardEyebrow>Revenue movement</CardEyebrow>
                  <h3 className="h5">ARR waterfall · {periodDisplay(period)}</h3>
                </div>
                <div className="text-right">
                  <div className="tabular font-display text-xl font-bold leading-none text-fg">
                    {formatCurrency(r.closingArr, currency, { compact: true })}
                  </div>
                  <div className="caption mt-1">closing ARR</div>
                </div>
              </div>
              <RevenueWaterfall
                startingArr={cur.startingArr}
                expansion={cur.expansion}
                contraction={cur.contraction}
                churn={cur.churn}
                newBusiness={r.newBusiness}
                currency={currency}
              />
            </Card>

            <Card>
              <CardEyebrow>Trend · last {r.trend.length} periods</CardEyebrow>
              <h3 className="h5 mb-4">Retention over time</h3>
              {/* Plain serializable rows only — the formatter functions live
                  inside RetentionTrend, on the client. */}
              <RetentionTrend trend={r.trend.map((t) => ({ period: t.period, nrr: t.nrr, grr: t.grr }))} />
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
          <Section title="What changed" when={`${periodDisplay(period)} · usage ${monthName(r.usageMonth)}`} />
          <MovementPanel movements={r.movements} currency={currency} period={period} usageMonth={r.usageMonth} />

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
          <Section title="The shape of the book" when="point-in-time" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.15fr]">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <Kpi
                  label="Total ARR"
                  value={formatCurrency(portfolio.totalArr, currency, { compact: true })}
                  icon={Wallet}
                  tone="accent"
                  sub={`${portfolio.totalClients} active accounts`}
                />
                <Kpi
                  label="Up for renewal"
                  value={formatCurrency(portfolio.arrUpForRenewal90d, currency, { compact: true })}
                  icon={CalendarClock}
                  tone={portfolio.renewalsNext90d > 0 ? "warn" : "neutral"}
                  sub={`${portfolio.renewalsNext90d} accounts · next 90 days`}
                />
              </div>
              <Card>
                <CardEyebrow>Portfolio</CardEyebrow>
                <h3 className="h5 mb-4">Health distribution</h3>
                <Donut
                  size={124}
                  centerLabel={String(portfolio.avgHealth)}
                  centerSub="avg score"
                  segments={[
                    { label: "Healthy", value: r.healthSplit.healthy, color: "var(--color-success)" },
                    { label: "Watch", value: r.healthSplit.watch, color: "var(--color-warning)" },
                    { label: "At risk", value: r.healthSplit.atRisk, color: "var(--color-danger)" },
                  ]}
                />
                <p className="caption mt-4 border-t border-border-subtle pt-3">
                  Point-in-time. Health is overwritten on each recompute, so there is no history behind this yet —
                  unlike usage, it can&apos;t show movement.
                </p>
              </Card>
            </div>

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

function monthName(ym: string): string {
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(ym.slice(5, 7))] ?? ym} ${ym.slice(0, 4)}`;
}

type Tone = "good" | "warn" | "bad" | "accent" | "neutral";

const TONE_CHIP: Record<Tone, string> = {
  good: "bg-success-bg text-success-fg",
  warn: "bg-warning-bg text-warning-fg",
  bad: "bg-danger-bg text-danger-fg",
  accent: "bg-sirius-50 text-sirius-600",
  neutral: "bg-bg-muted text-fg-muted",
};

/** A KPI tile with a period-over-period delta.
 *  `invert` flips the good/bad colouring for metrics where DOWN is good
 *  (churn): a −2pp move in churn is a win, not a loss. */
function Kpi({
  label,
  value,
  sub,
  delta,
  vs,
  unit = "",
  tone = "neutral",
  invert = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Undefined = no comparison selected; the delta chip is omitted entirely. */
  delta?: number;
  /** Spelled-out comparison target for the chip's tooltip, e.g. "vs Q1 2026". */
  vs?: string;
  unit?: string;
  tone?: Tone;
  invert?: boolean;
  icon?: typeof TrendingUp;
}) {
  const d = delta ?? 0;
  const flat = delta == null || Math.abs(d) < 0.05;
  const positive = invert ? d < 0 : d > 0;
  const DeltaIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", TONE_CHIP[tone])}>
            <Icon size={16} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="tabular font-display text-[30px] font-bold leading-none tracking-tight text-fg">{value}</span>
        {delta != null && (
          <span
            className={cn(
              "tabular mb-1 inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-[11px] font-semibold",
              flat ? "bg-bg-muted text-fg-subtle" : positive ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg",
            )}
            title={vs ?? "vs comparison period"}
          >
            <DeltaIcon size={11} strokeWidth={2.5} aria-hidden />
            {flat ? "flat" : `${Math.abs(d).toFixed(1)}${unit}`}
          </span>
        )}
      </div>
      {sub && <span className="caption">{sub}</span>}
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
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
