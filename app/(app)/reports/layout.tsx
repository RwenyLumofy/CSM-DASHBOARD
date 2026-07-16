import { InsightsNav } from "@/components/reports/InsightsNav";


/* =========================================================================
   Insights shell — title, subpage nav, and the shared filter bar.

   Title and nav only. The controls — dates AND filters — live on each PAGE,
   together in one bar (see InsightsControls).

   Filters were here originally, on the reasoning that they're universal while a
   period is per-page. True on both counts, and still the wrong call: it put the
   filter bar top-right and the date picker down in a section header, so scoping
   the data — one thought — meant reaching into two corners of the screen.

   A layout also can't read searchParams, which made everything page-specific
   awkward here anyway: the "N of M accounts" readout had no way to know what was
   filtered.
   ========================================================================= */

export const dynamic = "force-dynamic";

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="h2">Insights</h1>
        <InsightsNav />
      </div>
      {children}
    </div>
  );
}
