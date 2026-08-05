"use client";

/* =========================================================================
   Health signals — the score, and why it is what it is.

   The card used to render a flat list of bars keyed by the retired formula's
   metrics, so after the engine migration every one read "No data". Worse, it
   never explained the thing people actually ask about: an account can score 73,
   land in the Healthy band, and still be shown as Watch. Without the reasons
   printed beside the number that reads as a bug.

   So the order here is: the number, then what happened to it, then what it was
   built from.
   ========================================================================= */

import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HealthBreakdown } from "@/lib/health/breakdown";

function Bar({ label, value, share, muted }: { label: string; value: number | null; share: number; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("w-40 shrink-0 font-body text-[12.5px]", muted ? "text-fg-subtle" : "text-fg-muted")}>{label}</span>
      {value == null ? (
        <>
          <div className="h-1.5 flex-1 rounded-pill bg-bg-muted" />
          <span className="w-16 shrink-0 text-right font-body text-[11.5px] italic text-fg-subtle">No data</span>
        </>
      ) : (
        <>
          <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-bg-muted">
            <div className="h-full rounded-pill transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, value))}%`,
                       background: value >= 75 ? "var(--color-aurora, #1F9D63)" : value >= 55 ? "var(--color-stellar, #C99A14)" : "var(--color-nova, #C2610E)" }} />
          </div>
          <span className="tabular w-8 shrink-0 text-right font-body text-[12.5px] font-semibold text-fg">{value}</span>
        </>
      )}
      <span className="tabular w-11 shrink-0 text-right font-body text-[11px] text-fg-subtle">
        {share >= 0.05 ? `${Math.round(share * 10) / 10}%` : ""}
      </span>
    </div>
  );
}

export function HealthSignals({
  breakdown,
  onRecalculate,
  recalculating,
}: {
  breakdown: HealthBreakdown | null;
  onRecalculate: () => void;
  recalculating: boolean;
}) {
  if (!breakdown) {
    return <p className="font-body text-[12.5px] text-fg-subtle">No health score has been calculated for this account yet.</p>;
  }
  const { score, band, applied, capped, reasons, coverage, momentum, components } = breakdown;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-display text-[30px] font-bold leading-none tabular-nums text-fg">{score}</span>
        <span className="font-body text-[13px] font-semibold text-fg-muted">{applied}</span>
        {capped && (
          /* The whole point of the card. A 73 in the Healthy band shown as
             Watch is the model working; unexplained it reads as broken. */
          <span className="font-body text-[12px] text-fg-subtle">
            — scored into <span className="font-medium text-fg-muted">{band}</span>, held at{" "}
            <span className="font-medium text-fg-muted">{applied}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2.5">
          {coverage != null && (
            <span className="font-body text-[11.5px] text-fg-subtle">{Math.round(coverage * 100)}% data coverage</span>
          )}
          <button onClick={onRecalculate} disabled={recalculating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:opacity-50">
            {recalculating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalculate
          </button>
        </span>
      </div>

      {reasons.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#C99A14]/30 bg-[#C99A14]/[0.06] px-3.5 py-3">
          <span className="font-body text-[12px] font-semibold text-fg">
            {capped ? `Why it isn't ${band}` : "What's holding it back"}
          </span>
          <ul className="flex flex-col gap-1">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 font-body text-[12.5px] leading-relaxed text-fg-muted">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[#C99A14]" aria-hidden />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-0.5 font-body text-[11.5px] leading-relaxed text-fg-subtle">
            These come from the CS Pulse and the qualification gates, not the score — the score itself is
            never rewritten, which is why it can sit above the band it&rsquo;s shown as.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {components.map((c) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <Bar label={c.name} value={c.value} share={c.share} />
            {c.children.length > 0 && (
              <div className="flex flex-col gap-1.5 border-l border-border-subtle pl-3">
                {c.children.map((k) => <Bar key={k.id} label={k.name} value={k.value} share={k.share} muted />)}
              </div>
            )}
            {c.value == null && c.mandatory && (
              <p className="pl-3 font-body text-[11.5px] text-[#C2610E]">
                Mandatory — with no data here the account cannot be scored at all.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="font-body text-[11.5px] leading-relaxed text-fg-subtle">
        Weights are the share of the whole score, set in Settings → Client health. A signal with no data for
        this account is skipped and the rest reweight to fill the gap — never a guessed value.
        {momentum ? ` Momentum: ${momentum.toLowerCase()}.` : ""}
      </p>
    </div>
  );
}
