"use client";

/* =========================================================================
   Client Health panel — shows the account's live health (score, band, drivers)
   and lets the CSM record/refresh the CS Pulse. A fresh pulse (≤30d) is what
   lets the account score at all; a lapsed one drops it to "Not Assessed", which
   this panel surfaces as a prompt to re-pulse. Config (dimensions, rubrics,
   signals, tiers) comes from lib/health so it can never drift from the engine.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_VALIDITY_DAYS, pulseAgeDays, type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { PulseDrawer } from "./PulseDrawer";

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
  const rootRef = useRef<HTMLDivElement>(null);

  // Deep-link from the Pulse queue (/clients/{id}#pulse): open the capture
  // drawer and scroll it into view, then drop the hash so a refresh doesn't
  // re-open it. Only for users who can actually record a pulse.
  useEffect(() => {
    if (!canEdit || typeof window === "undefined" || window.location.hash !== "#pulse") return;
    setOpen(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [canEdit]);

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
    <div ref={rootRef} className="scroll-mt-24 rounded-xl border border-border bg-surface shadow-sm">
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
