"use client";

/* Settings → Churn taxonomy. Edits the two-level tree (categories → reasons)
   a churned account is bucketed into. IDs are preserved on rename (so a client's
   stored reason / a saved report grouping survives a label change); new rows get
   an id slugged from their label on save (server-side normalize). */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChurnTaxonomy } from "@/lib/metrics/churn-taxonomy";
import { saveChurnTaxonomyAction } from "@/app/(app)/settings/churn-taxonomy-actions";

type RRow = { _k: number; id: string; label: string };
type CRow = { _k: number; id: string; label: string; reasons: RRow[] };

export function ChurnTaxonomyManager({ initial }: { initial: ChurnTaxonomy }) {
  const router = useRouter();
  const counter = useRef(0);
  const key = () => ++counter.current;
  const toRows = (t: ChurnTaxonomy): CRow[] =>
    t.map((c) => ({ _k: key(), id: c.id, label: c.label, reasons: c.reasons.map((r) => ({ _k: key(), id: r.id, label: r.label })) }));

  const [cats, setCats] = useState<CRow[]>(() => toRows(initial));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = () => { setSaved(false); setError(null); };
  const update = (fn: (draft: CRow[]) => CRow[]) => { setCats((prev) => fn(prev)); dirty(); };

  const addCategory = () => update((cs) => [...cs, { _k: key(), id: "", label: "", reasons: [] }]);
  const removeCategory = (k: number) => update((cs) => cs.filter((c) => c._k !== k));
  const renameCategory = (k: number, label: string) => update((cs) => cs.map((c) => (c._k === k ? { ...c, label } : c)));
  const addReason = (ck: number) => update((cs) => cs.map((c) => (c._k === ck ? { ...c, reasons: [...c.reasons, { _k: key(), id: "", label: "" }] } : c)));
  const removeReason = (ck: number, rk: number) => update((cs) => cs.map((c) => (c._k === ck ? { ...c, reasons: c.reasons.filter((r) => r._k !== rk) } : c)));
  const renameReason = (ck: number, rk: number, label: string) =>
    update((cs) => cs.map((c) => (c._k === ck ? { ...c, reasons: c.reasons.map((r) => (r._k === rk ? { ...r, label } : r)) } : c)));

  async function save() {
    setBusy(true);
    setError(null);
    const payload: ChurnTaxonomy = cats
      .filter((c) => c.label.trim())
      .map((c) => ({ id: c.id, label: c.label.trim(), reasons: c.reasons.filter((r) => r.label.trim()).map((r) => ({ id: r.id, label: r.label.trim() })) }));
    const res = await saveChurnTaxonomyAction(payload);
    setBusy(false);
    if (res.ok) { setSaved(true); router.refresh(); }
    else setError(res.error ?? "Failed to save.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {cats.map((c) => (
          <div key={c._k} className="rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
              <input
                value={c.label}
                onChange={(e) => renameCategory(c._k, e.target.value)}
                placeholder="Category name"
                aria-label="Category name"
                className="min-w-0 flex-1 bg-transparent font-body text-[13.5px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-fg-subtle"
              />
              <span className="shrink-0 font-body text-[11px] text-fg-subtle">{c.reasons.length} reason{c.reasons.length === 1 ? "" : "s"}</span>
              <button onClick={() => removeCategory(c._k)} aria-label="Remove category" className="shrink-0 rounded-md p-1 text-fg-subtle hover:bg-danger-bg hover:text-danger-fg"><Trash2 size={14} /></button>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {c.reasons.map((r) => (
                <div key={r._k} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-bg-muted/40">
                  <span className="size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                  <input
                    value={r.label}
                    onChange={(e) => renameReason(c._k, r._k, e.target.value)}
                    placeholder="Reason"
                    aria-label="Reason"
                    className="min-w-0 flex-1 bg-transparent font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle"
                  />
                  <button onClick={() => removeReason(c._k, r._k)} aria-label="Remove reason" className="shrink-0 rounded-md p-1 text-fg-subtle hover:bg-danger-bg hover:text-danger-fg"><Trash2 size={12} /></button>
                </div>
              ))}
              <button onClick={() => addReason(c._k)} className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 font-body text-[12px] font-semibold text-sirius hover:bg-accent-soft/50"><Plus size={12} /> Add reason</button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addCategory} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
        <Plus size={14} /> Add category
      </button>

      <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {busy ? "Saving…" : saved ? "Saved" : "Save taxonomy"}
        </button>
        {error && <span className="font-body text-[12.5px] text-danger-fg">{error}</span>}
      </div>
    </div>
  );
}
