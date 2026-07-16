/* /reports runs the heaviest query set in the app (full clients + arr_events,
   then a 6-period retention loop). Without a boundary the nav click left the
   previous page frozen until the server responded. Mirrors the real layout so
   the swap doesn't jump. */

import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6 p-5 md:p-8" aria-busy="true" aria-label="Loading executive report">
      {/* header */}
      <div className="flex flex-col gap-2">
        <div className="h-3 w-32 rounded bg-bg-muted" />
        <div className="h-8 w-64 rounded bg-bg-muted" />
        <div className="h-3 w-96 max-w-full rounded bg-bg-muted" />
      </div>

      {/* controls */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="h-8 w-44 rounded-sm bg-bg-muted" />
          <div className="h-8 w-40 rounded-sm bg-bg-muted" />
        </div>
        <div className="h-12 rounded-lg bg-bg-subtle" />
      </div>

      {/* kpi row */}
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
        <Card>
          <div className="mb-4 h-3 w-36 rounded bg-bg-muted" />
          <div className="h-[260px] rounded bg-bg-subtle" />
        </Card>
        <Card>
          <div className="mb-4 h-3 w-32 rounded bg-bg-muted" />
          <div className="h-[188px] rounded bg-bg-subtle" />
        </Card>
      </div>

      {/* lists */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <div className="mb-4 h-4 w-24 rounded bg-bg-muted" />
            {Array.from({ length: 4 }).map((_, j) => (
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
