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
import { AlertTriangle, ChevronDown, HeartPulse } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_VALIDITY_DAYS, pulseAgeDays, type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { PulseDrawer, pulseScore } from "./PulseDrawer";
import { HEALTH_METRIC_LABELS } from "@/lib/metrics/health-config";
import { isAssessed } from "@/lib/metrics/health-evidence";
import type { HealthScore, HealthMetricKey } from "@/lib/types";

/* HealthLite and momentumChip are gone with the model-v1 read-out they served.
   That engine produced a second score, band and momentum for this drawer while
   the header showed a different number from a different calculation. CS Pulse
   is now a weighted metric inside the one score, so the drawer explains that
   score instead of competing with it. The engine's momentum, data-coverage and
   driver narrative have no equivalent in HealthScore and are not reproduced
   here — a real, deliberate loss, recorded in
   docs/specs/health/cs-pulse-as-a-health-metric.md. */

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
  /** THE health score — the same object behind the header ring, not a second
   *  opinion. CS Pulse is one weighted metric inside it now, so the drawer
   *  explains the number the rest of the app shows rather than producing a
   *  rival one from a parallel engine. */
  health: HealthScore | null;
  pulse: StoredPulse | null;
  dimensions: PulseDimension[];
  tiers: RatingTier[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* The per-metric breakdown, collapsed by default. Ten rows of numbers above
     the ratings made this drawer read as a report to study rather than a form
     to fill in, and pushed the thing you came to do below the fold. */
  const [showBreakdown, setShowBreakdown] = useState(false);
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

  /* Every metric that counted for this account, biggest contributor first, so
     the drawer answers "why is it that number" rather than just restating it.
     A metric with no data for this client is absent from `components` entirely
     — never a faked zero — which is why this reads the object rather than the
     configured list. */
  const contributions = Object.entries(health?.components ?? {})
    .sort((a, b) => b[1] - a[1]) as [HealthMetricKey, number][];
  const pulseCounted = contributions.some(([k]) => k === "cs_pulse");

  const summary = (
    <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Account health</span>
        <span className={cn("font-body text-[12px]", freshness.tone)}>{freshness.t}</span>
      </div>

      {health && !isAssessed(health) ? (
        /* Distinct from "not computed yet" below: this one HAS been computed,
           and the number is the problem. With no usage, survey, support or
           Pulse data it reflects only how completely the Signal record is
           filled in — which is how an account with no evidence at all showed
           as "Healthy, 76". Recording a Pulse is the fastest way out, which is
           why this says so here rather than anywhere else. */
        <div className="flex items-start gap-2 font-body text-[12.5px] text-fg-muted">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#C99A14]" />
          <span>
            <span className="font-semibold text-fg">Not assessed.</span> There&rsquo;s no usage, survey,
            support or CS Pulse data for this account, so there is nothing to score it on yet.
            Recording a Pulse below would give it one.
          </span>
        </div>
      ) : health ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[34px] font-bold leading-none tabular-nums text-fg">{health.score}</span>
            <span className="rounded-full px-2 py-0.5 font-body text-[12px] font-semibold"
              style={{ color: health.tierColor, backgroundColor: `${health.tierColor}1F` }}>{health.tier}</span>
            {health.trend !== 0 && (
              <span className="font-body text-[12px] text-fg-muted">
                {health.trend > 0 ? "▲" : "▼"} {Math.abs(health.trend)} pts
              </span>
            )}
          </div>
          <p className="font-body text-[11.5px] text-fg-subtle">
            The same score as the ring at the top of this page. CS Pulse is one of its inputs
            {pulseCounted ? "" : " — and is not counting for this account yet"}.
          </p>

          {contributions.length > 0 && (
            <dl className="flex flex-col gap-1 border-t border-border-subtle pt-2">
              {/* Collapsed by default — the full list ran to ten rows and pushed
                  the ratings you came here to set below the fold. CS Pulse
                  itself stays visible whatever the state: it is the one number
                  this drawer exists to explain, and hiding it behind a toggle
                  would answer "why is it that score" with a click. */}
              {(showBreakdown ? contributions : contributions.filter(([k]) => k === "cs_pulse")).map(([key, value]) => (
                <div key={key} className={cn("flex items-center gap-2", key === "cs_pulse" && "font-semibold")}>
                  <dt className={cn("flex-1 font-body text-[12px]", key === "cs_pulse" ? "text-fg" : "text-fg-muted")}>
                    {HEALTH_METRIC_LABELS[key] ?? key}
                  </dt>
                  <dd className="tabular font-body text-[12px] text-fg">{Math.round(value)}</dd>
                </div>
              ))}

              {contributions.length > (pulseCounted ? 1 : 0) && (
                <button type="button" onClick={() => setShowBreakdown((s) => !s)}
                  aria-expanded={showBreakdown}
                  className="mt-0.5 inline-flex w-fit items-center gap-1 font-body text-[11.5px] font-medium text-sirius hover:underline">
                  <ChevronDown size={12} className={cn("transition-transform", showBreakdown && "rotate-180")} aria-hidden />
                  {showBreakdown
                    ? "Hide the full breakdown"
                    : `Show the full breakdown (${contributions.length} inputs)`}
                </button>
              )}
            </dl>
          )}
        </>
      ) : (
        <div className="flex items-start gap-2 font-body text-[12.5px] text-fg-muted">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[#C99A14]" />
          <span>No health score has been computed for this account yet.</span>
        </div>
      )}

      {/* THREE reasons Pulse might not be counting, and they need different
          words. Collapsing them into "no pulse or a lapsed one" told an account
          with a 7-day-old Pulse that it was past the 30-day window — a message
          that is simply false, and sends the CSM to re-pulse something that is
          already fresh. The third case is the common one immediately after this
          shipped: a stored score computed before cs_pulse was a metric, which
          nothing can fix except a recompute. */}
      {!pulseCounted && health && (
        <p className="flex items-start gap-2 font-body text-[12px] text-fg-muted">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#C99A14]" />
          <span>{
            age == null
              ? "No CS Pulse recorded, so it contributes nothing and the other metrics carry the score between them. Recording one will move health."
              : age > PULSE_VALIDITY_DAYS
                ? `The last CS Pulse is ${age} days old, past the ${PULSE_VALIDITY_DAYS}-day window, so it has stopped counting. Re-pulse to bring it back in.`
                : "This score was calculated before CS Pulse became part of it. The Pulse is current — the score just hasn't been recalculated yet. Saving a pulse recalculates immediately, and the nightly run picks it up either way."
          }</span>
        </p>
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
