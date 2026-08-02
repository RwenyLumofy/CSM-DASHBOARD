"use client";

/* =========================================================================
   CS Pulse capture drawer — the CSM's read on an account (stakeholders,
   engagement, renewal), rated against the workspace's configured dimensions
   and rating tiers. Saving records the pulse and re-scores the account.
   Extracted from CsPulsePanel so both the account profile AND the "Pulse due"
   queue open the exact same capture UI (one flow, no drift).
   ========================================================================= */

import { useState, type ReactNode } from "react";
import { Loader2, Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PULSE_RISK_FLAGS, PULSE_COVERAGE, PULSE_VALIDITY_DAYS, findTier, pulseScore,
  type StoredPulse, type PulseDimension, type RatingTier,
} from "@/lib/health/pulse";
import { setClientPulseAction } from "@/app/(app)/clients/pulse-actions";

/* findTier and pulseScore moved to lib/health/pulse.ts — the Pulse is now an
   input to the client health score, and the repo layer that computes health
   cannot import from a "use client" module. Re-exported here so the existing
   importers of this file keep working and there is still one implementation. */
export { findTier, pulseScore } from "@/lib/health/pulse";

/** Colour a tier by its score, so any renamed/added tier gets a sensible hue. */
export const tierColor = (score: number) => (score >= 75 ? "#1F9D63" : score >= 50 ? "#6E8B1E" : score >= 25 ? "#C2610E" : "#B23A57");

/** Yes / No / Not sure. One control for every qualitative signal — the colour
 *  carries the polarity (a Yes on a risk is bad; a Yes on coverage is good) so
 *  the input itself can stay identical everywhere. */
