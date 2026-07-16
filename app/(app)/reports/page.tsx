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
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LineChart } from "@/components/ui/charts";
import { Donut } from "@/components/ui/charts";
import { ReportControls } from "@/components/reports/ReportControls";
import { RevenueWaterfall } from "@/components/reports/RevenueWaterfall";
import { getExecutiveReport } from "@/lib/data";
import {
  defaultExecPeriod,
  parseFilters,
  periodDisplay,
  periodInProgress,
  periodProgress,
} from "@/lib/metrics/exec";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Executive · Lumofy Signals" };

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
  const inProgress = periodInProgress(period);
  const progress = inProgress ? periodProgress(period) : null;

  const r = await getExecutiveReport({ period, filters, trendLength: 6 });
  const { retention: cur, previous: prev, portfolio, currency } = r;

  const grossChurnPct = cur.startingArr ? ((cur.churn + cur.contraction) / cur.startingArr) * 100 : 0;
  const prevGrossChurnPct = prev.startingArr ? ((prev.churn + prev.contraction) / prev.startingArr) * 100 : 0;
  const logoRet = cur.logoCount ? ((cur.logoCount - cur.logoChurnCount) / cur.logoCount) * 100 : 0;
  const prevLogoRet = prev.logoCount ? ((prev.logoCount - prev.logoChurnCount) / prev.logoCount) * 100 : 0;

  const trendKeys = r.trend.map((t) => t.period);
  const labelFor = (k: string) => periodDisplay(k);
  const noData = cur.startingArr === 0 && cur.endingArr === 0 && r.filteredCount === 0;

  return (
    <div className="flex flex-col gap-6 p-5 md:p-8">
      <PageHeader
        eyebrow={`Portfolio · ${periodDisplay(period)}`}
        title="Executive report"
        description="Retention, revenue movement, and portfolio health across the ARR base — filterable, and shareable as a link."
      />

      <ReportControls
        period={period}
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
          {/* ---------------- retention headline ---------------- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Net revenue retention"
              value={`${cur.nrr}%`}
              delta={cur.nrr - prev.nrr}
              unit="pp"
              tone={cur.nrr >= 100 ? "good" : "bad"}
              icon={cur.nrr >= 100 ? TrendingUp : TrendingDown}
              sub="incl. expansion, excl. new business"
            />
            <Kpi
              label="Gross revenue retention"
              value={`${cur.grr}%`}
              delta={cur.grr - prev.grr}
              unit="pp"
              tone={cur.grr >= 90 ? "good" : "warn"}
              sub="excl. expansion"
            />
            <Kpi
              label="Gross ARR churn"
              value={`${grossChurnPct.toFixed(1)}%`}
              delta={grossChurnPct - prevGrossChurnPct}
              unit="pp"
              invert
              tone={grossChurnPct > 5 ? "bad" : "good"}
              sub={`${formatCurrency(cur.churn + cur.contraction, currency, { compact: true })} lost`}
            />
            <Kpi
              label="Logo retention"
              value={`${logoRet.toFixed(1)}%`}
              delta={logoRet - prevLogoRet}
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
              <LineChart
                months={trendKeys}
                formatShort={labelFor}
                formatLong={labelFor}
                height={188}
                series={[
                  { label: "NRR %", color: "var(--color-sirius)", points: r.trend.map((t) => ({ month: t.period, value: t.nrr })) },
                  { label: "GRR %", color: "var(--color-success)", points: r.trend.map((t) => ({ month: t.period, value: t.grr })) },
                ]}
              />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-4">
                <MiniStat label="Expansion" value={formatCurrency(cur.expansion, currency, { compact: true })} tone="good" />
                <MiniStat label="Contraction" value={formatCurrency(cur.contraction, currency, { compact: true })} tone="warn" />
                <MiniStat label="New business" value={formatCurrency(r.newBusiness, currency, { compact: true })} tone="accent" />
              </div>
            </Card>
          </div>

          {/* ---------------- portfolio health ---------------- */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.4fr]">
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
            </Card>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
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
              <Kpi
                label="Average health"
                value={String(portfolio.avgHealth)}
                icon={HeartPulse}
                tone={portfolio.avgHealth >= 75 ? "good" : portfolio.avgHealth >= 55 ? "warn" : "bad"}
                sub={`${r.healthSplit.healthy} healthy · ${r.healthSplit.watch} watch`}
              />
              <Kpi
                label="Accounts at risk"
                value={String(r.healthSplit.atRisk)}
                icon={AlertTriangle}
                tone={r.healthSplit.atRisk > 0 ? "bad" : "good"}
                sub={`${portfolio.openTickets} open tickets across book`}
              />
            </div>
          </div>

          {/* ---------------- movement detail ---------------- */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ListCard
              eyebrow="Contraction"
              title="Downgrades"
              count={r.downgrades.length}
              tone="stellar"
              empty="No downgrades — no account's ARR fell this period."
            >
              {r.downgrades.map(({ client, delta }) => (
                <Row key={client.id} href={`/clients/${client.id}`} name={client.name}>
                  <span className="caption tabular hidden sm:inline">
                    {formatCurrency(client.previousArr, currency, { compact: true })} →{" "}
                    {formatCurrency(client.arr, currency, { compact: true })}
                  </span>
                  <span className="tabular font-body text-sm font-semibold text-warning-fg">
                    {formatCurrency(delta, currency, { compact: true })}
                  </span>
                </Row>
              ))}
            </ListCard>

            <ListCard
              eyebrow="Lost accounts"
              title="Churn"
              count={r.churned.length}
              tone="nova"
              empty={`No accounts churned in ${periodDisplay(period)}.`}
            >
              {r.churned.map(({ client, arrLost, date }) => (
                <Row key={client.id} href={`/clients/${client.id}`} name={client.name}>
                  <span className="caption hidden sm:inline">{client.csm?.name ?? "Unassigned"}</span>
                  <span className="caption tabular">{date}</span>
                  <span className="tabular font-body text-sm font-semibold text-danger-fg">
                    −{formatCurrency(arrLost, currency, { compact: true })}
                  </span>
                </Row>
              ))}
            </ListCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

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
  unit = "",
  tone = "neutral",
  invert = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
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
            title={`vs previous period`}
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

function ListCard({
  eyebrow,
  title,
  count,
  tone,
  empty,
  children,
}: {
  eyebrow: string;
  title: string;
  count: number;
  tone: "stellar" | "nova";
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <CardEyebrow>{eyebrow}</CardEyebrow>
          <h3 className="h5">{title}</h3>
        </div>
        <Badge tone={count === 0 ? "neutral" : tone}>{count}</Badge>
      </div>
      {count === 0 ? (
        <div className="flex items-center gap-2 rounded-md bg-bg-subtle px-3 py-4">
          <p className="caption">{empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
    </Card>
  );
}

function Row({ href, name, children }: { href: string; name: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0">
      <Link href={href} className="truncate font-body text-sm font-semibold text-fg transition-colors hover:text-sirius">
        {name}
      </Link>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </li>
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
