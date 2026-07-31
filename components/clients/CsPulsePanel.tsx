"use client";

/* =========================================================================
   CS Pulse — a single compact TRIGGER that opens the pulse/health sidebar.

   THE TRIGGER SHOWS THE PULSE SCORE, NOT THE HEALTH SCORE, and says "Pulse".
   That is the whole point of the label. There are two health numbers in this
   app — the header ring's (lib/metrics/health.ts, derived from support/usage/
   profile/onboarding) and the engine's calculated score (lib/health/*, which
   takes CS Pulse as 25%) — and parking the second one in a chip beside the
   first read as one number contradicting another. So this button no longer
   competes: it shows the CSM's OWN input, which is the only number they can
   act on from here, and leaves health scoring to the ring and the sidebar.

   This used to be a full-width card permanently parked above the profile tabs,
   showing score, coverage, momentum and drivers whether or not anyone was
   looking at them, costing ~110px of vertical space on every tab.

   The sidebar it opens (PulseDrawer) carries BOTH the read-out and the capture
   form, so "how is this account doing" and "record my read" are one flow
   instead of a card plus a nested drawer.

   A fresh pulse (≤30d) is what lets the account score at all; a lapsed one
   drops it to "Not Assessed", which the button itself surfaces so the prompt
   to re-pulse survives the collapse. Config (dimensions, rubrics, signals,
   tiers) comes from lib/health so it can never drift from the engine.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_VALIDITY_DAYS, pulseAgeDays, type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { PulseDrawer, pulseScore } from "./PulseDrawer";

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
  const rootRef = useRef<HTMLButtonElement>(null);

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

  /* The full read-out — lives inside the sidebar now, not on the page. */
  const summary = (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-body text-[12px] font-semibold", BAND_TONE[band] ?? BAND_TONE["Not Assessed"])}>{band}</span>
        <span className={cn("font-body text-[12px]", freshness.tone)}>{freshness.t}</span>
      </div>
      {showScore ? (
        <>
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
          <div className="flex flex-col gap-0.5">
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
  );

  /* The CSM's own score — the weighted read across the pulse dimensions. NOT
     health: health folds this in at 25% alongside usage, support and profile. */
  const myPulse = pulse ? pulseScore(pulse.ratings, dimensions, tiers) : null;
  const lapsed = age != null && age > PULSE_VALIDITY_DAYS;

  return (
    <>
      <button ref={rootRef} type="button" onClick={() => setOpen(true)}
        className="scroll-mt-24 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 font-body text-[12.5px] font-semibold text-fg-muted shadow-sm transition-colors hover:border-sirius hover:text-sirius">
        <span className="grid size-6 place-items-center rounded-lg bg-accent-soft text-sirius"><HeartPulse size={13} /></span>
        Pulse
        {myPulse != null && !lapsed && <span className="tabular font-display text-[15px] font-bold text-fg">{myPulse}</span>}
        {/* The re-pulse prompt has to survive the collapse — a missing or
            lapsed pulse is the whole reason an account can't be scored. */}
        {age == null
          ? <span className="font-body text-[11.5px] font-medium text-[#B23A57]">Not recorded</span>
          : lapsed
            ? <span className="font-body text-[11.5px] font-medium text-[#B23A57]">Lapsed</span>
            : <span className="font-body text-[11.5px] font-normal text-fg-subtle">{age}d ago</span>}
      </button>

      {open && (
        <PulseDrawer
          clientId={clientId} pulse={pulse} dimensions={dimensions} tiers={tiers}
          summary={summary} readOnly={!canEdit}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}
