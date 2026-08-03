"use client";

/* =========================================================================
   The client-health FORMULA: which signals count, how they are weighted, and
   the tier cutoffs. Saving writes workspace_config.client_health_formula and
   runs a full recomputeAllClientHealth() sweep.

   Lives under Settings → Client health, beside the CS Pulse dimensions and
   rating scale. It used to sit inside Settings → Automations, which meant two
   different tabs were both called "Client health" and neither owned the whole
   thing — one edited the real weights, the other showed a formula from the
   retired model-v1 engine that had not computed anything in months. Automations
   is assignment routing now; everything that decides a health score is here.
   ========================================================================= */

import { useState } from "react";
import { Loader2, Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { DEFAULT_HEALTH_TIERS, HEALTH_METRIC_LABELS, HEALTH_METRIC_HELP } from "@/lib/metrics/health-config";
import type { ClientHealthConfig, HealthMetricConfig, HealthTierDef } from "@/lib/metrics/health-config";
import { saveClientHealthConfigAction } from "@/app/(app)/settings/workflow-actions";

const inputCls = "rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2";
const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";


let tierSeq = 0;
const newTierId = () => `tier_${tierSeq++}_${DEFAULT_HEALTH_TIERS.length}`;

export function ClientHealthFormula({ initial, onSaved }: { initial: ClientHealthConfig; onSaved: () => void }) {
  const [metrics, setMetrics] = useState<HealthMetricConfig[]>(initial.metrics);
  const [tiers, setTiers] = useState<HealthTierDef[]>(initial.tiers.length ? initial.tiers : DEFAULT_HEALTH_TIERS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledTotal = metrics.filter((m) => m.enabled).reduce((s, m) => s + m.weight, 0);
  const totalRounded = Math.round(enabledTotal * 10) / 10;

  function updateMetric(key: HealthMetricConfig["key"], patch: Partial<HealthMetricConfig>) {
    setMetrics((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function normalize() {
    setMetrics((prev) => {
      const total = prev.filter((m) => m.enabled).reduce((s, m) => s + m.weight, 0);
      if (total <= 0) return prev;
      return prev.map((m) => (m.enabled ? { ...m, weight: Math.round((m.weight / total) * 1000) / 10 } : m));
    });
  }

  function updateTier(id: string, patch: Partial<HealthTierDef>) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Persist tiers ordered high→low by minScore so the engine's "highest
      // tier the score meets" is unambiguous.
      const sortedTiers = [...tiers].sort((a, b) => b.minScore - a.minScore);
      const r = await saveClientHealthConfigAction({ metrics, tiers: sortedTiers });
      if (!r.ok) setError(r.error ?? "Failed.");
      else {
        setResult(`Saved · recomputed ${r.clientsUpdated ?? 0} clients.`);
        setTiers(sortedTiers);
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  }

  const sortedForPreview = [...tiers].sort((a, b) => b.minScore - a.minScore);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="font-display text-sm font-semibold text-fg">Formula</p>
        <p className="mb-4 mt-1 font-body text-[12.5px] text-fg-muted">
          Turn on the signals that should count toward every account&apos;s health score, and weight them — drag the
          slider or type an exact number. A signal with no data for a given account (e.g. NPS, with no source wired up
          yet) is skipped for that account only, and the rest reweight to fill the gap — never a faked neutral value.
        </p>
        <div className="flex flex-col gap-2">
          {metrics.map((m) => (
            <MetricRow key={m.key} metric={m} onChange={(patch) => updateMetric(m.key, patch)} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span className={cn("font-body text-[12.5px] font-semibold", totalRounded === 100 ? "text-[#2DB47A]" : "text-[#C99A14]")}>
            Total (enabled): {totalRounded}%
          </span>
          <button onClick={normalize} className="font-body text-[12px] font-semibold text-sirius hover:underline">
            Normalize to 100%
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="font-display text-sm font-semibold text-fg">Health tiers</p>
        <p className="mb-4 mt-1 font-body text-[12.5px] text-fg-muted">
          Name each tier, set the minimum score it starts at, and pick its color. Add or remove tiers freely — a score
          lands in the highest tier whose minimum it reaches. Keep one tier at 0 so every score has a home.
        </p>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_120px_56px_auto] gap-2 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
            <span>Tier name</span><span>Min score (≥)</span><span>Color</span><span />
          </div>
          {tiers.map((t) => (
            <div key={t.id} className="grid grid-cols-[1fr_120px_56px_auto] items-center gap-2">
              <input
                value={t.name}
                onChange={(e) => updateTier(t.id, { name: e.target.value })}
                placeholder="Tier name"
                className={inputCls}
              />
              <input
                type="number" min={0} max={100}
                value={t.minScore}
                onChange={(e) => updateTier(t.id, { minScore: Number(e.target.value) })}
                className={cn(inputCls, noSpin, "px-2.5 text-right tabular")}
              />
              <input
                type="color"
                value={t.color}
                onChange={(e) => updateTier(t.id, { color: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-border bg-bg p-1"
                aria-label={`${t.name} color`}
              />
              <button
                onClick={() => setTiers((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== t.id) : prev))}
                disabled={tiers.length <= 1}
                className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-[#B23A57]/10 hover:text-[#B23A57] disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setTiers((prev) => [...prev, { id: newTierId(), name: "New tier", minScore: 0, color: "#6E7BFF" }])}
            className="mt-1 flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:border-sirius hover:text-sirius"
          >
            <Plus size={14} /> Add tier
          </button>
        </div>

        {/* Live preview band (high score on the right) */}
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-pill">
          {sortedForPreview
            .slice()
            .reverse()
            .map((t, i, arr) => {
              const next = arr[i + 1];
              const width = (next ? next.minScore : 100) - Math.max(0, Math.min(100, t.minScore));
              return <div key={t.id} style={{ width: `${Math.max(0, width)}%`, backgroundColor: t.color }} title={`${t.name} (≥${t.minScore})`} />;
            })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
        {result && <span className="font-body text-[12.5px] text-[#2DB47A]">{result}</span>}
        {error && <span className="font-body text-[12.5px] text-[#B23A57]">{error}</span>}
      </div>
    </div>
  );
}

function MetricRow({ metric, onChange }: { metric: HealthMetricConfig; onChange: (patch: Partial<HealthMetricConfig>) => void }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 transition-opacity",
        metric.enabled ? "border-border-subtle" : "border-border-subtle/60 opacity-55",
      )}
    >
      <div className="grid grid-cols-[220px_1fr_auto_150px] items-center gap-3">
        <Toggle checked={metric.enabled} onChange={(v) => onChange({ enabled: v })} label={HEALTH_METRIC_LABELS[metric.key]} />
        <input
          type="range" min={0} max={100} step={0.5}
          disabled={!metric.enabled}
          value={metric.weight}
          onChange={(e) => onChange({ weight: Number(e.target.value) })}
          className="h-1.5 accent-sirius disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1">
          <input
            type="number" min={0} max={100} step={0.5}
            disabled={!metric.enabled}
            value={metric.weight}
            onChange={(e) => onChange({ weight: Math.max(0, Math.min(100, Number(e.target.value))) })}
            className={cn(inputCls, noSpin, "w-20 px-2.5 text-right tabular disabled:cursor-not-allowed")}
          />
          <span className="font-body text-[12px] text-fg-subtle">%</span>
        </div>
        {metric.key === "sla_breaches" ? (
          <label className="flex items-center justify-end gap-1.5" title="Open-breach count at which this signal bottoms out at 0">
            <span className="font-body text-[11px] text-fg-subtle">breaches→0:</span>
            <input
              type="number" min={1}
              value={metric.params?.maxBreaches ?? 5}
              onChange={(e) => onChange({ params: { ...metric.params, maxBreaches: Number(e.target.value) } })}
              className={cn(inputCls, noSpin, "w-14 px-2 text-right tabular")}
            />
          </label>
        ) : metric.key === "onboarding_period" ? (
          <div className="flex items-center justify-end gap-1" title="Days at/under = 100, days at/over = 0, linear between">
            <input
              type="number" min={0}
              value={metric.params?.targetDays ?? 30}
              onChange={(e) => onChange({ params: { ...metric.params, targetDays: Number(e.target.value) } })}
              className={cn(inputCls, noSpin, "w-14 px-2 text-right tabular")}
            />
            <span className="font-body text-[11px] text-fg-subtle">–</span>
            <input
              type="number" min={0}
              value={metric.params?.maxDays ?? 90}
              onChange={(e) => onChange({ params: { ...metric.params, maxDays: Number(e.target.value) } })}
              className={cn(inputCls, noSpin, "w-14 px-2 text-right tabular")}
            />
            <span className="font-body text-[11px] text-fg-subtle">d</span>
          </div>
        ) : metric.key === "nps" || metric.key === "csat" || metric.key === "platform_csat" ? (
          <div
            className="flex items-center justify-end gap-1"
            title='Value at/below scores 0 ("nothing"), value at/over scores 100 ("full"), linear ("partial") between'
          >
            <input
              type="number" min={metric.key === "nps" ? -100 : 0} max={100}
              value={metric.params?.zeroAt ?? (metric.key === "nps" ? -100 : 0)}
              onChange={(e) => onChange({ params: { ...metric.params, zeroAt: Number(e.target.value) } })}
              className={cn(inputCls, noSpin, "w-14 px-2 text-right tabular")}
            />
            <span className="font-body text-[11px] text-fg-subtle">→</span>
            <input
              type="number" min={metric.key === "nps" ? -100 : 0} max={100}
              value={metric.params?.fullAt ?? 100}
              onChange={(e) => onChange({ params: { ...metric.params, fullAt: Number(e.target.value) } })}
              className={cn(inputCls, noSpin, "w-14 px-2 text-right tabular")}
            />
          </div>
        ) : (
          <span />
        )}
      </div>
      <p className="mt-1.5 pl-[3px] font-body text-[11.5px] leading-relaxed text-fg-subtle">{HEALTH_METRIC_HELP[metric.key]}</p>
    </div>
  );
}

/* ----------------------------------------------------------- toggle */

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-sirius" : "bg-border")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="font-body text-[13px] font-semibold text-fg">{label}</span>
    </label>
  );
}
