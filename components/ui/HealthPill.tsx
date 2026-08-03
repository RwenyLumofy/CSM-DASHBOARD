import type { HealthScore } from "@/lib/types";
import { cn } from "@/lib/cn";
import { isAssessed, NOT_ASSESSED_LABEL } from "@/lib/metrics/health-evidence";

/** Score dial + tier badge, colored by the resolved tier's own color (which is
 *  admin-defined — see Settings → Workflows → Client health). Compact mode
 *  shows just the number + dot.
 *
 *  Every health surface renders through here, which is why the unassessed case
 *  is handled at this level rather than in each caller — a number shown in one
 *  place and withheld in another would be worse than always showing it. */
export function HealthPill({ health, size = 44, compact = false }: { health: HealthScore; size?: number; compact?: boolean }) {
  /* Nothing behind this score came from the customer — it was computed purely
     from how completely we filled Signal in. Showing the number anyway is how
     an account with no evidence at all read as "Healthy, 76". */
  if (!isAssessed(health)) {
    return (
      <span
        title="No customer signal yet — no usage, survey, support or CS Pulse data for this account. The score would only reflect how completely its Signal record is filled in."
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-pill border border-dashed border-border px-2.5 py-1 font-body font-semibold leading-none text-fg-subtle",
          compact ? "text-[12px]" : "text-[11px]",
        )}
      >
        <span className="size-1.5 rounded-pill bg-fg-subtle/50" />
        {NOT_ASSESSED_LABEL}
      </span>
    );
  }

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
