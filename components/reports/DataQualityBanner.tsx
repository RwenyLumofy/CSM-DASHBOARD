import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ArrReconciliation } from "@/lib/metrics/exec";

/* One page-level data-quality banner.
   The warning used to live inside the ARR card, where it competed with the
   number it was warning about and made a summary tile carry a paragraph. It's
   also not about one card: the drift affects every ARR figure on the page, so
   it belongs above them all, once.

   The first version was wrong as well as misplaced. It read "Closing $1.68M …
   ledger says $1.64M — $369.3K apart", comparing three numbers and labelling
   the gap with a fourth. $1.68M vs $1.64M is $40.0K (churned accounts the
   ledger still carries). The $369.3K is a different pair entirely. Both are
   stated separately now, and NET is distinguished from EXPOSED: the accounts
   drift in both directions and cancel, so a signed sum understates the problem. */

const money = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(1)}K`;
  return `$${Math.round(a)}`;
};

export function DataQualityBanner({ arr, qs }: { arr: ArrReconciliation; qs: string }) {
  if (arr.reconciled) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning-bg bg-warning-bg/50 px-3 py-2.5">
      <AlertTriangle size={14} strokeWidth={2} className="mt-[3px] shrink-0 text-warning-fg" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-body text-[12.5px] font-semibold text-warning-fg">
          ARR sources disagree — figures below are unreconciled
        </p>
        <p className="font-body text-[11.5px] leading-relaxed text-warning-fg/90">
          {arr.affectedAccounts > 0 && (
            <>
              The account records total <span className="tabular font-semibold">{money(arr.columnTotal)}</span>; the ARR
              ledger totals <span className="tabular font-semibold">{money(arr.ledgerLive)}</span> for the same live
              book — a <span className="tabular font-semibold">{money(arr.netVariance)}</span> net variance across{" "}
              <span className="tabular font-semibold">{arr.affectedAccounts}</span> accounts, which together carry{" "}
              <span className="tabular font-semibold">{money(arr.affectedArr)}</span> of ARR.
              {Math.abs(arr.grossVariance - Math.abs(arr.netVariance)) > 1000 && (
                <>
                  {" "}
                  They differ in both directions, so the gross disagreement is{" "}
                  <span className="tabular font-semibold">{money(arr.grossVariance)}</span>.
                </>
              )}
            </>
          )}
          {arr.ghostAccounts > 0 && (
            <>
              {" "}
              Closing ARR additionally includes <span className="tabular font-semibold">{money(arr.ghostArr)}</span> from{" "}
              <span className="tabular font-semibold">{arr.ghostAccounts}</span> churned accounts whose churn was never
              written to the ledger.
            </>
          )}
        </p>
        <Link
          href={qs ? `/reports/churn?${qs}` : "/reports/churn"}
          className="w-fit font-body text-[11.5px] font-semibold text-warning-fg underline underline-offset-2"
        >
          Review churn records →
        </Link>
      </div>
    </div>
  );
}
