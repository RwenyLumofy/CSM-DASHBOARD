import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { ConcentrationRow } from "@/lib/metrics/movement";

/* =========================================================================
   Portfolio concentration — ONE question, one clock: how much ARR sits in a
   few accounts, and which ones.

   Deliberately stripped. An earlier version also carried usage-share-vs-ARR-
   share "gaps", expansion/adoption classifications and a widest-gap stat — a
   value-realization analysis that (a) is a DIFFERENT question from concentration,
   (b) ran on a DIFFERENT clock (usage is last-complete-month, ARR is as-of-today),
   and (c) sat on usage data missing for a large share of accounts, so its most
   common output was "No usage data". Two jobs in one panel, one on data we don't
   reliably have.

   That analysis isn't deleted — it belongs in the Health deep-dive as a
   per-account value-realization signal, once usage coverage is solid (see the
   scaffold note there). Here we answer only the concentration question: these
   few names are most of the book, and losing one moves the book by its share.

   The section heading above the card carries the title and the "as of today"
   anchor, so the card is content only — no repeated title, one clock.
   ========================================================================= */

export function ConcentrationPanel({
  rows,
  topArrShare,
}: {
  rows: ConcentrationRow[];
  topArrShare: number;
  /** Kept for call-site compatibility; concentration is ARR-share only now. */
  currency?: string;
}) {
  if (!rows.length) return null;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const largest = rows.reduce((a, r) => (r.arrShare > a.arrShare ? r : a), rows[0]);
  // Scale bars to the largest share, so the biggest account fills the track and
  // the rest read proportionally against it.
  const scale = Math.max(...rows.map((r) => r.arrShare), 0.01);

  return (
    <Card>
      <div className="mb-5 flex flex-wrap gap-x-8 gap-y-3">
        <Headline value={pct(topArrShare)} label={`of ARR in the top ${rows.length} accounts`} />
        <div className="border-l border-border-subtle pl-8">
          <Headline value={pct(largest.arrShare)} label={`in the largest, ${largest.name}`} />
        </div>
      </div>

      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <Link
              href={`/clients/${r.id}`}
              dir="auto"
              className="w-36 shrink-0 truncate font-body text-[13px] font-semibold text-fg transition-colors hover:text-sirius sm:w-44"
            >
              {r.name}
            </Link>
            <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-bg-muted">
              <div
                className="h-full rounded-pill bg-sirius transition-all duration-[220ms]"
                style={{ width: `${Math.max(2, (r.arrShare / scale) * 100)}%` }}
              />
            </div>
            <span className="tabular w-12 shrink-0 text-right font-body text-[12px] font-semibold text-fg">{pct(r.arrShare)}</span>
          </li>
        ))}
      </ul>

      <p className="caption mt-4 border-t border-border-subtle pt-3">
        Share of the filtered book’s ARR, as of today. If a top account leaves, the book moves by its share.
      </p>
    </Card>
  );
}

function Headline({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="tabular font-display text-2xl font-bold leading-none tracking-tight text-fg">{value}</div>
      <div className="caption mt-1.5">{label}</div>
    </div>
  );
}
