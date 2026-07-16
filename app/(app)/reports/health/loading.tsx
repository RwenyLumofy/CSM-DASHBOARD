import { Card } from "@/components/ui/Card";

export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading health">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="h-4 w-40 rounded bg-bg-muted" />
        <div className="h-3 w-32 rounded bg-bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <div className="mb-4 h-3 w-24 rounded bg-bg-muted" />
          <div className="size-[132px] rounded-full bg-bg-subtle" />
        </Card>
        <Card>
          <div className="mb-4 h-4 w-44 rounded bg-bg-muted" />
          <div className="mb-4 h-2.5 rounded-pill bg-bg-muted" />
          <div className="mb-4 h-14 rounded bg-bg-subtle" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-3 flex flex-col gap-1.5">
              <div className="h-3 w-32 rounded bg-bg-muted" />
              <div className="h-2 rounded-pill bg-bg-muted" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
