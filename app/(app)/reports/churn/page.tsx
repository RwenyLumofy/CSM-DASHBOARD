import { ChurnPanel } from "@/components/reports/ChurnPanel";
import { PeriodControls } from "@/components/reports/PeriodControls";
import { getExecutiveReport } from "@/lib/data";
import { parseCompare, parseFilters, periodDisplay } from "@/lib/metrics/exec";
import { ALL_TIME } from "@/lib/metrics/arr";

export const metadata = { title: "Churn · Insights · Lumofy Signals" };

/**
 * Churn — its own subpage, not a panel on the quarterly report.
 *
 * It runs on a different clock. Overview answers "how did Q2 go"; this answers
 * "who do we lose, and why" — a slow-moving structural question you'd review
 * once a quarter at most. Sitting it mid-Overview made it a category error: an
 * all-time analysis inside a period report, with a period selector above it that
 * did nothing to it.
 *
 * It DOES follow the shared filters from the layout (pick a CSM and every rate
 * recomputes for their book), which is why they live in the layout and the
 * period control doesn't.
 */
export default async function ChurnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // Defaults to ALL TIME — churn patterns usually want the whole history — but
  // it's a default, not a law. The picker is the same one Overview uses.
  const periodRaw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period = periodRaw || ALL_TIME;
  const compare = parseCompare(sp.compare);
  // trendLength 1: this page reads only churnAnalysis, so a 6-period retention
  // loop would be computed and thrown away.
  const r = await getExecutiveReport({ period, filters, trendLength: 1, compare });

  const filtered = r.filteredCount !== r.totalCount;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="h5">Why we lose accounts</h2>
          <span className="tabular font-body text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            {periodDisplay(period)}
            {filtered && ` · ${r.filteredCount} of ${r.totalCount} accounts`}
          </span>
        </div>
        <PeriodControls period={period} compare={compare} />
      </div>

      {r.churnAnalysis.churned === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="caption">No churned accounts match these filters.</p>
        </div>
      ) : (
        <ChurnPanel churn={r.churnAnalysis} currency={r.currency} params={sp} />
      )}
    </div>
  );
}
