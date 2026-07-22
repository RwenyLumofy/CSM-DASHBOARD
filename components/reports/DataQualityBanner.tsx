"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { ArrReconciliation } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

/* =========================================================================
   One page-level ARR data-quality banner — compact by default, expandable.

   The warning used to be a fixed multi-line block that shouted at the top of
   every load. It's real (ARR sources disagree, and every figure below inherits
   the drift) so it can't be hidden — but it also doesn't need six lines of
   reconciliation math in the reader's face before they've seen a single metric.
   So: a one-line compact state carrying the single most important number, with
   the full breakdown one keystroke away.

   FOUR QUANTITIES, NOT ONE. An earlier version compared three numbers and
   labelled the gap with a fourth. They are genuinely different, and the expanded
   panel keeps them apart:
     net variance    $369.3K   ledger − account records, SIGNED (cancels both
                               ways, so it UNDERSTATES the disagreement)
     gross variance  $460.8K   Σ|per-account difference| — the honest size
     affected ARR    $887.5K   revenue standing on records that disagree
     ghost ARR       $40.0K    churned accounts the ledger still carries
   ========================================================================= */

const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

export function DataQualityBanner({ arr, qs }: { arr: ArrReconciliation; qs: string }) {
  const [open, setOpen] = useState(false);
  if (arr.reconciled) return null;

  const reviewHref = qs ? `/reports/churn?${qs}` : "/reports/churn";

  return (
    <section
      aria-label="ARR data quality"
      className="rounded-2xl border border-warning-bg bg-warning-bg/40 px-3.5 py-3"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} strokeWidth={2} className="mt-[2px] shrink-0 text-warning-fg" aria-hidden />

        <div className="min-w-0 flex-1">
          {/* Compact state: the headline number, the two totals, two actions. */}
          <p className="font-body text-[12.5px] font-semibold text-warning-fg">
            ARR data is provisional — <span className="tabular">{money(arr.netVariance)}</span> net variance across{" "}
            <span className="tabular">{arr.affectedAccounts}</span> accounts
          </p>
          <p className="mt-0.5 font-body text-[11.5px] text-warning-fg/85">
            Account records: <span className="tabular font-semibold">{money(arr.columnTotal)}</span> · ARR ledger:{" "}
            <span className="tabular font-semibold">{money(arr.ledgerLive)}</span>
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href={reviewHref}
              className="font-body text-[11.5px] font-semibold text-warning-fg underline underline-offset-2 hover:opacity-80"
            >
              Review affected records →
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="flex items-center gap-1 font-body text-[11.5px] font-semibold text-warning-fg/90 hover:text-warning-fg"
            >
              {open ? "Hide detail" : "Show detail"}
              <ChevronDown
                size={13}
                strokeWidth={2.5}
                className={cn("transition-transform duration-150", open && "rotate-180")}
                aria-hidden
              />
            </button>
          </div>

          {/* Expanded: the four distinct quantities kept apart, plus sources. */}
          {open && (
            <div className="mt-3 border-t border-warning-fg/15 pt-3">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                <Row label="Account-record total" value={money(arr.columnTotal)} note="Σ of the account ARR column, live book" />
                <Row label="ARR-ledger total" value={money(arr.ledgerLive)} note="Ledger balance, same live book" />
                <Row label="Net variance" value={money(arr.netVariance)} note="Ledger − records. Signed — cancels both ways" />
                <Row
                  label="Gross disagreement"
                  value={money(arr.grossVariance)}
                  note="Σ of absolute per-account differences — the true size"
                />
                <Row
                  label="ARR on affected accounts"
                  value={money(arr.affectedArr)}
                  note={`Revenue standing on ${arr.affectedAccounts} disagreeing records`}
                />
                <Row
                  label="Missing churn entries"
                  value={money(arr.ghostArr)}
                  note={`${arr.ghostAccounts} churned accounts the ledger still carries`}
                />
              </dl>
              <p className="mt-3 font-body text-[10.5px] text-warning-fg/70">
                Sources: account records (<code className="font-mono">clients.arr</code>) vs ARR ledger (
                <code className="font-mono">arr_events</code>). Computed live on each load — there is no batch
                reconciliation, so no “last reconciled” time. Which source is authoritative is a data-pipeline decision,
                not a display one.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-body text-[11.5px] font-medium text-warning-fg/90">{label}</dt>
        <dd className="tabular font-body text-[12.5px] font-semibold text-warning-fg">{value}</dd>
      </div>
      <p className="font-body text-[10.5px] leading-snug text-warning-fg/65">{note}</p>
    </div>
  );
}
