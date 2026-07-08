"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Save, Play, Workflow, Wrench, Activity, HeartPulse, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  CSM_TEAM_ROLES,
  IMPLEMENTATION_TEAM_ROLES,
  DEFAULT_ROLE_LABELS,
  type Role,
} from "@/lib/roles";
import { IMPLEMENTATION_LEVELS } from "@/lib/assignment/engine";
import type {
  CapacityConfig,
  CsmAssignmentConfig,
  ImplementationAssignmentConfig,
} from "@/lib/assignment/types";
import type { MemberHealth } from "@/lib/assignment/health";
import { HEALTH_METRIC_LABELS, HEALTH_METRIC_HELP, DEFAULT_HEALTH_TIERS, type ClientHealthConfig, type HealthMetricConfig, type HealthTierDef } from "@/lib/metrics/health-config";
import {
  saveCapacityAction,
  saveCsmAssignmentAction,
  saveImplementationAssignmentAction,
  saveClientHealthConfigAction,
  runAssignmentNowAction,
} from "@/app/(app)/settings/workflow-actions";
import { cn } from "@/lib/cn";

/** Two top-level workflows: assignment routing and the client-health formula. */
type MainTab = "assignment" | "clientHealth";
/** Sub-tabs within the Assignment workflow. */
type AssignmentTab = "csm" | "implementation" | "health";

const ALL_TIER_ROLES: Role[] = [...CSM_TEAM_ROLES, ...IMPLEMENTATION_TEAM_ROLES];

