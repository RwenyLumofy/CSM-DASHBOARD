/* Skeleton for the Insights OVERVIEW body only.

   The title, subpage nav and filter bar live in layout.tsx, which renders
   immediately and stays put across this boundary — skeletoning them here would
   double them up and make the nav flicker on every filter change. */

import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading overview">
      {/* headline */}
      <Card>
        <div className="h-4 w-full max-w-[680px] rounded bg-bg-muted" />
        <div className="mt-2 h-4 w-1/2 rounded bg-bg-muted" />
      </Card>

      {/* section heading + period controls */}
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="h-4 w-44 rounded bg-bg-muted" />
        <div className="flex gap-2">
          <div className="h-[31px] w-40 rounded-sm bg-bg-muted" />
          <div className="h-[31px] w-32 rounded-sm bg-bg-muted" />
        </div>
      </div>

      {/* kpis */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-3">
            <div className="h-3 w-28 rounded bg-bg-muted" />
            <div className="h-8 w-20 rounded bg-bg-muted" />
            <div className="h-3 w-32 rounded bg-bg-muted" />
          </Card>
        ))}
      </div>

      {/* waterfall + trend */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card><div className="mb-4 h-3 w-36 rounded bg-bg-muted" /><div className="h-[260px] rounded bg-bg-subtle" /></Card>
        <Card><div className="mb-4 h-3 w-32 rounded bg-bg-muted" /><div className="h-[188px] rounded bg-bg-subtle" /></Card>
      </div>

      {/* movement + at risk */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <div className="mb-4 h-4 w-28 rounded bg-bg-muted" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between border-b border-border-subtle py-3 last:border-0">
                <div className="h-3 w-40 rounded bg-bg-muted" />
                <div className="h-3 w-16 rounded bg-bg-muted" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
