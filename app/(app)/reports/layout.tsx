import { InsightsNav } from "@/components/reports/InsightsNav";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { getFilterOptions } from "@/lib/data";

/* =========================================================================
   Insights shell — title, subpage nav, and the shared filter bar.

   Filters live HERE because they're the one universal control: "Zainab's
   enterprise accounts" is a meaningful lens on the quarterly report, on
   all-time churn, and on any coverage audit added later. The PERIOD control
   does NOT live here — each subpage owns its clock, and a page that's all-time
   or as-of-today must not show a selector it would ignore. That was exactly the
   bug in the page-level "compare" control: it sat above eight panels and
   governed two.

   THE CONSTRAINT: a Next.js layout does not receive searchParams. So the layout
   supplies only what needs the DB — the filter OPTIONS — and ReportFilters (a
   client component) reads the active values from the URL itself.

   The "N of M accounts" readout deliberately is NOT here. It's page-specific
   truth: on Overview it means accounts in the filtered book, on Churn it would
   mean something else entirely. A layout can't compute it without searchParams,
   and faking it with an unfiltered count would render "131 of 131" while the
   page below showed 51. Each page states its own.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  // Only the OPTIONS need the DB, and source() is request-memoized — this shares
  // the page's single load of clients+arr_events rather than querying twice.
  const options = await getFilterOptions();

  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <h1 className="h2">Insights</h1>
      <InsightsNav />
      <ReportFilters options={options} />
      {children}
    </div>
  );
}