export function WorkflowManager({
  initialCsm,
  initialImpl,
  initialCapacity,
  teamHealth,
  initialClientHealth,
  roleLabels = DEFAULT_ROLE_LABELS,
}: {
  initialCsm: CsmAssignmentConfig;
  initialImpl: ImplementationAssignmentConfig;
  initialCapacity: CapacityConfig;
  teamHealth: MemberHealth[];
  initialClientHealth: ClientHealthConfig;
  roleLabels?: Record<string, string>;
}) {
  const router = useRouter();
  const [main, setMain] = useState<MainTab>("assignment");
  const [sub, setSub] = useState<AssignmentTab>("csm");
  const lbl = (r: string) => roleLabels[r] ?? DEFAULT_ROLE_LABELS[r as Role] ?? r;

  return (
    <div className="flex flex-col gap-5">
      {/* Main workflow tabs */}
      <div className="flex gap-2">
        {([
          ["assignment", "Assignment workflow", Workflow],
          ["clientHealth", "Client health", HeartPulse],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setMain(key)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 font-body text-[13.5px] font-semibold transition-colors",
              main === key
                ? "border-sirius bg-accent-soft text-sirius"
                : "border-border bg-surface text-fg-muted hover:border-sirius/40 hover:text-fg",
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {main === "assignment" && (
        <div className="flex flex-col gap-5">
          <RunNow />

          <div className="flex gap-1 border-b border-border">
            {([
              ["csm", "CSM assignment", Workflow],
              ["implementation", "Implementation assignment", Wrench],
              ["health", "Team health", Activity],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setSub(key)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-body text-[13px] font-semibold transition-colors",
                  sub === key ? "border-sirius text-sirius" : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {sub === "csm" && <CsmPanel initial={initialCsm} lbl={lbl} onSaved={() => router.refresh()} />}
          {sub === "implementation" && <ImplPanel initial={initialImpl} lbl={lbl} onSaved={() => router.refresh()} />}
          {sub === "health" && <HealthPanel initialCapacity={initialCapacity} teamHealth={teamHealth} lbl={lbl} onSaved={() => router.refresh()} />}
        </div>
      )}

      {main === "clientHealth" && <ClientHealthPanel initial={initialClientHealth} onSaved={() => router.refresh()} />}
    </div>
  );
}

/* --------------------------------------------------------------- Run now */

function RunNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runAssignmentNowAction();
      if (!r.ok) setMsg(r.error ?? "Failed.");
      else if (r.summary) {
        const s = r.summary;
        setMsg(`Assigned ${s.csmAssigned} CSM + ${s.implAssigned} implementation owners across ${s.processed} clients` + (s.needsAdmin + s.noCandidates ? ` · ${s.needsAdmin + s.noCandidates} need a manual choice (see Action list).` : "."));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="font-body text-[13px] font-semibold text-fg">Run assignment now</p>
        <p className="font-body text-[12px] text-fg-muted">Apply the rules below to every active client that is still missing a CSM or Implementation owner.</p>
        {msg && <p className="mt-1.5 font-body text-[12px] text-sirius">{msg}</p>}
      </div>
      <button onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- save UI */

function SaveBar({ busy, saved, error, onSave }: { busy: boolean; saved: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
      </button>
      {saved && <span className="font-body text-[12.5px] text-[#2DB47A]">Saved ✓</span>}
      {error && <span className="font-body text-[12.5px] text-[#B23A57]">{error}</span>}
    </div>
  );
}

function useSaver<T>(fn: (v: T) => Promise<{ ok: boolean; error?: string }>, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(v: T) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn(v);
      if (!r.ok) setError(r.error ?? "Failed.");
      else {
        setSaved(true);
        onSaved();
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setBusy(false);
    }
  }
  return { busy, saved, error, save };
}

const inputCls = "rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2";
const selectCls = inputCls;
// Hide the native number-input spinner arrows — they overlap right-aligned
// values in narrow boxes (e.g. "12.5" clipping to "12.!"). Firefox uses
// appearance:textfield; WebKit/Chrome needs the ::-webkit-*-spin-button rules.
const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/* ----------------------------------------------------------- CSM panel */

function CsmPanel({ initial, lbl, onSaved }: { initial: CsmAssignmentConfig; lbl: (r: string) => string; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [bands, setBands] = useState(initial.bands.length ? initial.bands : [{ minArr: 0, role: "csm_officer" as Role }]);
  const { busy, saved, error, save } = useSaver(saveCsmAssignmentAction, onSaved);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <Toggle checked={enabled} onChange={setEnabled} label="Auto-assign a CSM to new clients" />
      <p className="mb-4 mt-1 font-body text-[12.5px] text-fg-muted">
        The client&apos;s ARR selects the role tier; among that tier the least-loaded person (lowest total managed ARR) is chosen. A tie sends you an action item.
      </p>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
          <span>ARR from (≥)</span><span>Assign to role</span><span />
        </div>
        {bands.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="number" value={b.minArr} onChange={(e) => setBands((p) => p.map((x, j) => j === i ? { ...x, minArr: Number(e.target.value) } : x))} className={inputCls} />
            <select value={b.role} onChange={(e) => setBands((p) => p.map((x, j) => j === i ? { ...x, role: e.target.value as Role } : x))} className={selectCls}>
              {CSM_TEAM_ROLES.map((r) => <option key={r} value={r}>{lbl(r)}</option>)}
            </select>
            <button onClick={() => setBands((p) => p.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-[#B23A57]/10 hover:text-[#B23A57]"><Trash2 size={15} /></button>
          </div>
        ))}
        <button onClick={() => setBands((p) => [...p, { minArr: 0, role: "csm_officer" as Role }])} className="mt-1 flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:border-sirius hover:text-sirius">
          <Plus size={14} /> Add band
        </button>
      </div>

      <SaveBar busy={busy} saved={saved} error={error} onSave={() => save({ enabled, bands, helperProperty: initial.helperProperty ?? null })} />
    </div>
  );
}

/* ------------------------------------------------ Implementation panel */

function ImplPanel({ initial, lbl, onSaved }: { initial: ImplementationAssignmentConfig; lbl: (r: string) => string; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rules, setRules] = useState(initial.rules.length ? initial.rules : [{ level: "White Glove", role: "implementation_manager" as Role }]);
  const [defaultRole, setDefaultRole] = useState<Role>(initial.defaultRole);
  const { busy, saved, error, save } = useSaver(saveImplementationAssignmentAction, onSaved);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <Toggle checked={enabled} onChange={setEnabled} label="Auto-assign an Implementation owner to new clients" />
      <p className="mb-4 mt-1 font-body text-[12.5px] text-fg-muted">
        The client&apos;s implementation level selects the role tier; among that tier the person holding the fewest accounts at that level (White Glove = heaviest) is chosen. A tie sends you an action item.
      </p>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
          <span>Implementation level</span><span>Assign to role</span><span />
        </div>
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input list="impl-levels" value={r.level} onChange={(e) => setRules((p) => p.map((x, j) => j === i ? { ...x, level: e.target.value } : x))} className={inputCls} />
            <select value={r.role} onChange={(e) => setRules((p) => p.map((x, j) => j === i ? { ...x, role: e.target.value as Role } : x))} className={selectCls}>
              {IMPLEMENTATION_TEAM_ROLES.map((rl) => <option key={rl} value={rl}>{lbl(rl)}</option>)}
            </select>
            <button onClick={() => setRules((p) => p.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-[#B23A57]/10 hover:text-[#B23A57]"><Trash2 size={15} /></button>
          </div>
        ))}
        <datalist id="impl-levels">{IMPLEMENTATION_LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
        <button onClick={() => setRules((p) => [...p, { level: "", role: "implementation_officer" as Role }])} className="mt-1 flex items-center gap-1.5 self-start rounded-lg border border-dashed border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:border-sirius hover:text-sirius">
          <Plus size={14} /> Add rule
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="font-body text-[12.5px] text-fg-muted">Fallback when level is unknown:</span>
        <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)} className={selectCls}>
          {IMPLEMENTATION_TEAM_ROLES.map((rl) => <option key={rl} value={rl}>{lbl(rl)}</option>)}
        </select>
      </div>

      <SaveBar busy={busy} saved={saved} error={error} onSave={() => save({ enabled, rules, defaultRole })} />
    </div>
  );
}

/* -------------------------------------------------------- Health panel */

function HealthPanel({ initialCapacity, teamHealth, lbl, onSaved }: { initialCapacity: CapacityConfig; teamHealth: MemberHealth[]; lbl: (r: string) => string; onSaved: () => void }) {
  const [byRole, setByRole] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const r of ALL_TIER_ROLES) out[r] = initialCapacity.maxClientsByRole[r] ?? 0;
    return out;
  });
  const [maxWg, setMaxWg] = useState(initialCapacity.maxWhiteGlove);
  const { busy, saved, error, save } = useSaver(saveCapacityAction, onSaved);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="font-display text-sm font-semibold text-fg">Capacity</p>
        <p className="mb-4 mt-1 font-body text-[12.5px] text-fg-muted">Max active clients per role, and the White-Glove ceiling for implementers. Anyone over their limit shows as over capacity below.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ALL_TIER_ROLES.map((r) => (
            <label key={r} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2">
              <span className="font-body text-[12.5px] text-fg">{lbl(r)}</span>
              <input type="number" min={0} value={byRole[r]} onChange={(e) => setByRole((p) => ({ ...p, [r]: Number(e.target.value) }))} className={cn(inputCls, "w-20 text-right")} />
            </label>
          ))}
          <label className="flex items-center justify-between gap-2 rounded-lg border border-sirius/30 bg-accent-soft/40 px-3 py-2">
            <span className="font-body text-[12.5px] font-semibold text-fg">Max White-Glove / implementer</span>
            <input type="number" min={0} value={maxWg} onChange={(e) => setMaxWg(Number(e.target.value))} className={cn(inputCls, "w-20 text-right")} />
          </label>
        </div>
        <SaveBar busy={busy} saved={saved} error={error} onSave={() => save({ maxClientsByRole: byRole, maxWhiteGlove: maxWg })} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <p className="mb-3 font-display text-sm font-semibold text-fg">Team load</p>
        {teamHealth.length === 0 ? (
          <p className="font-body text-[12.5px] text-fg-subtle">No team members yet. Add people in Users &amp; roles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-left font-body text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3 text-right">Clients</th>
                  <th className="py-2 pr-3 text-right">White Glove</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {teamHealth.map((m) => (
                  <tr key={m.email} className="border-b border-border-subtle">
                    <td className="py-2.5 pr-3">
                      <span className="block font-body text-[12.5px] font-semibold text-fg">{m.name}</span>
                      <span className="block font-body text-[11px] text-fg-subtle">{m.email}</span>
                    </td>
                    <td className="py-2.5 pr-3 font-body text-[12px] text-fg-muted">{lbl(m.role)}</td>
                    <td className="py-2.5 pr-3 text-right font-body text-[12.5px] text-fg">{m.clientCount}{m.capacity != null && <span className="text-fg-subtle"> / {m.capacity}</span>}</td>
                    <td className="py-2.5 pr-3 text-right font-body text-[12.5px] text-fg">{m.team === "implementation" ? <>{m.whiteGlove}<span className="text-fg-subtle"> / {m.maxWhiteGlove}</span></> : "—"}</td>
                    <td className="py-2.5 pr-3">
                      {m.healthy ? (
                        <span className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-[#2DB47A]"><CheckCircle2 size={13} /> Healthy</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-[#B23A57]"><AlertTriangle size={13} /> Over capacity</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Client health */

let tierSeq = 0;
const newTierId = () => `tier_${tierSeq++}_${DEFAULT_HEALTH_TIERS.length}`;

function ClientHealthPanel({ initial, onSaved }: { initial: ClientHealthConfig; onSaved: () => void }) {
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
