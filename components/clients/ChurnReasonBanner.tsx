"use client";

/* =========================================================================
   Churn reasons — shown at the top of a CHURNED client's profile. Lets an admin
   classify the churn against the taxonomy (Settings → Churn taxonomy). An
   account can have MORE THAN ONE reason: selected reasons show as removable
   chips, and a grouped checkbox picker toggles them. Each change saves
   immediately (spinner → check, or the exact error). Reasons roll up on the
   Churn dashboard.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, AlertTriangle, TrendingDown, ChevronDown, X, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChurnTaxonomy } from "@/lib/metrics/churn-taxonomy";
import { setClientChurnReasonsAction } from "@/app/(app)/clients/churn-actions";

export function ChurnReasonBanner({ clientId, taxonomy, currentReasonIds, canEdit }: {
  clientId: string;
  taxonomy: ChurnTaxonomy;
  currentReasonIds: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [reasons, setReasons] = useState<string[]>(currentReasonIds);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const labelOf = (id: string) => {
    for (const c of taxonomy) for (const r of c.reasons) if (r.id === id) return r.label;
    return id;
  };
  const hasTaxonomy = taxonomy.some((c) => c.reasons.length > 0);
  const isKnown = (id: string) => taxonomy.some((c) => c.reasons.some((r) => r.id === id));
  const selected = reasons.filter(isKnown); // never render a reason removed from the taxonomy

  async function save(next: string[]) {
    setReasons(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await setClientChurnReasonsAction(clientId, next);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the churn reasons."); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    router.refresh();
  }
  const toggle = (id: string) => save(reasons.includes(id) ? reasons.filter((x) => x !== id) : [...reasons, id]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#C99A14]/30 bg-[#C99A14]/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#C99A14]/15 text-[#8A6D12]">
          <TrendingDown size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[14px] font-semibold text-fg">This account has churned</h3>
          <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">
            {canEdit
              ? "Classify why it churned — you can pick more than one reason."
              : selected.length ? "Churn reasons" : "No churn reason recorded yet."}
          </p>
        </div>
      </div>

      {/* Selected reasons (chips) + the picker */}
      <div className="flex flex-wrap items-center gap-2 sm:pl-[42px]">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[#C99A14]/35 bg-[#C99A14]/12 py-1 pl-2.5 pr-1.5 font-body text-[12px] font-medium text-[#8A6D12]">
            {labelOf(id)}
            {canEdit && (
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${labelOf(id)}`} className="grid size-4 place-items-center rounded-full text-[#8A6D12]/70 transition-colors hover:bg-[#C99A14]/20 hover:text-[#B23A57]">
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {selected.length === 0 && !canEdit && <span className="font-body text-[12.5px] text-fg-subtle">—</span>}

        {canEdit && hasTaxonomy && (
          <div ref={ref} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#C99A14]/50 px-2.5 py-1 font-body text-[12px] font-medium text-[#8A6D12] outline-none ring-sirius transition-colors hover:bg-[#C99A14]/10 focus-visible:ring-2"
            >
              <Plus size={12} /> {selected.length ? "Add / edit" : "Add reasons"}
              <ChevronDown size={12} className="opacity-60" />
            </button>

            {open && (
              <div role="menu" className="absolute left-0 z-30 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
                {taxonomy.map((c) => (
                  c.reasons.length > 0 && (
                    <div key={c.id}>
                      <div className="px-3 pb-1 pt-2 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">{c.label}</div>
                      {c.reasons.map((r) => {
                        const on = reasons.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={on}
                            onClick={() => toggle(r.id)}
                            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left font-body text-[13px] text-fg transition-colors hover:bg-bg-muted"
                          >
                            <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-sirius bg-sirius text-white" : "border-border")}>
                              {on && <Check size={11} />}
                            </span>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}

        <span className="grid w-4 place-items-center" aria-live="polite">
          {busy ? <Loader2 size={14} className="animate-spin text-fg-subtle" /> : saved ? <Check size={14} className="text-[#2DB47A]" /> : null}
        </span>
      </div>

      {canEdit && !hasTaxonomy && (
        <p className="font-body text-[12px] text-fg-subtle sm:pl-[42px]">Set up reasons in Settings → Churn taxonomy.</p>
      )}
      {error && (
        <div className="flex items-start gap-1.5 font-body text-[12px] text-[#B23A57] sm:pl-[42px]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}
    </div>
  );
}
