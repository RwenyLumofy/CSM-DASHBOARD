import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  sub,
  delta,
  deltaTone,
  icon: Icon,
  accent = "sirius",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  icon?: LucideIcon;
  accent?: "sirius" | "aurora" | "stellar" | "nova" | "eclipse";
}) {
  // Semantic status tokens rather than inlined light-mode hex, so the icon chip
  // re-themes under [data-theme="dark"]. Same colours in light mode.
  const accentText: Record<string, string> = {
    sirius: "text-info-fg bg-info-bg",
    aurora: "text-success-fg bg-success-bg",
    stellar: "text-warning-fg bg-warning-bg",
    nova: "text-danger-fg bg-danger-bg",
    eclipse: "text-eclipse-fg bg-eclipse-bg",
  };
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {Icon && (
          <span className={cn("grid size-8 place-items-center rounded-md", accentText[accent])}>
            <Icon size={16} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="tabular font-display text-3xl font-bold leading-none tracking-tight text-fg">{value}</span>
        {delta && (
          <span
            className={cn(
              "tabular mb-0.5 text-xs font-semibold",
              deltaTone === "up" && "text-success-fg",
              deltaTone === "down" && "text-danger-fg",
              (!deltaTone || deltaTone === "flat") && "text-fg-subtle",
            )}
          >
            {delta}
          </span>
        )}
      </div>
      {sub && <span className="caption">{sub}</span>}
    </Card>
  );
}
