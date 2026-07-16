import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading churn analysis">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="h-4 w-44 rounded bg-bg-muted" />
        <div className="h-3 w-32 rounded bg-bg-muted" />
      </div>
      <Card>
        <div className="mb-5 h-4 w-36 rounded bg-bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <div className="h-3 w-20 rounded bg-bg-muted" />
            <div className="h-2.5 flex-1 rounded-pill bg-bg-muted" />
          </div>
        ))}
        <div className="mt-6 h-20 rounded bg-bg-subtle" />
      </Card>
    </div>
  );
}
