import { ChurnPanel } from "@/components/reports/ChurnPanel";
import { getExecutiveReport } from "@/lib/data";
import { parseFilters } from "@/lib/metrics/exec";

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
  // trendLength 1 / compare "none": this page reads only churnAnalysis, and a
  // 6-period retention loop plus a comparison window would be computed and
  // thrown away.
  const r = await getExecutiveReport({ filters, trendLength: 1, compare: "none" });

  const filtered = r.filteredCount !== r.totalCount;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
        <h2 className="h5">Why we lose accounts</h2>
        <span className="caption tabular">
          {filtered ? (
            <>
              <span className="font-semibold text-fg">{r.filteredCount}</span> of {r.totalCount} accounts · all time
            </>
          ) : (
            <>all {r.totalCount} accounts · all time</>
          )}
        </span>
      </div>

      {r.churnAnalysis.churned === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="caption">No churned accounts match these filters.</p>
        </div>
      ) : (
        <ChurnPanel churn={r.churnAnalysis} currency={r.currency} />
      )}
    </div>
  );
}
