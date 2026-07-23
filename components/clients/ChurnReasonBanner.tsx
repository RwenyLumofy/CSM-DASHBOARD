"use client";

/* =========================================================================
   Churn reason — shown at the top of a CHURNED client's profile. Lets an admin
   classify the churn against the taxonomy (Settings → Churn taxonomy); the
   reason rolls up on the Churn dashboard. Reasons are grouped by category, and
   the save is confirmed inline (spinner → check, or the exact error).
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertTriangle, TrendingDown, ChevronDown } from "lucide-react";
import type { ChurnTaxonomy } from "@/lib/metrics/churn-taxonomy";
import { setClientChurnReasonAction } from "@/app/(app)/clients/churn-actions";

export function ChurnReasonBanner({ clientId, taxonomy, currentReasonId, canEdit }: {
  clientId: string;
  taxonomy: ChurnTaxonomy;
  currentReasonId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState(currentReasonId ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLabel = (() => {
    for (const c of taxonomy) for (const r of c.reasons) if (r.id === reason) return `${c.label} · ${r.label}`;
    return null;
  })();
  const hasTaxonomy = taxonomy.some((c) => c.reasons.length > 0);

  async function change(next: string) {
    setReason(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await setClientChurnReasonAction(clientId, next || null);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the churn reason."); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#C99A14]/30 bg-[#C99A14]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#C99A14]/15 text-[#8A6D12]">
          <TrendingDown size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[14px] font-semibold text-fg">This account has churned</h3>
          <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
            {canEdit
              ? "Classify why it churned — it rolls up on the Churn dashboard."
              : currentLabel
                ? <>Churn reason: <span className="font-medium text-fg">{currentLabel}</span></>
                : "No churn reason recorded yet."}
          </p>
        </div>
      </div>

      {canEdit && hasTaxonomy && (
        <div className="flex items-center gap-2 sm:shrink-0">
          <div className="relative">
            <select
              value={reason}
              onChange={(e) => change(e.target.value)}
              disabled={busy}
              aria-label="Churn reason"
              className="w-full appearance-none rounded-lg border border-border bg-surface py-2 pl-3 pr-9 font-body text-[13px] text-fg outline-none ring-sirius focus:ring-2 disabled:opacity-60 sm:w-[240px]"
            >
              <option value="">Select a reason…</option>
              {taxonomy.map((c) => (
                c.reasons.length > 0 && (
                  <optgroup key={c.id} label={c.label}>
                    {c.reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </optgroup>
                )
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          </div>
          <span className="grid w-4 place-items-center" aria-live="polite">
            {busy ? <Loader2 size={15} className="animate-spin text-fg-subtle" /> : saved ? <Check size={15} className="text-[#2DB47A]" /> : null}
          </span>
        </div>
      )}

      {canEdit && !hasTaxonomy && (
        <p className="font-body text-[12px] text-fg-subtle sm:shrink-0">
          Set up reasons in Settings → Churn taxonomy.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-1.5 font-body text-[12px] text-[#B23A57] sm:basis-full">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
    </div>
  );
}
