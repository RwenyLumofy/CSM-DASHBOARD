"use client";

/* =========================================================================
   Health signals — the verdict first, then the evidence.

   The question this card exists to answer is "why is this account 73 and still
   on Watch?", and it was answered by putting a 73 and the word Watch next to
   each other and leaving the reader to infer the relationship. The score and
   the applied status are two different answers: 73 lands in the Healthy band,
   two qualification gates failed, and a failed gate caps the STATUS without
   ever touching the SCORE.

   So: a sentence saying what happened, the reasons numbered with what clears
   each one, then the signals — every row openable to a plain-English line
   saying what it measures and the figures behind it. The CSM's own pulse
   ratings read back as "You rated this Weak", not as a 40 they never typed.
   ========================================================================= */

import { useState } from "react";
import { Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HealthBreakdown, BreakdownLeaf } from "@/lib/health/breakdown";
import { HealthModelExplainer } from "./HealthModelExplainer";

const tone = (v: number) => (v >= 75 ? "aurora" : v >= 55 ? "stellar" : "nova");
const BAR: Record<string, string> = { aurora: "bg-[#1F9D63]", stellar: "bg-[#C99A14]", nova: "bg-[#C2610E]" };
const TEXT: Record<string, string> = { aurora: "text-[#1F9D63]", stellar: "text-[#8A6D12]", nova: "text-[#C2610E]" };

