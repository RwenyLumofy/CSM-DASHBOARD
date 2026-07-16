import { HealthDragPanel } from "@/components/reports/HealthDragPanel";
import { Donut } from "@/components/ui/charts";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { InsightsControls } from "@/components/reports/InsightsControls";
import { getExecutiveReport, getFilterOptions } from "@/lib/data";
import { parseFilters } from "@/lib/metrics/exec";

export const metadata = { title: "Health · Insights · Lumofy Signals" };

/**
 * Health — the score, and why it's that number.
 *
 * Off Overview deliberately. A board asks whether health is MOVING, not why
 * it's 67; the decomposition is a diagnostic about the scoring configuration
 * (whose builder lives in Settings → Workflows → Client health), and it answers
 * a question you ask once and then act on. Sitting mid-Overview it was a
 * permanent fixture doing a one-time job.
 *
 * As-of-today, and it follows the shared filters — health has no history, so
 * unlike usage it cannot show movement. That's why the nav labels this page
 * "as of today" rather than leaving each card to explain itself.
 */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // This page reads healthDrag + the health split only — no retention trend, no
  // comparison window, so don't compute them.
  const [r, options] = await Promise.all([
    getExecutiveReport({ filters, trendLength: 1, compare: "none" }),
    getFilterOptions(),
  ]);

  const filtered = r.filteredCount !== r.totalCount;
  const live = r.healthSplit.healthy + r.healthSplit.watch + r.healthSplit.atRisk;

  return (
    <div className="flex flex-col gap-5">
      {/* No date control, and the reason is stated rather than left as an
          apparent oversight: health is overwritten on each recompute, so there
          is no history to select a period from. */}
      <InsightsControls
        options={options}
        noPeriodReason="As of today — health has no history to filter by"
        readout={
          <span className="caption tabular whitespace-nowrap">
            {filtered ? (
              <>
                <span className="font-semibold text-fg">{r.filteredCount}</span> of {r.totalCount} accounts
              </>
            ) : (
              <>
                <span className="font-semibold text-fg">{live}</span> live accounts
              </>
            )}
          </span>
        }
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
        <h2 className="h5">Portfolio health</h2>
        <span className="tabular font-body text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          churned excluded
        </span>
      </div>

      {live === 0 ? (
        <Card className="py-12 text-center">
          <p className="caption">No live accounts match these filters.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
          <Card className="h-fit">
            <CardEyebrow>Distribution</CardEyebrow>
            <h3 className="h5 mb-4">Where accounts sit</h3>
            <Donut
              size={132}
              centerLabel={String(r.portfolio.avgHealth)}
              centerSub="avg score"
              segments={[
                { label: "Healthy", value: r.healthSplit.healthy, color: "var(--color-success)" },
                { label: "Watch", value: r.healthSplit.watch, color: "var(--color-warning)" },
                { label: "At risk", value: r.healthSplit.atRisk, color: "var(--color-danger)" },
              ]}
            />
            <p className="caption mt-4 border-t border-border-subtle pt-3">
              Bands are fixed at 75 / 55 rather than the admin&apos;s tier names, so this stays comparable when tiers are
              renamed in Settings.
            </p>
            <p className="caption mt-2 text-fg-subtle">
              Point-in-time: health is overwritten on each recompute, so there&apos;s no history behind this — unlike
              usage, it can&apos;t show movement yet.
            </p>
          </Card>

          <HealthDragPanel drag={r.healthDrag} />
        </div>
      )}
    </div>
  );
}
