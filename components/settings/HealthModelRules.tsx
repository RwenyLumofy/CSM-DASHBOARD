"use client";

/* =========================================================================
   The judgement half of the health model: the qualification gates that decide
   whether an account can read Healthy, and the status rules that cap, force or
   replace its status.

   These used to live only in code, so retuning "CS Pulse must be ≥ 75" meant a
   deploy. They are the part a CS leader most needs to move as the book
   changes, and the part most likely to be wrong on the first guess.

   NOT A CONDITION BUILDER, deliberately. A rule can be switched off, have its
   single number moved, and have its cap target changed. It cannot be rewritten.
   The conditions encode what a signal MEANS — "renewal intent is negative" —
   and a free-text editor there produces a model that still runs and silently
   measures something else.
   ========================================================================= */

import { useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { editableThreshold, type HealthModelOverrides, type RuleOverride } from "@/lib/health/model-overrides";
import { saveHealthModelRulesAction } from "@/app/(app)/settings/client-health-actions";

export interface RuleView {
  id: string;
  name: string;
  /** Plain-English restatement of `when`, written by the server. */
  reads: string;
  /** What firing does — "caps to Watch", "forces Critical". */
  effect: string;
  priority?: number;
  shippedEnabled: boolean;
  shippedThreshold: number | null;
  when: Record<string, Record<string, unknown>>;
}

type Draft = Record<string, RuleOverride>;

function Row({ r, draft, onChange }: { r: RuleView; draft: Draft; onChange: (id: string, patch: RuleOverride | null) => void }) {
  const o = draft[r.id] ?? {};
  const enabled = o.enabled ?? r.shippedEnabled;
  const threshold = o.threshold ?? r.shippedThreshold;
  const changed = o.enabled != null || o.threshold != null;

  return (
    <div className={cn("grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-3", !enabled && "opacity-55")}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${r.name}`}
        onClick={() => onChange(r.id, enabled === r.shippedEnabled ? { ...o, enabled: !enabled } : { ...o, enabled: undefined })}
        className={cn(
          "mt-0.5 h-[18px] w-8 shrink-0 rounded-pill border transition-colors",
          enabled ? "border-sirius bg-sirius" : "border-border bg-bg-muted",
        )}
      >
        <span className={cn("block size-3.5 rounded-pill bg-white transition-transform", enabled ? "translate-x-[15px]" : "translate-x-[2px]")} />
      </button>

      <div className="min-w-0">
        <p className="font-body text-[13.5px] font-semibold text-fg">
          {r.name}
          {changed && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 font-body text-[10px] font-semibold text-sirius">edited</span>}
        </p>
        <p className="mt-0.5 font-body text-[12px] leading-relaxed text-fg-muted">{r.reads}</p>
        <p className="mt-0.5 font-body text-[11.5px] text-fg-subtle">{r.effect}</p>
      </div>

      {r.shippedThreshold != null ? (
        <input
          type="number"
          value={threshold ?? ""}
          disabled={!enabled}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            onChange(r.id, v == null || v === r.shippedThreshold ? { ...o, threshold: undefined } : { ...o, threshold: v });
          }}
          aria-label={`${r.name} threshold`}
          className="w-20 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-right font-body text-[13px] tabular-nums text-fg outline-none ring-sirius focus:ring-2 disabled:opacity-50"
        />
      ) : (
        <span className="w-20 pt-1.5 text-right font-body text-[11.5px] text-fg-subtle">on / off</span>
      )}
    </div>
  );
}

export function HealthModelRules({
  gates,
  rules,
  initial,
  minCoverage,
}: {
  gates: RuleView[];
  rules: RuleView[];
  initial: HealthModelOverrides;
  minCoverage: number;
}) {
  const [gateDraft, setGateDraft] = useState<Draft>(initial.gates ?? {});
  const [ruleDraft, setRuleDraft] = useState<Draft>(initial.rules ?? {});
  const [cov, setCov] = useState(Math.round((initial.minCoverage ?? minCoverage) * 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* An override that matches the shipped value is dropped rather than stored,
     so "reset" really means reset — a saved copy of the default would pin the
     rule if the model's own default ever moves. */
  const clean = (d: Draft): Draft => {
    const out: Draft = {};
    for (const [k, v] of Object.entries(d)) {
      const e: RuleOverride = {};
      if (v.enabled != null) e.enabled = v.enabled;
      if (v.threshold != null) e.threshold = v.threshold;
      if (v.targetStatus) e.targetStatus = v.targetStatus;
      if (Object.keys(e).length) out[k] = e;
    }
    return out;
  };

  const edits = Object.keys(clean(gateDraft)).length + Object.keys(clean(ruleDraft)).length;

  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveHealthModelRulesAction({
      gates: clean(gateDraft),
      rules: clean(ruleDraft),
      minCoverage: cov / 100,
    });
    setBusy(false);
    setMsg(r.ok
      ? { ok: true, text: `Saved · re-scored ${r.clientsUpdated ?? 0} accounts.` }
      : { ok: false, text: r.error ?? "Couldn't save." });
  }

  function reset() {
    setGateDraft({}); setRuleDraft({}); setCov(Math.round(minCoverage * 100)); setMsg(null);
  }

  const change = (set: React.Dispatch<React.SetStateAction<Draft>>) => (id: string, patch: RuleOverride | null) =>
    set((d) => {
      const next = { ...d };
      if (!patch) delete next[id]; else next[id] = patch;
      return next;
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-fg">Healthy qualification</p>
          <p className="mt-1 max-w-[68ch] font-body text-[12.5px] text-fg-muted">
            Every gate here must hold for an account to read Healthy. A gate that fails caps it to Watch —
            the score itself is never changed, so you can still see how the account actually scored.
          </p>
        </div>
        <div className="divide-y divide-border-subtle">
          {gates.map((g) => <Row key={g.id} r={g} draft={gateDraft} onChange={change(setGateDraft)} />)}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-fg">Status rules</p>
          <p className="mt-1 max-w-[68ch] font-body text-[12.5px] text-fg-muted">
            Applied in priority order after the score is banded. These are the escalations — the things that
            should override a good number because somebody recorded a fact that matters more.
          </p>
        </div>
        <div className="divide-y divide-border-subtle">
          {rules.map((r) => <Row key={r.id} r={r} draft={ruleDraft} onChange={change(setRuleDraft)} />)}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-fg">Minimum data coverage</p>
            <p className="mt-1 max-w-[64ch] font-body text-[12.5px] text-fg-muted">
              Below this share of the enabled weight having real data, an account shows <b>Not assessed</b>
              {" "}instead of a score. Raising it is stricter; lowering it scores more accounts on less evidence.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} max={100} value={cov}
              onChange={(e) => setCov(Math.max(0, Math.min(100, Number(e.target.value))))}
              aria-label="Minimum data coverage percent"
              className="w-20 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-right font-body text-[13px] tabular-nums text-fg outline-none ring-sirius focus:ring-2" />
            <span className="font-body text-[13px] text-fg-muted">%</span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => void save()} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save and re-score
        </button>
        {edits > 0 && (
          <button onClick={reset} className="inline-flex items-center gap-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
            <RotateCcw size={13} /> Reset {edits} change{edits === 1 ? "" : "s"}
          </button>
        )}
        {msg && (
          <span className={cn("font-body text-[12.5px]", msg.ok ? "text-[#2DB47A]" : "text-[#B23A57]")}>{msg.text}</span>
        )}
        <span className="ml-auto font-body text-[11.5px] text-fg-subtle">
          Saving re-scores every account immediately.
        </span>
      </div>
    </div>
  );
}
