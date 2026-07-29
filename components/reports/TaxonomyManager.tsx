"use client";

/* Managing the taxonomy: what entries exist, what they're called, where they
   sit, and what has been retired.

   Separate from editing a definition. Changing what a use case MEANS is a
   writing task; changing what exists is a governance one, and conflating them
   is how a taxonomy drifts. This panel is deliberately plainer than the browse
   view — it's a control surface, not a reference work.

   RETIRE, NOT DELETE, and the dialog says why: accounts are recorded against
   ids, so removing one would make their use cases silently vanish. Retiring
   with a "merged into" target is how a merge is actually performed — the old
   id keeps resolving, and everything on it reads as the successor. */

import { useMemo, useState } from "react";
import { Plus, Pencil, Archive, RotateCcw, Loader2, X, AlertTriangle, FolderPlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ResolvedUseCase, TaxonomyOverlay } from "@/lib/use-case-overlay";
import {
  saveUseCaseAction, retireUseCaseAction, restoreUseCaseAction,
  saveCategoryAction, deleteCategoryAction, restoreCategoryAction,
  resetCategoryAction, resetTaxonomyAction,
} from "@/app/(app)/use-cases/taxonomy-actions";
import { isShippedGroup } from "@/lib/use-case-overlay";

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-2 font-body text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15";

interface Group { id: string; label: string; blurb: string }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {hint && <span className="-mt-1 font-body text-[11px] text-fg-subtle">{hint}</span>}
      {children}
    </label>
  );
}

