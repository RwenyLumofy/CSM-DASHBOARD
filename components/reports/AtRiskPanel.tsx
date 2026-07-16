import Link from "next/link";
import { CalendarClock, ShieldAlert } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import type { RiskRow } from "@/lib/metrics/movement";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

/* "What's at risk" — the forward view, and the only panel here that says what to
   do next rather than what already happened.
   Renewals ahead, crossed with whether the customer actually uses the product.
   Every point of the risk score traces to a reason shown on the row: a CSM has
   to trust it enough to act, and an opaque blend is precisely what "health
   scores average out the signal" warns against. It ranks a worklist — it does
   not predict churn. */

function band(risk: number): { label: string; chip: string; bar: string } {
  if (risk >= 60) return { label: "High", chip: "bg-danger-bg text-danger-fg", bar: "bg-danger" };
  if (risk >= 30) return { label: "Medium", chip: "bg-warning-bg text-warning-fg", bar: "bg-warning" };
  if (risk > 0) return { label: "Low", chip: "bg-bg-muted text-fg-muted", bar: "bg-neutral-400" };
  return { label: "Clear", chip: "bg-success-bg text-success-fg", bar: "bg-success" };
}

export function AtRiskPanel({
  rows,
  currency,
  windowDays = 90,
  limit = 8,
}: {
  rows: RiskRow[];
  currency: string;
  windowDays?: number;
  limit?: number;
}) {
  const atRisk = rows.filter((r) => r.risk >= 30);
  const arrExposed = atRisk.reduce((a, r) => a + r.arr, 0);
  const totalArr = rows.reduce((a, r) => a + r.arr, 0);
  const shown = rows.slice(0, limit);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardEyebrow>Next {windowDays} days</CardEyebrow>
          <h3 className="h5">Renewals at risk</h3>
        </div>
        <div className="text-right">
          <div className="tabular font-display text-xl font-bold leading-none text-fg">
            {formatCurrency(arrExposed, currency, { compact: true })}
          </div>
          <div className="caption mt-1">
            exposed of {formatCurrency(totalArr, currency, { compact: true })} renewing
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md bg-bg-subtle px-3 py-6 text-center">
          <p className="caption">No renewals in the next {windowDays} days.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {shown.map((r) => {
            const b = band(r.risk);
            return (
              <li key={r.client.id} className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0">
                {/* Risk as a bar, not just a number — the column scans. */}
                <div className="flex w-9 shrink-0 flex-col items-center gap-1">
                  <span className={cn("tabular rounded px-1.5 py-0.5 text-[11px] font-bold", b.chip)}>{r.risk}</span>
                  <span className="h-1 w-full overflow-hidden rounded-pill bg-bg-muted">
                    <span className={cn("block h-full rounded-pill", b.bar)} style={{ width: `${r.risk}%` }} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/clients/${r.client.id}`}
                    className="block truncate font-body text-sm font-semibold text-fg transition-colors hover:text-sirius"
                  >
                    {r.client.name}
                  </Link>
                  <span className="caption block truncate">
                    {r.reasons.length ? r.reasons.join(" · ") : "No risk signals"}
                  </span>
                </div>

                {r.usage && r.usage.series.length > 1 && (
                  <Sparkline
                    data={r.usage.series.map((s) => s.mau)}
                    min={0}
                    width={56}
                    height={20}
                    color={r.risk >= 30 ? "var(--color-danger)" : "var(--color-success)"}
                    className="hidden shrink-0 sm:block"
                  />
                )}

                <div className="w-20 shrink-0 text-right">
                  <span className="tabular block font-body text-sm font-semibold text-fg">
                    {formatCurrency(r.arr, currency, { compact: true })}
                  </span>
                  <span className="caption inline-flex items-center gap-1">
                    <CalendarClock size={10} strokeWidth={2} aria-hidden />
                    {r.daysToRenewal}d
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > limit && <p className="caption mt-3">+ {rows.length - limit} more renewing</p>}

      <p className="caption mt-4 flex items-start gap-1.5 border-t border-border-subtle pt-3">
        <ShieldAlert size={12} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden />
        <span>
          Risk is a transparent sum of the reasons shown — usage decline, health, open tickets, SLA breaches, and
          imminence — ranked with ARR weighting. It prioritises a worklist; it doesn&apos;t predict churn.
        </span>
      </p>
    </Card>
  );
}
