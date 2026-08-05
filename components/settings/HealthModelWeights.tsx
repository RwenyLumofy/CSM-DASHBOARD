"use client";

/* =========================================================================
   The four component weights and the score bands — the shape of the health
   score itself.

   These replaced the old ten-metric "Formula" editor, which configured a
   scoring engine the recompute no longer calls. It still feeds the Insights
   reports, so it was not dead — but on a page called Client health it showed
   a formula that no longer decided anyone's health.

   Weights are normalised on save: the engine's redistribution assumes the
   enabled top-level weights total 1, and a part-finished edit saved at 90%
   would quietly inflate every score. The editor shows the running total and
   what each weight will become, so that normalisation is visible rather than
   a surprise after the fact.
   ========================================================================= */

import { useState } from "react";
import { Loader2, Plus, Save, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  WEIGHTED_COMPONENT_IDS, defaultComponentWeights, defaultBands,
  type HealthBandOverride, type WeightedComponentId,
} from "@/lib/health/model-overrides";
import { saveHealthModelShapeAction } from "@/app/(app)/settings/client-health-actions";

const NAMES: Record<WeightedComponentId, string> = {
  product: "Product Adoption and Value Realization",
  pulse: "Customer Success Pulse",
  support: "Support and Reliability",
  sentiment: "Client Sentiment",
};
const WHAT: Record<WeightedComponentId, string> = {
  product: "Reach, workflow progress, completions and use-case breadth — measured from product usage. Mandatory: an account with none of it cannot be scored.",
  pulse: "The three ratings the CSM records each month. Mandatory, and the only judgement in the model.",
  support: "SLA attainment, incident burden, aged tickets and ticket satisfaction, from Intercom.",
  sentiment: "Survey NPS.",
};
const inputCls = "rounded-lg border border-border bg-bg px-2.5 py-1.5 text-right font-body text-[13px] tabular-nums text-fg outline-none ring-sirius focus:ring-2";

let bandSeq = 0;

export function HealthModelWeights({
  initialWeights,
  initialBands,
}: {
  initialWeights: Record<WeightedComponentId, number>;
  initialBands: HealthBandOverride[];
}) {
  const [weights, setWeights] = useState(initialWeights);
  const [bands, setBands] = useState(initialBands);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const total = WEIGHTED_COMPONENT_IDS.reduce((s, id) => s + (weights[id] || 0), 0);
  const rounded = Math.round(total * 10) / 10;
  /** What each weight becomes once the engine normalises — the number that
   *  actually applies, which is not what you typed unless the total is 100. */
  const effective = (id: WeightedComponentId) => (total > 0 ? ((weights[id] || 0) / total) * 100 : 0);

  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveHealthModelShapeAction({
      componentWeights: weights,
      bands: [...bands].sort((a, b) => b.minScore - a.minScore),
    });
    setBusy(false);
    setMsg(r.ok
      ? { ok: true, text: `Saved · re-scored ${r.clientsUpdated ?? 0} accounts.` }
      : { ok: false, text: r.error ?? "Couldn't save." });
  }

  function reset() {
    setWeights(defaultComponentWeights());
    setBands(defaultBands());
    setMsg(null);
  }

  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="font-display text-sm font-semibold text-fg">What the score is made of</p>
        <p className="mb-4 mt-1 max-w-[70ch] font-body text-[12.5px] text-fg-muted">
          Four components. A component with no data for a given account is skipped and the rest
          reweight to fill the gap — never a faked zero. Product Adoption and CS Pulse are
          mandatory: an account missing either shows <b>Not assessed</b> rather than a score.
        </p>

        <div className="flex flex-col gap-2">
          {WEIGHTED_COMPONENT_IDS.map((id) => (
            <div key={id} className="rounded-lg border border-border-subtle px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 font-body text-[13.5px] font-semibold text-fg">{NAMES[id]}</span>
                <input
                  type="number" min={0} max={100} value={weights[id] ?? 0}
                  onChange={(e) => setWeights((w) => ({ ...w, [id]: Math.max(0, Number(e.target.value)) }))}
                  aria-label={`${NAMES[id]} weight`}
                  className={cn(inputCls, "w-20")}
                />
                <span className="w-24 text-right font-body text-[11.5px] text-fg-subtle">
                  {rounded === 100 ? " " : `applies as ${effective(id).toFixed(1)}%`}
                </span>
              </div>
              <p className="mt-1.5 max-w-[68ch] font-body text-[11.5px] leading-relaxed text-fg-subtle">{WHAT[id]}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span className={cn("font-body text-[12.5px] font-semibold", rounded === 100 ? "text-[#2DB47A]" : "text-[#C99A14]")}>
            Total: {rounded}%
          </span>
          {rounded !== 100 && (
            <span className="font-body text-[11.5px] text-fg-muted">
              Saved as-is and normalised to 100% — the applied figures are shown above.
            </span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="font-display text-sm font-semibold text-fg">Bands</p>
        <p className="mb-4 mt-1 max-w-[70ch] font-body text-[12.5px] text-fg-muted">
          Where a score lands before the gates and rules run. An account can score into Healthy and
          still be shown as Watch — that is the gates doing their job, and the score is never
          rewritten. Keep one band at 0 so every score has a home.
        </p>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_120px_auto] gap-2 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
            <span>Band</span><span>Min score (≥)</span><span />
          </div>
          {bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
              <input value={b.name} placeholder="Band name"
                onChange={(e) => setBands((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                className={cn(inputCls, "text-left")} />
              <input type="number" min={0} max={100} value={b.minScore}
                onChange={(e) => setBands((x) => x.map((y, j) => (j === i ? { ...y, minScore: Number(e.target.value) } : y)))}
                className={inputCls} />
              <button onClick={() => setBands((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))}
                disabled={bands.length <= 1} aria-label={`Remove ${b.name}`}
                className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-[#B23A57]/10 hover:text-[#B23A57] disabled:opacity-40">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button onClick={() => setBands((x) => [...x, { name: `Band ${++bandSeq}`, minScore: 0 }])}
            className="mt-1 flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:border-sirius hover:text-sirius">
            <Plus size={14} /> Add band
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {sorted.map((b, i) => (
            <span key={i} className="rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] text-fg-muted">
              <span className="font-semibold text-fg">{b.name || "—"}</span>{" "}
              {b.minScore}–{i === 0 ? 100 : sorted[i - 1].minScore - 1}
            </span>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void save()} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save and re-score
        </button>
        <button onClick={reset} className="inline-flex items-center gap-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
          <RotateCcw size={13} /> Reset to defaults
        </button>
        {msg && <span className={cn("font-body text-[12.5px]", msg.ok ? "text-[#2DB47A]" : "text-[#B23A57]")}>{msg.text}</span>}
      </div>
    </div>
  );
}
