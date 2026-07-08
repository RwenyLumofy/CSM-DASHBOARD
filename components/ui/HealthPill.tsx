import type { HealthScore } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Score dial + tier badge, colored by the resolved tier's own color (which is
 *  admin-defined — see Settings → Workflows → Client health). Compact mode
 *  shows just the number + dot. */
export function HealthPill({ health, size = 44, compact = false }: { health: HealthScore; size?: number; compact?: boolean }) {
  const color = health.tierColor || "#D14B6B";
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - health.score / 100);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-pill" style={{ backgroundColor: color }} />
        <span className="tabular font-body text-sm font-semibold text-fg">{health.score}</span>
        {health.tier && health.tier !== "—" && (
          <span className="whitespace-nowrap font-body text-[12px] font-semibold" style={{ color }}>{health.tier}</span>
        )}
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
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="absolute tabular font-display text-sm font-bold text-fg">{health.score}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 font-body text-[11px] font-semibold leading-none"
          style={{ backgroundColor: `${color}1F`, color }}
        >
          <span className="size-1.5 rounded-pill" style={{ backgroundColor: color }} />
          {health.tier || "—"}
        </span>
        {health.trend !== 0 && (
          <span
            title="Change in the health score (0–100) since the previous calculation"
            className={cn("caption tabular", health.trend > 0 ? "text-[#1E8F61]" : "text-[#B23A57]")}
          >
            {health.trend > 0 ? "▲" : "▼"} {Math.abs(health.trend)} pts
          </span>
        )}
      </div>
    </div>
  );
}
