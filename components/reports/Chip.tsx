import { cn } from "@/lib/cn";

/* One status chip for the whole Insights page, so every label — renewal
   attention, concentration classification, anything else — reads identically.

   Outline, not filled: calmer against the cards, and it keeps colour meaning
   consistent instead of two panels inventing their own chip styles. The tone
   scale IS the page's semantic-colour rule:

     danger   critical / a realized loss        (churn, critical renewal)
     warning  caution that needs attention       (needs attention, adoption gap)
     accent   an opportunity / potential         (expansion signal)
     neutral  a structural fact, not an alarm     (concentration risk, monitor)
     muted    a non-finding                       (balanced)
     nodata   missing data, named as missing      (no usage data, data needed)
*/
export type ChipTone = "danger" | "warning" | "accent" | "neutral" | "muted" | "nodata";

const TONE: Record<ChipTone, string> = {
  danger: "border-danger-fg/45 text-danger-fg",
  warning: "border-warning-fg/45 text-warning-fg",
  accent: "border-sirius/45 text-sirius",
  neutral: "border-border-strong text-fg-muted",
  muted: "border-border-subtle text-fg-subtle",
  nodata: "border-dashed border-border-strong text-fg-subtle",
};

export function Chip({ tone, className, children }: { tone: ChipTone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-md border px-2 py-0.5 font-body text-[10.5px] font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