function Signal({ s, nested }: { s: BreakdownLeaf; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const expandable = !!(s.means || s.evidence);
  const t = s.value == null ? "nova" : tone(s.value);

  return (
    <div className={cn(nested && "pl-4")}>
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        className={cn(
          "grid w-full grid-cols-[1fr_auto_2rem_2.5rem] items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left sm:grid-cols-[1fr_6rem_2rem_2.5rem]",
          expandable && "hover:bg-bg-muted",
        )}
      >
        <span className="flex min-w-0 items-center gap-1 font-body text-[12.5px] text-fg-muted">
          {expandable && (
            <ChevronRight size={12} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
          )}
          <span className="truncate">{s.name}</span>
        </span>
        {s.value == null ? (
          <span className="hidden h-1.5 rounded-pill bg-bg-muted sm:block" />
        ) : (
          <span className="hidden h-1.5 overflow-hidden rounded-pill bg-bg-muted sm:block">
            <span className={cn("block h-full rounded-pill", BAR[t])} style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} />
          </span>
        )}
        <span className={cn("tabular text-right font-body text-[12.5px] font-semibold", s.value == null ? "text-fg-subtle" : TEXT[t])}>
          {s.value == null ? "—" : s.value}
        </span>
        <span className="tabular text-right font-body text-[10.5px] text-fg-subtle">
          {s.share >= 0.05 ? `${Math.round(s.share * 10) / 10}%` : ""}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1 px-1.5 pb-2.5 pl-7">
          {s.means && <p className="max-w-[62ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{s.means}</p>}
          {s.evidence && <p className="font-body text-[11.5px] text-fg-subtle">{s.evidence}</p>}
          {s.value == null && <p className="font-body text-[11.5px] italic text-fg-subtle">No data for this account — its weight moves to the others.</p>}
        </div>
      )}
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
  const { score, band, applied, capped, reasons, coverage, momentum, components, model } = breakdown;
  const t = tone(score);
  const r = 34, circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col gap-5">
      <HealthModelExplainer model={model} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative grid size-[78px] shrink-0 place-items-center">
          <svg width="78" height="78" className="-rotate-90" aria-hidden>
            <circle cx="39" cy="39" r={r} fill="none" stroke="var(--color-bg-muted)" strokeWidth="7" />
            <circle cx="39" cy="39" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
              stroke={t === "aurora" ? "#1F9D63" : t === "stellar" ? "#C99A14" : "#C2610E"}
              strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0, Math.min(100, score)) / 100)} />
          </svg>
          <span className="absolute tabular font-display text-[25px] font-bold text-fg">{score}</span>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-pill px-2.5 py-1 font-body text-[13px] font-semibold",
              capped ? "bg-[#C99A14]/15 text-[#8A6D12]" : "bg-accent-soft text-sirius")}>
              {applied}
            </span>
            {capped && band && (
              /* The band it earned, struck through — the single clearest way to
                 show "you got here, then something took it away". */
              <span className="rounded-pill bg-bg-muted px-2.5 py-1 font-body text-[13px] font-medium text-fg-subtle line-through">
                {band}
              </span>
            )}
          </span>
          <span className="font-body text-[11.5px] text-fg-subtle">
            {coverage != null && `${Math.round(coverage * 100)}% data coverage`}
            {momentum && ` · ${momentum.toLowerCase()}`}
          </span>
        </div>

        <button onClick={onRecalculate} disabled={recalculating}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:opacity-50">
          {recalculating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalculate
        </button>
      </div>

      {reasons.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-[#C99A14]/30 bg-[#C99A14]/[0.06] px-4 py-3.5">
          <p className="font-body text-[14.5px] font-semibold leading-snug text-fg">
            {capped && band
              ? <>This account scores well enough to be <span className="text-[#8A6D12]">{band}</span>, but {reasons.length === 1 ? "one check" : `${reasons.length} checks`} failed — so it&rsquo;s held at <span className="text-[#8A6D12]">{applied}</span>.</>
              : <>What&rsquo;s holding this account back</>}
          </p>
          <ul className="flex flex-col gap-2">
            {reasons.map((x, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-px grid size-[19px] shrink-0 place-items-center rounded-full bg-[#C99A14] font-body text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-[13px] leading-relaxed text-fg">{x.text}</span>
                  {/* The distance, not just the rule. "63 → 75, 12 points short"
                      is what tells a CSM whether this is one conversation away
                      or a quarter of work; the sentence alone never said. */}
                  {x.gap && (
                    <span className="mt-1.5 block max-w-[22rem]">
                      <span className="flex items-baseline justify-between gap-2 font-body text-[11.5px]">
                        <span className="text-fg-muted">
                          {x.gap.label} is <span className="tabular font-semibold text-fg">{x.gap.actual}</span>
                          {" · needs "}
                          <span className="tabular font-semibold text-fg">{x.gap.target}</span>
                        </span>
                        <span className="shrink-0 tabular text-fg-subtle">{x.gap.distance}</span>
                      </span>
                      <span className="relative mt-1 block h-1.5 overflow-hidden rounded-pill bg-bg-muted">
                        <span className="block h-full rounded-pill bg-[#C99A14]" style={{ width: `${x.gap.progress * 100}%` }} />
                      </span>
                    </span>
                  )}
                  {x.remedy && <span className="mt-1.5 block font-body text-[12.5px] leading-relaxed text-fg-muted">{x.remedy}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {components.map((c) => (
          <div key={c.id} className="flex flex-col">
            <div className="flex items-baseline gap-2 border-b border-border-subtle pb-1">
              <span className="font-body text-[13px] font-semibold text-fg">{c.name}</span>
              {c.value != null && (
                <span className={cn("tabular font-body text-[13px] font-bold", TEXT[tone(c.value)])}>{c.value}</span>
              )}
              {c.mandatory && (
                <span className="rounded bg-[#B23A57]/10 px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#B23A57]">
                  Required
                </span>
              )}
              <span className="ml-auto font-body text-[10.5px] text-fg-subtle">{Math.round(c.share)}% of the score</span>
            </div>
            {c.value == null && c.mandatory && (
              <p className="px-1.5 pt-1.5 font-body text-[11.5px] text-[#C2610E]">
                No data here, so this account can&rsquo;t be scored at all.
              </p>
            )}
            {/* A component with children lists them, each openable. One without
                children IS the signal, so it explains itself inline rather than
                repeating its own name as a row beneath its own header. */}
            {c.children.length > 0 ? (
              <div className="pt-0.5">
                {c.children.map((k) => <Signal key={k.id} s={k} nested />)}
              </div>
            ) : (
              (c.means || c.evidence) && (
                <div className="flex flex-col gap-1 px-1.5 pt-1.5">
                  {c.means && <p className="max-w-[62ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{c.means}</p>}
                  {c.evidence && <p className="font-body text-[11.5px] text-fg-subtle">{c.evidence}</p>}
                </div>
              )
            )}
          </div>
        ))}
      </div>

      <p className="font-body text-[11.5px] leading-relaxed text-fg-subtle">
        Open any signal to see what it measures. Percentages are its share of the whole score, set in
        Settings → Client health. A signal with no data is skipped and the rest reweight to fill the
        gap — never a guessed value.
      </p>
    </div>
  );
}
