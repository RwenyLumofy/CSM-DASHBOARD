import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, MoonStar, Sparkles, TrendingDown, XCircle } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Movement, MovementKind } from "@/lib/metrics/movement";
import { formatCurrency } from "@/lib/format";
import { periodDisplay } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

/* "What changed" — the centre of the page.
   Replaces the two separate Downgrades and Churn cards. Those split one idea in
   half and stripped out the leading indicator: an account whose usage collapsed
   but whose ARR hasn't moved *yet* is the one you can still save, and neither
   card could show it. Ranked by ARR at stake, because a $181k account sliding is
   not the same event as a $312 one. */

const KIND: Record<MovementKind, { label: string; icon: typeof XCircle; tone: string; dot: string }> = {
  churned: { label: "Churned", icon: XCircle, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger" },
  downgraded: { label: "Downgraded", icon: ArrowDownRight, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning" },
  usage_dormant: { label: "Went dormant", icon: MoonStar, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger" },
  usage_declined: { label: "Usage falling", icon: TrendingDown, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning" },
  expanded: { label: "Expanded", icon: ArrowUpRight, tone: "text-success-fg bg-success-bg", dot: "bg-success" },
  new: { label: "New business", icon: Sparkles, tone: "text-info-fg bg-info-bg", dot: "bg-info" },
};

// Revenue first, then leading indicators, then good news — the order a CSM
// triages in.
const ORDER: MovementKind[] = ["churned", "downgraded", "usage_dormant", "usage_declined", "expanded", "new"];

export function MovementPanel({
  movements,
  currency,
  period,
  usageMonth,
  limit = 12,
}: {
  movements: Movement[];
  currency: string;
  period: string;
  usageMonth: string;
  limit?: number;
}) {
  const counts = new Map<MovementKind, number>();
  for (const m of movements) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const shown = movements.slice(0, limit);
  const hidden = movements.length - shown.length;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardEyebrow>Accounts that moved</CardEyebrow>
          <h3 className="h5">What changed</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ORDER.filter((k) => counts.get(k)).map((k) => {
            const K = KIND[k];
            return (
              <span
                key={k}
                className={cn("inline-flex items-center gap-1.5 rounded-pill px-2 py-1 font-body text-[11px] font-semibold", K.tone)}
              >
                <span className={cn("size-1.5 rounded-pill", K.dot)} />
                {counts.get(k)} {K.label.toLowerCase()}
              </span>
            );
          })}
        </div>
      </div>

      {movements.length === 0 ? (
        <div className="rounded-md bg-bg-subtle px-3 py-6 text-center">
          <p className="caption">Nothing moved in {periodDisplay(period)} — no churn, no downgrades, no usage slides.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col">
            {shown.map((m) => {
              const K = KIND[m.kind];
              const Icon = K.icon;
              const declining = m.kind === "churned" || m.kind === "downgraded" || m.kind === "usage_dormant" || m.kind === "usage_declined";
              return (
                <li
                  key={`${m.client.id}-${m.kind}`}
                  className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0"
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", K.tone)}>
                    <Icon size={14} strokeWidth={2} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clients/${m.client.id}`}
                      className="block truncate font-body text-sm font-semibold text-fg transition-colors hover:text-sirius"
                    >
                      {m.client.name}
                    </Link>
                    <span className="caption block truncate">
                      {m.note}
                      {m.client.csm?.name ? ` · ${m.client.csm.name}` : ""}
                    </span>
                  </div>

                  {/* min={0} so bar heights are comparable down the column —
                      self-scaling would make a 3→2 wobble look like a cliff. */}
                  {m.usage && m.usage.series.length > 1 && (
                    <Sparkline
                      data={m.usage.series.map((s) => s.mau)}
                      min={0}
                      width={64}
                      height={22}
                      color={declining ? "var(--color-danger)" : "var(--color-success)"}
                      className="hidden shrink-0 sm:block"
                    />
                  )}

                  <div className="w-24 shrink-0 text-right">
                    {m.arrDelta !== 0 ? (
                      <span
                        className={cn(
                          "tabular block font-body text-sm font-semibold",
                          m.arrDelta > 0 ? "text-success-fg" : "text-danger-fg",
                        )}
                      >
                        {m.arrDelta > 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(m.arrDelta), currency, { compact: true })}
                      </span>
                    ) : (
                      // Usage moved, revenue hasn't — yet. Showing the ARR at
                      // stake rather than a "0" makes the exposure legible.
                      <span className="tabular block font-body text-sm font-semibold text-fg-muted">
                        {formatCurrency(m.arrAtStake, currency, { compact: true })}
                      </span>
                    )}
                    <span className="caption block">{m.arrDelta !== 0 ? "ARR" : "at stake"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {hidden > 0 && <p className="caption mt-3">+ {hidden} more</p>}
        </>
      )}

      <p className="caption mt-4 border-t border-border-subtle pt-3">
        Revenue movement is {periodDisplay(period)}, off the ARR ledger — the same source as the waterfall, so the two
        always agree. Usage movement compares {monthLabel(usageMonth)} against the month before it (usage history is
        monthly, so it can&apos;t follow a part-quarter).
      </p>
    </Card>
  );
}

function monthLabel(ym: string): string {
  const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(ym.slice(5, 7))] ?? ym} ${ym.slice(0, 4)}`;
}
