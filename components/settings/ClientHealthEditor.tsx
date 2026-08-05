"use client";

/* =========================================================================
   The CS Pulse: the dimensions a CSM rates each month, and the scale they are
   rated on. Both are config, and both drive the capture form AND the engine —
   renaming a dimension changes what the pulse form asks and what the score
   reads, in one move.

   This file used to also carry the ten-metric "Formula" editor and a read-only
   model overview. The formula configured a scoring engine the recompute no
   longer calls, and the overview rendered a retired model; both are gone. The
   score's own shape — component weights and bands — is HealthModelWeights.tsx,
   and the gates and status rules are HealthModelRules.tsx.
   ========================================================================= */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PulseDimension, RatingTier } from "@/lib/health/pulse";
import { saveCsPulseDimensionsAction, saveCsPulseTiersAction } from "@/app/(app)/settings/pulse-config-actions";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";

export function ClientHealthEditor({ initialDimensions, initialTiers }: {
  initialDimensions: PulseDimension[];
  initialTiers: RatingTier[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <DimensionsEditor initialDimensions={initialDimensions} tiers={initialTiers} />
      <TiersEditor initialTiers={initialTiers} />
    </div>
  );
}

/* -------- CS Pulse dimensions ------------------------------------------- */

function DimensionsEditor({ initialDimensions, tiers }: { initialDimensions: PulseDimension[]; tiers: RatingTier[] }) {
  const router = useRouter();
  const [dims, setDims] = useState<PulseDimension[]>(initialDimensions.map((d) => ({ ...d, rubric: { ...d.rubric } })));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const total = dims.reduce((a, d) => a + (Number(d.weight) || 0), 0);
  const valid = Math.round(total) === 100 && dims.every((d) => d.name.trim());

  const patch = (i: number, p: Partial<PulseDimension>) => setDims((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const patchRubric = (i: number, tierKey: string, text: string) =>
    setDims((ds) => ds.map((d, j) => (j === i ? { ...d, rubric: { ...d.rubric, [tierKey]: text } } : d)));
  const add = () => { const id = `dim_${dims.length + 1}`; setDims((ds) => [...ds, { id, metricKey: `${id}_rating`, name: "New dimension", weight: 0, description: "", rubric: {} }]); setOpen(id); };
  const remove = (i: number) => setDims((ds) => ds.filter((_, j) => j !== i));

  async function save() {
    setBusy(true); setMsg(null);
    const payload = dims.map((d) => ({ ...d, id: d.id || slug(d.name), metricKey: d.metricKey || `${slug(d.name)}_rating` }));
    const r = await saveCsPulseDimensionsAction(payload);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved — the pulse form and every score now use these." } : { ok: false, text: r.error ?? "Couldn't save." });
    if (r.ok) router.refresh();
  }

  return (
    <Section
      title="Customer Success Pulse — dimensions"
      description="What the CSM rates each month (25% of health). Add, rename or reweight — a new dimension appears in the pulse form automatically. Weights must total 100%."
    >
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {dims.map((d, i) => (
          <div key={d.id || i} className="border-b border-border-subtle last:border-b-0">
            <div className="flex items-center gap-2.5 p-3">
              <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)} aria-label="Toggle rubric" className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-bg-muted">
                <ChevronDown size={15} className={cn("transition-transform", open === d.id ? "" : "-rotate-90")} />
              </button>
              <input value={d.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Dimension name"
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 font-body text-[13.5px] font-semibold text-fg outline-none ring-sirius hover:border-border focus:border-sirius focus:ring-2" />
              <div className="flex items-center gap-1">
                <input type="number" value={d.weight} onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                  className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-right font-body text-[13px] font-semibold text-fg outline-none ring-sirius focus:ring-2" />
                <span className="font-body text-[12px] text-fg-subtle">%</span>
              </div>
              <button type="button" onClick={() => remove(i)} aria-label="Remove dimension" className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57]"><Trash2 size={14} /></button>
            </div>
            {open === d.id && (
              <div className="flex flex-col gap-3 border-t border-border-subtle bg-bg-subtle/40 px-4 py-3">
                <label className="block">
                  <span className="mb-1 block font-body text-[11.5px] font-medium text-fg-subtle">What it measures</span>
                  <textarea value={d.description} onChange={(e) => patch(i, { description: e.target.value })} rows={2} placeholder="Description shown to the CSM…"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2" />
                </label>
                <div>
                  <span className="mb-1.5 block font-body text-[11.5px] font-medium text-fg-subtle">Guidance per rating (shown when the CSM picks it)</span>
                  <div className="flex flex-col gap-1.5">
                    {tiers.map((t) => (
                      <div key={t.key} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 font-body text-[12px] font-semibold text-fg">{t.label}</span>
                        <input value={d.rubric[t.key] ?? ""} onChange={(e) => patchRubric(i, t.key, e.target.value)} placeholder={`What "${t.label}" looks like…`}
                          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 font-body text-[12px] text-fg-muted outline-none ring-sirius focus:ring-2" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2 font-body text-[12.5px] font-semibold text-sirius hover:bg-accent-soft">
          <Plus size={14} /> Add dimension
        </button>
        <div className="flex items-center gap-3">
          <span className={cn("font-body text-[12.5px] font-semibold tabular-nums", Math.round(total) === 100 ? "text-[#1F9D63]" : "text-[#B23A57]")}>
            {Math.round(total)}% {Math.round(total) === 100 ? "✓" : "· must total 100%"}
          </span>
          <SaveButton busy={busy} disabled={!valid} onClick={save} />
        </div>
      </div>
      {msg && <Feedback msg={msg} />}
    </Section>
  );
}

/* -------- Rating scale --------------------------------------------------- */

function TiersEditor({ initialTiers }: { initialTiers: RatingTier[] }) {
  const router = useRouter();
  const [tiers, setTiers] = useState<RatingTier[]>(initialTiers.map((t) => ({ ...t })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = tiers.length >= 2 && tiers.every((t) => t.label.trim());

  const patch = (i: number, p: Partial<RatingTier>) => setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const color = (score: number) => (score >= 75 ? "#1F9D63" : score >= 50 ? "#6E8B1E" : score >= 25 ? "#C2610E" : "#B23A57");

  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveCsPulseTiersAction(tiers);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Rating scale saved." } : { ok: false, text: r.error ?? "Couldn't save." });
    if (r.ok) router.refresh();
  }

  return (
    <Section title="Rating scale" description="The tiers a CS Pulse rating can take. Rename labels freely — stored ratings use stable keys, so past scores are unaffected. Scores drive the calculation.">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {tiers.map((t, i) => (
          <div key={t.key} className="flex items-center gap-2.5 border-b border-border-subtle p-3 last:border-b-0">
            <span className="size-3 shrink-0 rounded" style={{ background: color(Number(t.score)) }} />
            <input value={t.label} onChange={(e) => patch(i, { label: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 font-body text-[13px] font-medium text-fg outline-none ring-sirius hover:border-border focus:border-sirius focus:ring-2" />
            <span className="font-body text-[12px] text-fg-subtle">score</span>
            <input type="number" value={t.score} onChange={(e) => patch(i, { score: Number(e.target.value) })}
              className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-right font-body text-[13px] font-semibold text-fg outline-none ring-sirius focus:ring-2" />
            <button type="button" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} aria-label="Remove tier" disabled={tiers.length <= 2}
              className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57] disabled:opacity-30"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setTiers((ts) => [...ts.slice(0, -1), { key: `tier_${ts.length}`, label: "New tier", score: 50 }, ts[ts.length - 1]])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2 font-body text-[12.5px] font-semibold text-sirius hover:bg-accent-soft">
          <Plus size={14} /> Add tier
        </button>
        <SaveButton busy={busy} disabled={!valid} onClick={save} />
      </div>
      {msg && <Feedback msg={msg} />}
    </Section>
  );
}

/* -------- shared bits --------------------------------------------------- */

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="font-display text-[15px] font-semibold text-fg">{title}</h3>
        <p className="mt-1 max-w-[64ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SaveButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-opacity disabled:opacity-40">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />} Save
    </button>
  );
}

function Feedback({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <div className={cn("mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 font-body text-[12.5px]", msg.ok ? "border-[#1F9D63]/30 bg-[#1F9D63]/8 text-[#1F9D63]" : "border-[#B23A57]/30 bg-[#B23A57]/8 text-[#B23A57]")}>
      {msg.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}<span>{msg.text}</span>
    </div>
  );
}
