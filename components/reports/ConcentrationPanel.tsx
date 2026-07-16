import Link from "next/link";
import { Card, CardEyebrow } from "@/components/ui/Card";
import type { ConcentrationRow } from "@/lib/metrics/movement";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

/* Concentration — revenue share against usage share, per account.
   The mismatch is the whole point and it only shows up side by side: this book's
   heaviest-used account is ~26% of all monthly actives on ~10% of ARR, while the
   largest by revenue is 16% of ARR on 10% of usage. That's either the
   concentration risk or the pricing headroom, and a board asks either way.
   Paired bars rather than two separate charts, because the comparison IS the
   insight. */

export function ConcentrationPanel({
  rows,
  topArrShare,
  topMauShare,
  currency,
}: {
  rows: ConcentrationRow[];
  topArrShare: number;
  topMauShare: number;
  currency: string;
}) {
  if (!rows.length) return null;
  const scale = Math.max(...rows.flatMap((r) => [r.arrShare, r.mauShare]), 0.01);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardEyebrow>Top {rows.length} accounts</CardEyebrow>
          <h3 className="h5">Revenue vs usage concentration</h3>
        </div>
        <div className="flex items-center gap-4">
          <Legend color="var(--color-sirius)" label="ARR share" />
          <Legend color="var(--color-eclipse)" label="Usage share" />
        </div>
      </div>

      <ul className="flex flex-col gap-3.5">
        {rows.map((r) => {
          // A gap worth pointing at: paying a lot relative to what they use, or
          // using a lot relative to what they pay.
          const gap = r.mauShare - r.arrShare;
          const notable = Math.abs(gap) >= 0.08;
          return (
            <li key={r.name} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/clients/${r.id}`}
                  className="truncate font-body text-[13px] font-semibold text-fg transition-colors hover:text-sirius"
                >
                  {r.name}
                </Link>
                <span className="tabular caption shrink-0">{formatCurrency(r.arr, currency, { compact: true })}</span>
              </div>
              <Bar value={r.arrShare} scale={scale} color="var(--color-sirius)" label={pct(r.arrShare)} />
              <Bar value={r.mauShare} scale={scale} color="var(--color-eclipse)" label={pct(r.mauShare)} />
              {notable && (
                <span className={cn("caption", gap > 0 ? "text-eclipse-fg" : "text-info-fg")}>
                  {gap > 0
                    ? `Uses ${pct(Math.abs(gap))} more of the platform than it pays for — pricing headroom.`
                    : `Pays ${pct(Math.abs(gap))} more than its share of usage — value at risk if it notices.`}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="caption mt-4 border-t border-border-subtle pt-3">
        These {rows.length} accounts are <strong className="font-semibold text-fg">{pct(topArrShare)} of ARR</strong> and{" "}
        <strong className="font-semibold text-fg">{pct(topMauShare)} of all monthly actives</strong>. Usage share uses
        the last complete month.
      </p>
    </Card>
  );
}

function Bar({ value, scale, color, label }: { value: number; scale: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-pill bg-bg-muted">
        <div
          className="h-full rounded-pill transition-all duration-[220ms]"
          style={{ width: `${Math.max(1, (value / scale) * 100)}%`, background: color }}
        />
      </div>
      <span className="tabular w-11 shrink-0 text-right font-body text-[11px] font-semibold text-fg-muted">{label}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
      <span className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
