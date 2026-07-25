"use client";

/* =========================================================================
   CS Pulse capture drawer — the CSM's read on an account (stakeholders,
   engagement, renewal), rated against the workspace's configured dimensions
   and rating tiers. Saving records the pulse and re-scores the account.
   Extracted from CsPulsePanel so both the account profile AND the "Pulse due"
   queue open the exact same capture UI (one flow, no drift).
   ========================================================================= */

import { useState } from "react";
import { Loader2, Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_SIGNALS, PULSE_VALIDITY_DAYS, type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { setClientPulseAction } from "@/app/(app)/clients/pulse-actions";

export const findTier = (tiers: RatingTier[], k: string | undefined) => tiers.find((t) => t.key === k);
/** Colour a tier by its score, so any renamed/added tier gets a sensible hue. */
export const tierColor = (score: number) => (score >= 75 ? "#1F9D63" : score >= 50 ? "#6E8B1E" : score >= 25 ? "#C2610E" : "#B23A57");

export function pulseScore(ratings: Record<string, string | undefined>, dimensions: PulseDimension[], tiers: RatingTier[]): number | null {
  if (!dimensions.every((d) => ratings[d.id])) return null;
  let tot = 0, w = 0;
  for (const d of dimensions) { tot += (findTier(tiers, ratings[d.id])?.score ?? 0) * d.weight; w += d.weight; }
  return w ? Math.round(tot / w) : null;
}

export function PulseDrawer({ clientId, pulse, dimensions, tiers, onClose, onSaved }: {
  clientId: string; pulse: StoredPulse | null; dimensions: PulseDimension[]; tiers: RatingTier[]; onClose: () => void; onSaved: () => void;
}) {
  const [ratings, setRatings] = useState<Record<string, string>>({ ...(pulse?.ratings as Record<string, string> ?? {}) });
  const [signals, setSignals] = useState<StoredPulse["signals"]>({ ...(pulse?.signals ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = pulseScore(ratings, dimensions, tiers);
  const complete = dimensions.every((d) => ratings[d.id]);

  async function save() {
    setBusy(true); setError(null);
    const r = await setClientPulseAction(clientId, { ratings, signals });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the pulse."); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Record CS Pulse" className="pm-slide-in relative flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[540px]">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-fg">Record CS Pulse</h2>
            <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">Your read on the relationship — 25% of the health score. Valid for {PULSE_VALIDITY_DAYS} days.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {dimensions.map((d) => {
            const sel = ratings[d.id];
            return (
              <div key={d.id}>
                <h3 className="font-body text-[14px] font-semibold text-fg">{d.name} <span className="font-normal text-fg-subtle">· {d.weight}%</span></h3>
                <p className="mb-2.5 mt-1 font-body text-[12.5px] leading-relaxed text-fg-muted">{d.description}</p>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}>
                  {tiers.map((t) => (
                    <button key={t.key} type="button" onClick={() => setRatings((r) => ({ ...r, [d.id]: t.key }))}
                      className={cn("rounded-lg border-[1.5px] py-2 font-body text-[12px] font-semibold transition-colors",
                        sel === t.key ? "border-transparent text-white" : "border-border bg-surface text-fg-muted hover:border-border-strong")}
                      style={sel === t.key ? { background: tierColor(t.score) } : undefined}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {sel && <p className="mt-2 flex gap-2 rounded-lg border border-border-subtle bg-bg-muted/40 px-3 py-2 font-body text-[12px] leading-snug text-fg-muted"><span className="font-semibold text-fg">{findTier(tiers, sel)?.label}</span>{d.rubric[sel]}</p>}
              </div>
            );
          })}

          <div>
            <h4 className="mb-1 font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Risk signals</h4>
            <div className="flex flex-col divide-y divide-border-subtle">
              {PULSE_SIGNALS.map((s) => {
                const on = !!(signals as Record<string, unknown>)[s.id];
                return (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 py-2.5">
                    <span className="flex-1"><span className="font-body text-[13px] text-fg">{s.name}</span><span className="block font-body text-[11.5px] text-fg-subtle">{s.desc}</span></span>
                    <input type="checkbox" checked={on} onChange={(e) => setSignals((g) => ({ ...g, [s.id]: e.target.checked }))} className="size-4 accent-sirius" />
                  </label>
                );
              })}
              <label className="flex items-center gap-3 py-2.5">
                <span className="flex-1 font-body text-[13px] text-fg">Renewal intent</span>
                <select value={signals.renewalIntent ?? ""} onChange={(e) => setSignals((g) => ({ ...g, renewalIntent: (e.target.value || null) as StoredPulse["signals"]["renewalIntent"] }))}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body text-[12.5px] font-medium text-fg outline-none ring-sirius focus:ring-2">
                  <option value="">— unknown —</option><option value="positive">positive</option><option value="neutral">neutral</option><option value="negative">negative</option>
                </select>
              </label>
            </div>
          </div>

          {error && <div className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/8 px-3 py-2.5 font-body text-[12.5px] text-[#B23A57]"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <div>
            <span className="font-display text-[22px] font-bold tabular-nums text-fg">{score ?? "—"}</span>
            <span className="ml-1.5 font-body text-[11.5px] text-fg-subtle">CS Pulse · {complete ? "ready" : `rate all ${dimensions.length}`}</span>
          </div>
          <button type="button" onClick={save} disabled={!complete || busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-opacity disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save pulse & re-score
          </button>
        </div>
      </div>
    </div>
  );
}
