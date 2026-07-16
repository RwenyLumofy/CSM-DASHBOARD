import { Lightbulb } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import type { HealthDrag, SignalKind } from "@/lib/metrics/health-drag";
import { KIND_BLURB, KIND_LABEL } from "@/lib/metrics/health-drag";
import { cn } from "@/lib/cn";

/* "Why is health 67?"
   A score alone is unarguable and unactionable. Every client already persists
   its per-metric subscores, so the average decomposes with no new data: this
   ranks what each metric COSTS the portfolio, which turns one number into a
   list of levers.

   The colour split is the actual insight, not decoration. These nine metrics
   measure two different things and averaging them together is why the score
   reads as a mystery: `usage`/`nps`/`csat` are signals about the CUSTOMER, but
   `stakeholder_mapping`/`profile_complete`/`use_case_set` are binary checks on
   OUR OWN record-keeping — a zero there is an unfilled field, not an unhappy
   customer. On live data that's ~a third of the whole deficit, and it's fixable
   this afternoon without talking to anyone. */

const KIND_COLOR: Record<SignalKind, { bar: string; chip: string; text: string }> = {
  customer: { bar: "var(--color-danger)", chip: "bg-danger-bg text-danger-fg", text: "text-danger-fg" },
  delivery: { bar: "var(--color-warning)", chip: "bg-warning-bg text-warning-fg", text: "text-warning-fg" },
  record: { bar: "var(--color-eclipse)", chip: "bg-eclipse-bg text-eclipse-fg", text: "text-eclipse-fg" },
};

export function HealthDragPanel({ drag }: { drag: HealthDrag }) {
  const totalDrag = drag.metrics.reduce((a, m) => a + m.drag, 0);
  const maxDrag = Math.max(...drag.metrics.map((m) => m.drag), 0.1);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardEyebrow>Health, explained</CardEyebrow>
          <h3 className="h5">Why the score is {Math.round(drag.avgHealth)}</h3>
        </div>
        {/* 100 − drag = score, stated as arithmetic so the number stops being
            a black box. */}
        <div className="flex items-baseline gap-1.5 font-display">
          <span className="tabular text-lg font-bold text-fg-subtle">100</span>
          <span className="tabular text-lg font-bold text-danger-fg">−{totalDrag.toFixed(0)}</span>
          <span className="text-sm text-fg-subtle">=</span>
          <span className="tabular text-2xl font-bold text-fg">{Math.round(drag.avgHealth)}</span>
        </div>
      </div>

      {/* what KIND of thing is costing the points */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex h-2.5 overflow-hidden rounded-pill">
          {drag.byKind.map((k) => (
            <span key={k.kind} style={{ width: `${k.share * 100}%`, background: KIND_COLOR[k.kind].bar }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {drag.byKind.map((k) => (
            <span key={k.kind} className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-muted">
              <span className="inline-block size-2 rounded-[2px]" style={{ background: KIND_COLOR[k.kind].bar }} />
              <span className="font-semibold text-fg">{Math.round(k.share * 100)}%</span> {KIND_LABEL[k.kind].toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* the quick win — the highest-value thing on this card */}
      {drag.quickWin && (
        <div className="mb-4 flex items-start gap-2.5 rounded-md border border-eclipse-bg bg-eclipse-bg/50 px-3 py-2.5">
          <Lightbulb size={14} strokeWidth={2} className="mt-[2px] shrink-0 text-eclipse-fg" aria-hidden />
          <p className="font-body text-[12.5px] leading-relaxed text-eclipse-fg">
            <strong className="font-semibold">{drag.quickWin.label} costs {drag.quickWin.drag.toFixed(1)} points</strong>{" "}
            — {drag.quickWin.zeros} of {drag.accounts} accounts score zero on it. That&apos;s an empty field in Signal,
            not an unhappy customer. Filling it in is the single biggest lever on this number.
          </p>
        </div>
      )}

      {/* Ranked drags.
          Two lines per metric, not one. The first cut crammed name + bar + drag
          + score into a single row: names truncated ("Stakeholder ma…",
          "Breached SLA ti…") and — worse — the BAR encoded drag (longer = worse)
          while the number beside it encoded score (higher = better), so a row
          read "long red bar … 51/100" and the eye had to reconcile two opposite
          scales. The bar and the headline number now both mean COST; the score
          and coverage are context underneath, in words. */}
      <ul className="flex flex-col gap-3">
        {drag.metrics.map((m) => {
          const c = KIND_COLOR[m.kind];
          return (
            <li key={m.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-body text-[13px] font-semibold text-fg">{m.label}</span>
                <span className={cn("tabular shrink-0 font-body text-[13px] font-bold", c.text)}>
                  −{m.drag.toFixed(1)} pts
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-pill bg-bg-muted">
                <div
                  className="h-full rounded-pill transition-all duration-[220ms]"
                  style={{ width: `${Math.max(1.5, (m.drag / maxDrag) * 100)}%`, background: c.bar }}
                />
              </div>

              <p className="caption">
                Scores <strong className="tabular font-semibold text-fg">{m.avgScore.toFixed(0)}/100</strong> across{" "}
                {m.covered} {m.covered === 1 ? "account" : "accounts"}
                {m.missing > 0 && <> · {m.missing} skipped (no data)</>}
                {m.zeros > 0 && (
                  <>
                    {" · "}
                    <strong className={cn("font-semibold", c.text)}>{m.zeros} at zero</strong>
                    {m.binary && " — an unfilled field"}
                  </>
                )}
                {" · worth "}
                {(m.share * 100).toFixed(0)}% of the formula
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        {drag.byKind.map((k) => (
          <p key={k.kind} className="caption">
            <span className={cn("font-semibold", KIND_COLOR[k.kind].text)}>{KIND_LABEL[k.kind]}</span> — {KIND_BLURB[k.kind]}
          </p>
        ))}
        {/* Honest about the arithmetic: this is a portfolio-level
            approximation, and it should say so rather than let someone find the
            1-point gap themselves and distrust the whole card. */}
        <p className="caption mt-1 text-fg-subtle">
          Drag = the metric&apos;s share of the formula × how far its average sits below 100. A metric with no data for
          an account is skipped there, not scored zero, so each account renormalises its own weights — which is why the
          drags sum to within ~1 point of the exact average rather than exactly onto it.
        </p>
      </div>
    </Card>
  );
}
