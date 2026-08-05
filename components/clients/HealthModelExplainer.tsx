"use client";

/* =========================================================================
   How the score works — one disclosure at the top of Health signals.

   Collapsed by default: a CSM opening a profile wants THIS account's verdict,
   not methodology. The rules are a question you ask once, or when you disagree
   with a number.

   SHOWN, NOT WRITTEN. The first version of this was four numbered steps of
   prose — accurate, and nobody would read it twice. Weights are a proportion,
   so they are drawn as one; bands are a scale, so they are drawn as one. The
   text that survives is caption-length and says why a stage exists, which the
   picture cannot.

   Every figure comes from the assembled model the account was scored with —
   nothing is typed into this file. Retune a weight in Settings and this
   changes with it. See lib/health/describe-model.ts for why that matters.
   ========================================================================= */

import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ModelSummary } from "@/lib/health/describe-model";
import { STATUS_COLOR } from "@/lib/health/to-stored";

const pct = (w: number) => `${Math.round(w * 100)}%`;

/* Weight segments read as proportion, not status, so they share one hue and
   step down in weight order — position is the only thing they encode. */
const WEIGHT_RAMP = ["#4C6FFF", "#7B93FF", "#A6B7FF", "#CBD5FF", "#E2E8FF"];
const NEUTRAL = "#9AA0A6";
const at = (ramp: string[], i: number) => ramp[i] ?? NEUTRAL;

/* Statuses take the colour they already wear on the pill, the clients list and
   every other surface. Keyed by NAME, not by position: the escalation groups
   run Churned → Watch while the bands run Healthy → Critical, and indexing both
   off their own loop painted Churned green and Watch red. Bands are renameable,
   so an unrecognised one falls back to a severity ramp by rank. */
const BAND_FALLBACK = ["#1F9D63", "#C99A14", "#C2610E", "#B23A57"];
const statusColor = (name: string, rank = -1) =>
  STATUS_COLOR[name] ?? BAND_FALLBACK[rank] ?? NEUTRAL;

export function HealthModelExplainer({ model }: { model: ModelSummary }) {
  const [open, setOpen] = useState(false);
  const required = model.components.filter((c) => c.mandatory);
  const top = model.bands[0];
  const floor = Math.min(...model.bands.map((b) => b.min));
  const ceil = Math.max(...model.bands.map((b) => b.max));
  const span = ceil - floor || 100;

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-bg-muted"
      >
        <Info size={13} className="shrink-0 text-fg-subtle" aria-hidden />
        <span className="font-body text-[12.5px] font-semibold text-fg">How this score is calculated</span>
        <ChevronRight size={13} className={cn("ml-auto shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-5 border-t border-border-subtle px-3.5 py-4">

          {/* ---- what it's made of: one bar, because it IS a proportion ---- */}
          <section className="flex flex-col gap-2">
            <h4 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              What it&rsquo;s made of
            </h4>
            <div className="flex h-2.5 w-full overflow-hidden rounded-pill">
              {model.components.map((c, i) => (
                <span key={c.id} style={{ width: pct(c.weight), background: at(WEIGHT_RAMP, i) }} />
              ))}
            </div>
            <ul className="flex flex-col gap-1">
              {model.components.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 font-body text-[12px]">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: at(WEIGHT_RAMP, i) }} aria-hidden />
                  <span className="tabular w-8 shrink-0 font-semibold text-fg">{pct(c.weight)}</span>
                  <span className="min-w-0 truncate text-fg-muted">{c.name}</span>
                  {c.mandatory && (
                    <span className="ml-auto shrink-0 font-body text-[10px] font-semibold uppercase tracking-[0.05em] text-[#B23A57]">
                      Required
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="font-body text-[11.5px] leading-relaxed text-fg-subtle">
              A component with no data is skipped and the others re-share its weight &mdash; never counted
              as a zero.
              {required.length > 0 && <> Without the required {required.length === 1 ? "one" : "ones"}, the account isn&rsquo;t scored at all.</>}
            </p>
          </section>

          {/* ---- where it lands: one scale, because it IS a scale ---- */}
          <section className="flex flex-col gap-2">
            <h4 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              Where the number lands
            </h4>
            <div className="flex h-2.5 w-full flex-row-reverse overflow-hidden rounded-pill">
              {model.bands.map((b, i) => (
                <span key={b.name} style={{ width: `${((b.max - b.min + 1) / span) * 100}%`, background: statusColor(b.name, i) }} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {[...model.bands].reverse().map((b, i) => (
                <li key={b.name} className="flex items-center gap-1.5 font-body text-[11.5px]">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: statusColor(b.name, model.bands.length - 1 - i) }} aria-hidden />
                  <span className="font-semibold text-fg">{b.name}</span>
                  <span className="tabular text-fg-subtle">{b.min}&ndash;{b.max}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- the checks ---- */}
          <section className="flex flex-col gap-2">
            <h4 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              Checks for {top?.name ?? "the top band"}
            </h4>
            <p className="font-body text-[11.5px] leading-relaxed text-fg-subtle">
              A weighted average can&rsquo;t see that an account rests on one relationship. These can, and
              all of them must hold.
            </p>
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg bg-surface ring-1 ring-inset ring-border-subtle">
              {model.gates.map((g) => (
                <li key={g.name} className="flex items-baseline gap-2 px-2.5 py-1.5 font-body text-[12px]">
                  <span className="min-w-0 truncate text-fg-muted">{g.name}</span>
                  <span className="ml-auto shrink-0 font-body text-[10.5px] text-fg-subtle">else {g.capTo}</span>
                </li>
              ))}
            </ul>
            <p className="font-body text-[11.5px] leading-relaxed text-fg-subtle">
              Below {pct(model.coverageCap.threshold)} data coverage it caps at {model.coverageCap.capTo} too
              &mdash; a confident grade on thin evidence reads as a reason not to call.
            </p>
          </section>

          {/* ---- the overrides ---- */}
          <section className="flex flex-col gap-2">
            <h4 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              What overrides the score outright
            </h4>
            <div className="flex flex-col gap-1.5">
              {model.escalations.map((e) => (
                <div key={e.status} className="flex gap-2.5">
                  <span
                    className="mt-[3px] w-[68px] shrink-0 font-body text-[11px] font-bold"
                    style={{ color: statusColor(e.status) }}
                  >
                    {e.status}
                  </span>
                  <span className="min-w-0 font-body text-[11.5px] leading-relaxed text-fg-muted">
                    {e.triggers.join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <p className="border-t border-border-subtle pt-3 font-body text-[11.5px] leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg">A failed check moves the status, never the score.</strong>{" "}
            That&rsquo;s why an account can read 73 and still sit on Watch. Set in Settings &rarr; Client health.
          </p>
        </div>
      )}
    </div>
  );
}
