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
  const accentText: Record<string, string> = {
    sirius: "text-sirius bg-sirius-50",
    aurora: "text-[#1E8F61] bg-[#E6F9EF]",
    stellar: "text-[#8A6A0A] bg-[#FBF6E0]",
    nova: "text-[#B23A57] bg-[#FBE7ED]",
    eclipse: "text-[#6E3FCC] bg-[#F0E6FF]",
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
        <span className="tabular font-display text-3xl font-bold leading-none text-fg">{value}</span>
        {delta && (
          <span
            className={cn(
              "tabular mb-0.5 text-xs font-semibold",
              deltaTone === "up" && "text-[#1E8F61]",
              deltaTone === "down" && "text-[#B23A57]",
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
