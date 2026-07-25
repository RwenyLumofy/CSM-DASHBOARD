"use client";

/* =========================================================================
   Client Health panel — shows the account's live health (score, band, drivers)
   and lets the CSM record/refresh the CS Pulse. A fresh pulse (≤30d) is what
   lets the account score at all; a lapsed one drops it to "Not Assessed", which
   this panel surfaces as a prompt to re-pulse. Config (dimensions, rubrics,
   signals, tiers) comes from lib/health so it can never drift from the engine.
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertTriangle, HeartPulse, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_SIGNALS, PULSE_VALIDITY_DAYS, pulseAgeDays, type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { setClientPulseAction } from "@/app/(app)/clients/pulse-actions";

export interface HealthLite {
  calculatedScore: number | null;
  calculatedBand: string | null;
  appliedStatus: string;
  notAssessed: boolean;
  dataCoverage: number;
  momentum: string;
  scoreDelta: number | null;
  positiveDrivers: string[];
  negativeDrivers: string[];
  primaryRisk: string | null;
}

/** Momentum → arrow, colour and whether to show it. */
function momentumChip(m: string): { icon: string; color: string } | null {
  switch (m) {
    case "Improving": return { icon: "↗", color: "#1F9D63" };
    case "Declining": return { icon: "↘", color: "#C2610E" };
    case "Rapidly Declining": return { icon: "↘", color: "#B23A57" };
    case "Stable": return { icon: "→", color: "var(--color-fg-subtle, #6E6E6E)" };
    default: return null; // Insufficient History — nothing to show yet
  }
}

const BAND_TONE: Record<string, string> = {
  Healthy: "text-[#1F9D63] bg-[#1F9D63]/12 border-[#1F9D63]/25",
  Watch: "text-[#8A6D12] bg-[#C99A14]/14 border-[#C99A14]/30",
  "At Risk": "text-[#C2610E] bg-[#C2610E]/13 border-[#C2610E]/28",
  Critical: "text-[#B23A57] bg-[#B23A57]/12 border-[#B23A57]/28",
  Churned: "text-fg-subtle bg-bg-muted border-border",
  "Not Assessed": "text-fg-subtle bg-bg-muted border-border",
};
const findTier = (tiers: RatingTier[], k: string | undefined) => tiers.find((t) => t.key === k);
/** Colour a tier by its score, so any renamed/added tier gets a sensible hue. */
const tierColor = (score: number) => (score >= 75 ? "#1F9D63" : score >= 50 ? "#6E8B1E" : score >= 25 ? "#C2610E" : "#B23A57");

function pulseScore(ratings: Record<string, string | undefined>, dimensions: PulseDimension[], tiers: RatingTier[]): number | null {
  if (!dimensions.every((d) => ratings[d.id])) return null;
  let tot = 0, w = 0;
  for (const d of dimensions) { tot += (findTier(tiers, ratings[d.id])?.score ?? 0) * d.weight; w += d.weight; }
  return w ? Math.round(tot / w) : null;
}

export function CsPulsePanel({ clientId, health, pulse, dimensions, tiers, canEdit }: {
  clientId: string;
  health: HealthLite | null;
  pulse: StoredPulse | null;
  dimensions: PulseDimension[];
  tiers: RatingTier[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const age = pulseAgeDays(pulse);
  const freshness = age == null
    ? { t: "No pulse recorded yet", tone: "text-fg-subtle" }
    : age > PULSE_VALIDITY_DAYS
      ? { t: `Pulse lapsed ${age - PULSE_VALIDITY_DAYS}d ago — re-pulse to re-score`, tone: "text-[#B23A57]" }
      : age > PULSE_VALIDITY_DAYS - 5
        ? { t: `Pulse due in ${PULSE_VALIDITY_DAYS - age}d`, tone: "text-[#8A6D12]" }
        : { t: `Pulse updated ${age}d ago`, tone: "text-fg-subtle" };

  const band = health?.notAssessed ? "Not Assessed" : (health?.appliedStatus ?? "Not Assessed");
  const showScore = health && !health.notAssessed && health.calculatedScore != null;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-sirius"><HeartPulse size={15} /></span>
        <h3 className="font-display text-[14px] font-semibold text-fg">Client health</h3>
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-body text-[12px] font-semibold", BAND_TONE[band] ?? BAND_TONE["Not Assessed"])}>{band}</span>
        <span className={cn("ml-auto font-body text-[12px]", freshness.tone)}>{freshness.t}</span>
        {canEdit && (
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90">
            <HeartPulse size={13} /> {age == null ? "Rate pulse" : "Update pulse"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
        {showScore ? (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-[34px] font-bold leading-none tabular-nums text-fg">{health!.calculatedScore!.toFixed(0)}</span>
                <span className="font-body text-[13px] text-fg-muted">/ 100 · {Math.round(health!.dataCoverage * 100)}% coverage</span>
              </div>
              {momentumChip(health!.momentum) && (
                <span className="inline-flex items-center gap-1 font-body text-[12px] font-semibold" style={{ color: momentumChip(health!.momentum)!.color }}>
                  {momentumChip(health!.momentum)!.icon} {health!.momentum}
                  {health!.scoreDelta != null ? ` (${health!.scoreDelta > 0 ? "+" : ""}${health!.scoreDelta.toFixed(0)})` : ""}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 sm:border-l sm:border-border-subtle sm:pl-4">
              {health!.primaryRisk && <p className="font-body text-[12.5px] font-medium text-[#B23A57]">⚠ {health!.primaryRisk}</p>}
              {health!.positiveDrivers.slice(0, 2).map((d) => <p key={d} className="font-body text-[12px] text-fg-muted">+ {d}</p>)}
              {health!.negativeDrivers.slice(0, 2).map((d) => <p key={d} className="font-body text-[12px] text-[#B23A57]">− {d}</p>)}
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 font-body text-[12.5px] text-fg-muted">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#C99A14]" />
            <span>{age == null
              ? "This account can't be scored until a CS Pulse is recorded — the CSM's read on stakeholders, engagement and renewal (25% of health)."
              : "The CS Pulse has lapsed, so the account is Not Assessed. Refresh the pulse to bring the score back."}</span>
          </div>
        )}
      </div>

      {open && <PulseDrawer clientId={clientId} pulse={pulse} dimensions={dimensions} tiers={tiers} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

/* -------- capture drawer -------------------------------------------------- */

function PulseDrawer({ clientId, pulse, dimensions, tiers, onClose, onSaved }: {
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
