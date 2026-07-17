import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  HeartPulse,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { AtRiskPanel } from "@/components/reports/AtRiskPanel";
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

      {noData ? (
        <EmptyReport />
      ) : (
        <>
          {/* ============ 1. How did the period go? ============
              The period + compare controls live HERE, in the section they
              actually govern — not in the page header above eight panels they
              can't touch. That's Stripe's pattern, and it's what makes the
              "compared to" promise honest. */}
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
                trend={r.trend.map((t) => ({ period: t.period, nrr: t.nrr, grr: t.grr }))}
                compareTrend={r.compareTrend?.map((t) => ({ period: t.period, nrr: t.nrr, grr: t.grr })) ?? null}
                comparePeriod={r.comparison.period}
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
          <Section title="The shape of the book" when="as of today · follows your filters" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.15fr]">
            <div className="grid h-fit grid-cols-2 gap-4">
              <Kpi
                label="Total ARR"
                value={formatCurrency(portfolio.totalArr, currency, { compact: true })}
                icon={Wallet}
                tone="accent"
                sub={`${portfolio.totalClients} active accounts →`}
                href="/clients"
              />
              <Kpi
                label="Up for renewal"
                value={formatCurrency(portfolio.arrUpForRenewal90d, currency, { compact: true })}
                icon={CalendarClock}
                tone={portfolio.renewalsNext90d > 0 ? "warn" : "neutral"}
                sub={`${portfolio.renewalsNext90d} accounts · next 90 days`}
              />
              <Kpi
                label="Average health"
                value={String(portfolio.avgHealth)}
                icon={HeartPulse}
                tone={portfolio.avgHealth >= 75 ? "good" : portfolio.avgHealth >= 55 ? "warn" : "bad"}
                sub={`${r.healthSplit.atRisk} at risk · why? →`}
                href="/reports/health"
              />
              <Kpi
                label="Open tickets"
                value={String(portfolio.openTickets)}
                icon={AlertTriangle}
                tone={portfolio.openTickets > 20 ? "warn" : "neutral"}
                sub="across the filtered book"
              />
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
  href,
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
  /** Where this number lives as a LIST. Omitted when there isn't one — a fake
   *  link is worse than none. */
  href?: string;
}) {
  const d = delta ?? 0;
  const flat = delta == null || Math.abs(d) < 0.05;
  const positive = invert ? d < 0 : d > 0;
  const DeltaIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
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
    </>
  );

  // A KPI that maps onto a real list becomes a link; one that doesn't stays a
  // card. Interactive styling only where something actually happens.
  return href ? (
    <Card interactive className="flex flex-col gap-3 transition-colors hover:border-sirius-200">
      <Link href={href} className="flex flex-col gap-3">
        {body}
      </Link>
    </Card>
  ) : (
    <Card className="flex flex-col gap-3">{body}</Card>
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