export function TaxonomyManager({ entries, groups, overlay, onClose }: {
  /** Includes retired ones — this screen has to show what can be restored. */
  entries: ResolvedUseCase[];
  groups: Group[];
  overlay: TaxonomyOverlay;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResolvedUseCase | "new" | null>(null);
  const [retiring, setRetiring] = useState<ResolvedUseCase | null>(null);
  const [groupEdit, setGroupEdit] = useState<Group | "new" | null>(null);
  const [tab, setTab] = useState<"cases" | "categories">("cases");
  const [form, setForm] = useState({ label: "", summary: "", groups: [] as string[] });
  const [groupForm, setGroupForm] = useState({ label: "", blurb: "" });
  const [retireForm, setRetireForm] = useState({ reason: "", mergedInto: "" });

  const live = useMemo(() => entries.filter((e) => !e.retired), [entries]);
  const retired = useMemo(() => entries.filter((e) => e.retired), [entries]);

  const done = () => window.location.reload();

  function openEdit(e: ResolvedUseCase | "new") {
    setError(null);
    setEditing(e);
    setForm(e === "new" ? { label: "", summary: "", groups: [] } : { label: e.label, summary: e.summary, groups: [...e.groups] });
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Something went wrong."); return false; }
    done();
    return true;
  }

  const toggleGroup = (id: string) =>
    setForm((f) => ({ ...f, groups: f.groups.includes(id) ? f.groups.filter((g) => g !== id) : [...f.groups, id] }));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-fg">Manage the taxonomy</h2>
          <p className="mt-0.5 font-body text-[12px] text-fg-muted">
            {live.length} live{retired.length > 0 && ` · ${retired.length} retired`} · {groups.length} categories
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => openEdit("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white">
            <Plus size={13} /> Add use case
          </button>
          <button onClick={() => { setTab("categories"); setGroupEdit("new"); setGroupForm({ label: "", blurb: "" }); setError(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            <FolderPlus size={13} /> Add category
          </button>
          <button onClick={onClose} aria-label="Close" className="rounded-lg border border-border p-1.5 text-fg-muted hover:text-fg">
            <X size={13} />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div role="tablist" aria-label="What to manage" className="flex gap-1 self-start rounded-lg border border-border p-0.5">
        {([["cases", `Use cases (${live.length})`], ["categories", `Categories (${groups.length})`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setError(null); }}
            className={cn("rounded-[6px] px-3 py-1.5 font-body text-[12.5px] font-medium transition-colors",
              tab === k ? "bg-accent-soft text-sirius" : "text-fg-muted hover:text-fg")}>{l}</button>
        ))}
      </div>

      {/* ── add / edit a use case ─────────────────────────────────── */}
      {tab === "cases" && editing && (
        <form className="flex flex-col gap-3 rounded-lg border border-sirius/30 bg-accent-soft/20 p-3"
          onSubmit={(e) => { e.preventDefault(); void run(() => saveUseCaseAction({
            id: editing === "new" ? undefined : editing.id, ...form })); }}>
          <p className="font-body text-[12px] font-semibold text-fg">
            {editing === "new" ? "New use case" : `Editing ${editing.label}`}
          </p>
          <Field label="Name"><input autoFocus className={inputCls} value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} /></Field>
          <Field label="One-line summary" hint="What a client would recognise it as.">
            <input className={inputCls} value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} /></Field>
          <Field label="Categories" hint="More than one is fine — cross-listing is supported.">
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const on = form.groups.includes(g.id);
                return (
                  <button key={g.id} type="button" aria-pressed={on} onClick={() => toggleGroup(g.id)} title={g.blurb}
                    className={cn("rounded-full border px-2.5 py-1 font-body text-[12px] font-medium transition-colors",
                      on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                    {g.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setEditing(null)}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          </div>
        </form>
      )}

      {/* ── add / edit a category ─────────────────────────────────── */}
      {tab === "categories" && groupEdit && (
        <form className="flex flex-col gap-3 rounded-lg border border-sirius/30 bg-accent-soft/20 p-3"
          onSubmit={(e) => { e.preventDefault(); void run(() => saveCategoryAction({
            id: groupEdit === "new" ? undefined : groupEdit.id, ...groupForm })); }}>
          <p className="font-body text-[12px] font-semibold text-fg">
            {groupEdit === "new" ? "New category" : `Editing ${groupEdit.label}`}
          </p>
          <Field label="Name"><input autoFocus className={inputCls} value={groupForm.label}
            onChange={(e) => setGroupForm((f) => ({ ...f, label: e.target.value }))} /></Field>
          <Field label="What it groups" hint='A trigger reads better than a topic — e.g. "Someone is moving".'>
            <input className={inputCls} value={groupForm.blurb}
              onChange={(e) => setGroupForm((f) => ({ ...f, blurb: e.target.value }))} /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button type="button" onClick={() => setGroupEdit(null)}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Cancel</button>
            {groupEdit !== "new" && isShippedGroup(groupEdit.id) && (
              <button type="button" onClick={() => void run(() => resetCategoryAction(groupEdit.id))} disabled={busy}
                className="ml-auto inline-flex items-center gap-1 font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
                <RotateCcw size={11} /> Restore shipped name
              </button>
            )}
          </div>
        </form>
      )}

      {/* ── retire, with the merge target ─────────────────────────── */}
      {tab === "cases" && retiring && (
        <form role="alertdialog" className="flex flex-col gap-3 rounded-lg border border-[#C99A14]/40 bg-[#8A6D12]/5 p-3"
          onSubmit={(e) => { e.preventDefault(); void run(() => retireUseCaseAction(retiring.id, retireForm)); }}>
          <div>
            <p className="font-body text-[13px] font-semibold text-fg">Retire &ldquo;{retiring.label}&rdquo;?</p>
            <p className="mt-1 font-body text-[12px] leading-relaxed text-fg-muted">
              It disappears from the picker but is never deleted — accounts are recorded against its id, so removing
              it outright would make their use cases vanish. If this is a merge, name the successor and every account
              already on it will read as that one instead.
            </p>
          </div>
          <Field label="Merged into" hint="Leave empty if it is simply being retired.">
            <select className={inputCls} value={retireForm.mergedInto}
              onChange={(e) => setRetireForm((f) => ({ ...f, mergedInto: e.target.value }))}>
              <option value="">Not a merge</option>
              {live.filter((u) => u.id !== retiring.id).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </Field>
          <Field label="Reason" hint="Recorded so the decision is auditable later.">
            <input className={inputCls} value={retireForm.reason}
              onChange={(e) => setRetireForm((f) => ({ ...f, reason: e.target.value }))} /></Field>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8A6D12] px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Retire
            </button>
            <button type="button" onClick={() => setRetiring(null)}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Keep it</button>
          </div>
        </form>
      )}

      {/* ── the list ──────────────────────────────────────────────── */}
      {tab === "cases" && (
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {live.map((u) => (
          <div key={u.id} className="flex items-start gap-2 border-b border-border-subtle px-3 py-2 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-body text-[13px] font-semibold text-fg">
                {u.label}
                {u.custom && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px font-body text-[10px] font-semibold text-sirius">added</span>}
                {u.edited && <span className="ml-1.5 rounded-full bg-bg-muted px-1.5 py-px font-body text-[10px] font-semibold text-fg-muted">edited</span>}
              </p>
              <p className="font-body text-[11.5px] text-fg-subtle">
                {u.summary || <em>no summary</em>} · {u.groups.map((g) => groups.find((x) => x.id === g)?.label ?? g).join(" · ")}
              </p>
            </div>
            <button onClick={() => openEdit(u)} aria-label={`Edit ${u.label}`}
              className="shrink-0 rounded p-1.5 text-fg-subtle transition-colors hover:text-sirius"><Pencil size={13} /></button>
            <button onClick={() => { setRetiring(u); setRetireForm({ reason: "", mergedInto: "" }); setError(null); }}
              aria-label={`Retire ${u.label}`}
              className="shrink-0 rounded p-1.5 text-fg-subtle transition-colors hover:text-[#8A6D12]"><Archive size={13} /></button>
          </div>
        ))}
      </div>
      )}

      {tab === "cases" && retired.length > 0 && (
        <div>
          <p className="mb-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Retired</p>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            {retired.map((u) => (
              <div key={u.id} className="flex items-start gap-2 border-b border-border-subtle px-3 py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-body text-[13px] text-fg-muted line-through">{u.label}</p>
                  <p className="font-body text-[11.5px] text-fg-subtle">
                    {u.retired?.mergedInto
                      ? <>merged into <b className="font-semibold">{entries.find((e) => e.id === u.retired!.mergedInto)?.label ?? u.retired!.mergedInto}</b></>
                      : u.retired?.reason || "retired"}
                  </p>
                </div>
                <button onClick={() => void run(() => restoreUseCaseAction(u.id))} disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                  <RotateCcw size={11} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "categories" && (
        <>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            {groups.map((g) => {
              const filed = entries.filter((u) => (u.groups as string[]).includes(g.id)).length;
              return (
                <div key={g.id} className="flex items-start gap-2 border-b border-border-subtle px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-[13px] font-semibold text-fg">
                      {g.label}
                      {!isShippedGroup(g.id) && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px font-body text-[10px] font-semibold text-sirius">added</span>}
                    </p>
                    <p className="font-body text-[11.5px] text-fg-subtle">
                      {g.blurb || <em>no description</em>} · {filed} use case{filed === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button onClick={() => { setGroupEdit(g); setGroupForm({ label: g.label, blurb: g.blurb }); setError(null); }}
                    aria-label={`Edit ${g.label}`}
                    className="shrink-0 rounded p-1.5 text-fg-subtle transition-colors hover:text-sirius"><Pencil size={13} /></button>
                  <button onClick={() => void run(() => deleteCategoryAction(g.id))} disabled={busy}
                    aria-label={`Remove ${g.label}`} title={filed ? "Move its use cases out first" : "Remove"}
                    className="shrink-0 rounded p-1.5 text-fg-subtle transition-colors hover:text-[#B23A57] disabled:opacity-40">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          {(overlay.hiddenGroups ?? []).length > 0 && (
            <div>
              <p className="mb-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Removed</p>
              <div className="flex flex-wrap gap-1.5">
                {(overlay.hiddenGroups ?? []).map((id) => (
                  <button key={id} onClick={() => void run(() => restoreCategoryAction(id))} disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-body text-[12px] text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    <RotateCcw size={11} /> {id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <p className="border-t border-border-subtle pt-3 font-body text-[11.5px] text-fg-subtle">
        Everything here is stored as a change on top of the 23 shipped use cases — nothing overwrites them.{" "}
        <button onClick={() => { if (window.confirm("Discard every taxonomy change and go back to the shipped 23?")) void run(resetTaxonomyAction); }}
          className="font-semibold text-fg-muted underline decoration-dotted underline-offset-2 hover:text-sirius">
          Reset everything
        </button>
      </p>
    </div>
  );
}