function TriState({ value, onChange, yesIsGood }: {
  value: boolean | undefined;
  onChange: (next: boolean | undefined) => void;
  yesIsGood: boolean;
}) {
  const GOOD = "border-transparent bg-[#1F9D63] text-white";
  const BAD = "border-transparent bg-[#B23A57] text-white";
  return (
    <div className="flex shrink-0 gap-1">
      {([[true, "Yes"], [false, "No"], [undefined, "Not sure"]] as const).map(([val, label]) => (
        <button key={label} type="button" aria-pressed={value === val} onClick={() => onChange(val)}
          className={cn("rounded-lg border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
            value !== val ? "border-border bg-surface text-fg-muted hover:border-border-strong"
              : val === undefined ? "border-border bg-bg-muted text-fg-muted"
              : val === yesIsGood ? GOOD : BAD)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * One signal row. When the answer is the penalising one, it states what that
 * costs — because the flags do NOT move either number in this drawer (the
 * pulse total is the dimension ratings only, and the engine caps status
 * without touching the score), so without this the control looks inert.
 *
 * Deliberately says what the ONE rule does, not what the account's status will
 * end up as: status is also capped by coverage, adoption and support, none of
 * which this drawer knows about, so a predicted verdict here would be
 * confidently wrong. `capsTo` is asserted against the real rule in
 * lib/health/engine.test.ts.
 */
function SignalRow({ name, desc, value, onChange, yesIsGood, capsTo, capWhen }: {
  name: string; desc: string; value: boolean | undefined;
  onChange: (next: boolean | undefined) => void; yesIsGood: boolean;
  capsTo: string; capWhen?: string | null;
}) {
  const penalising = value === !yesIsGood;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="font-body text-[13px] text-fg">{name}</span>
        <span className="block font-body text-[11.5px] text-fg-subtle">{desc}</span>
        {penalising && (
          <span className="mt-0.5 block font-body text-[11.5px] font-medium text-[#8A6D12]">
            ↳ caps this account&rsquo;s status at {capsTo}
            {capWhen ? ` — ${capWhen}` : ""}. The score itself is unchanged.
          </span>
        )}
      </span>
      <TriState value={value} onChange={onChange} yesIsGood={yesIsGood} />
    </div>
  );
}

export function PulseDrawer({ clientId, pulse, dimensions, tiers, onClose, onSaved, summary, readOnly = false }: {
  clientId: string; pulse: StoredPulse | null; dimensions: PulseDimension[]; tiers: RatingTier[]; onClose: () => void; onSaved: () => void;
  /** The current health read-out, rendered above the rating form. The account
   *  profile passes this so ONE sidebar answers both "where does health stand"
   *  and "record a new pulse" — the two used to be a page-level card plus this
   *  drawer, which meant the score was permanently occupying the profile. */
  summary?: ReactNode;
  /** Viewer can see health but not record a pulse: show the summary only,
   *  never the rating controls. The server action enforces this too. */
  readOnly?: boolean;
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
      <div role="dialog" aria-modal="true" aria-label={readOnly ? "Client health" : "Record CS Pulse"} className="pm-slide-in relative flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[540px]">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-fg">{readOnly ? "Client health" : "Client health & CS Pulse"}</h2>
            <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
              {readOnly
                ? "Your access level can't record a pulse."
                : `Your read on the relationship — 25% of the health score. Valid for ${PULSE_VALIDITY_DAYS} days.`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {summary}
          {!readOnly && dimensions.map((d) => {
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

          {!readOnly && (
          <>
            {/* BAD NEWS: a Yes is the risk. Grouped separately from coverage
                purely so the polarity is obvious — the control is the same. */}
            <div>
              <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Risk flags</h4>
              <p className="mb-1.5 font-body text-[11.5px] text-fg-subtle">
                A <b className="font-semibold text-fg">Yes</b> lowers the account&rsquo;s status. <b className="font-semibold text-fg">Not sure</b> leaves it
                alone — and for single-threading it lets the score read the answer off the contact record instead.
              </p>
              <div className="flex flex-col divide-y divide-border-subtle">
                {PULSE_RISK_FLAGS.map((s) => (
                  <SignalRow key={s.id} name={s.name} desc={s.desc} yesIsGood={false} capsTo={s.capsTo}
                    value={(signals as Record<string, boolean | undefined>)[s.id]}
                    onChange={(next) => setSignals((g) => ({ ...g, [s.id]: next }))} />
                ))}
              </div>
            </div>

            {/* GOOD NEWS: a Yes is the coverage. Here it's a No that penalises. */}
            <div>
              <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Relationship coverage</h4>
              <p className="mb-1.5 font-body text-[11.5px] text-fg-subtle">
                A <b className="font-semibold text-fg">No</b> lowers the account&rsquo;s status. <b className="font-semibold text-fg">Not sure</b> leaves it alone — say so rather than guessing.
              </p>
              <div className="flex flex-col divide-y divide-border-subtle">
                {PULSE_COVERAGE.map((s) => (
                  <SignalRow key={s.id} name={s.name} desc={s.desc} yesIsGood capsTo={s.capsTo} capWhen={s.capWhen}
                    value={(signals as Record<string, boolean | undefined>)[s.id]}
                    onChange={(next) => setSignals((g) => ({ ...g, [s.id]: next }))} />
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-1 font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Renewal intent</h4>
              <label className="flex items-center gap-3">
                <span className="flex-1 font-body text-[12.5px] text-fg-muted">The client&rsquo;s own posture toward renewing.</span>
                <select value={signals.renewalIntent ?? ""} onChange={(e) => setSignals((g) => ({ ...g, renewalIntent: (e.target.value || null) as StoredPulse["signals"]["renewalIntent"] }))}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body text-[12.5px] font-medium text-fg outline-none ring-sirius focus:ring-2">
                  <option value="">Not sure</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option>
                </select>
              </label>
            </div>
          </>
          )}

          {error && <div className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/8 px-3 py-2.5 font-body text-[12.5px] text-[#B23A57]"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
        </div>

        {!readOnly && (
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
        )}
      </div>
    </div>
  );
}
