import type { HealthScore, HealthTier } from "@/lib/types";
import { tierLabel, tierTone } from "@/lib/metrics/health";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const RING: Record<HealthTier, string> = {
  healthy: "text-[#2DB47A]",
  watch: "text-[#C99A14]",
  at_risk: "text-[#D14B6B]",
};

/** Score dial + tier badge. Compact mode shows just the number + dot. */
export function HealthPill({ health, size = 44, compact = false }: { health: HealthScore; size?: number; compact?: boolean }) {
  const tone = tierTone(health.tier);
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - health.score / 100);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={cn("size-2 rounded-pill", health.tier === "healthy" ? "bg-[#2DB47A]" : health.tier === "watch" ? "bg-[#C99A14]" : "bg-[#D14B6B]")} />
        <span className="tabular font-body text-sm font-semibold text-fg">{health.score}</span>
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-muted)" strokeWidth={3} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className={RING[health.tier]}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute tabular font-display text-sm font-bold text-fg">{health.score}</span>
      </div>
      <div className="flex flex-col gap-1">
        <Badge tone={tone} dot>
          {tierLabel(health.tier)}
        </Badge>
        {health.trend !== 0 && (
          <span className={cn("caption tabular", health.trend > 0 ? "text-[#1E8F61]" : "text-[#B23A57]")}>
            {health.trend > 0 ? "▲" : "▼"} {Math.abs(health.trend)} pts
          </span>
        )}
      </div>
    </div>
  );
}
