import { PeriodControls } from "@/components/reports/PeriodControls";
import { ReportFilters } from "@/components/reports/ReportFilters";
import type { CompareMode, FilterOptions } from "@/lib/metrics/exec";

/* =========================================================================
   One control bar per page: dates and filters, side by side.

   They were split — filters top-right in the layout, the period down in a
   section header — on the reasoning that filters are universal while a period
   is per-page. Both halves were individually defensible and the result was
   still wrong: two control zones for one job. Scoping the data is a single
   thought ("Zainab's enterprise accounts, last quarter"), and it shouldn't be
   assembled from opposite corners of the screen.

   So the bar lives on the PAGE, not the layout, which also means each page
   states its own controls honestly:
     Overview → dates + compare + filters
     Churn    → dates + compare + filters (all time is just a date option)
     Health   → filters only; health has no history, so a date picker there
                would be a control that does nothing.

   The cost of pulling filters out of the layout is that each page renders them
   — but options come from getFilterOptions(), which shares source()'s
   request-memoized load, so it's a prop, not a query.

   The panels that DON'T follow the selected period (at-risk looks forward 90
   days; concentration is as-of-today) still say so in their own section
   headings. The control bar is one place; the clock is still stated per
   section, which is what stops "compared to Q1" from silently implying it
   governs a forward-looking panel.
   ========================================================================= */

export function InsightsControls({
  options,
  period,
  compare,
  /** Why this page has no date control. Only set where that's a real limit
   *  rather than an oversight — saying nothing would read as a missing feature. */
  noPeriodReason,
  /** Right-hand READOUTS — what the chosen scope says (the account count, the
   *  summary popover). Controls left, readouts right, one row: the alternative
   *  was a lone summary pill floating below the bar, anchored to nothing. */
  readout,
}: {
  options: FilterOptions;
  period?: string;
  compare?: CompareMode;
  noPeriodReason?: string;
  readout?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-subtle bg-bg-subtle px-2.5 py-2">
      {period && compare ? (
        <>
          <PeriodControls period={period} compare={compare} />
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
        </>
      ) : noPeriodReason ? (
        <>
          <span className="caption px-0.5">{noPeriodReason}</span>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
        </>
      ) : null}
      <ReportFilters options={options} />
      {readout && <div className="ml-auto flex items-center gap-2.5">{readout}</div>}
    </div>
  );
}
