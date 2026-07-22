import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";

/* A highlighted time-context pill for chart headers and the forward outlook.
   The period/date labels were plain grey text and easy to skim past; a reader
   should never be unsure which dates a chart covers. Calendar icon + a bordered
   tint makes the time context the one thing that stands out top-right. */
export function DateTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-bg-subtle px-2 py-1 font-body text-[11px] font-semibold text-fg-muted",
        className,
      )}
    >
      <CalendarDays size={12} strokeWidth={2} className="text-fg-subtle" aria-hidden />
      {children}
    </span>
  );
}
