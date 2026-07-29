"use client";

/* Export the Use Case Universe, or import one exported elsewhere.

   IMPORT IS NEVER ONE CLICK. Picking a file only previews: it names every use
   case that would be created and every one that would be rewritten, plus any
   category it needs to add and anything it had to drop. Nothing is written
   until that summary is approved. Rewriting the definitions every CSM
   classifies against is not something to do on a mis-click.

   The summary leads with CREATED, not updated. An unexpected "create" almost
   always means a name drifted between the two environments — the file says
   "Certification Prep" and this side says "Certification Preparation" — and
   the result would be a duplicate rather than the update you wanted. Updates
   are the boring case; creations are the ones worth reading. */

import { useRef, useState } from "react";
import { Download, Upload, Loader2, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  exportUseCaseUniverseAction, previewImportAction, applyImportAction,
  type PreviewResult,
} from "@/app/(app)/use-cases/transfer-actions";

type Summary = NonNullable<PreviewResult["summary"]>;

export function UseCaseTransfer({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<"export" | "preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<{ json: string; summary: Summary } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    setBusy("export"); setError(null); setNote(null);
    const r = await exportUseCaseUniverseAction();
    setBusy(null);
    if (!r.ok || !r.json) { setError(r.error ?? "Couldn't build the export."); return; }
    // Blob + object URL: the file never round-trips through a server route, so
    // nothing is written to disk anywhere but the browser's download folder.
    const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = r.filename ?? "use-case-universe.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    setNote(`Exported ${r.count} use cases.`);
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy("preview"); setError(null); setNote(null); setPending(null);
    const json = await file.text();
    const r = await previewImportAction(json);
    setBusy(null);
    if (!r.ok || !r.summary) { setError(r.error ?? "Couldn't read that file."); return; }
    setPending({ json, summary: r.summary });
  }

  async function confirm() {
    if (!pending) return;
    setBusy("apply"); setError(null);
    const r = await applyImportAction(pending.json);
    setBusy(null);
    if (!r.ok) { setError(r.error ?? "Couldn't apply the import."); return; }
    setPending(null);
    setNote(`Imported — ${r.updated} updated, ${r.created} created.`);
    // Full reload: the taxonomy underneath every list on the page just changed.
    setTimeout(() => window.location.reload(), 700);
  }

  const s = pending?.summary;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-fg">Move the library between environments</h2>
          <p className="mt-0.5 max-w-[70ch] font-body text-[12px] leading-relaxed text-fg-muted">
            Matched by use case <strong className="font-semibold text-fg">name</strong>, not id — ids for
            use cases your team added differ per environment. Importing never deletes: anything
            here but missing from the file is left alone.
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg border border-border p-1.5 text-fg-muted hover:text-fg">
          <X size={13} />
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      {note && (
        <p className="flex items-start gap-2 rounded-lg border border-[#1F9D63]/30 bg-[#1F9D63]/5 px-3 py-2 font-body text-[12.5px] text-[#1F9D63]">
          <Check size={13} className="mt-0.5 shrink-0" aria-hidden /> {note}
        </p>
      )}

      {!pending && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void doExport()} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:opacity-50">
            {busy === "export" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Export JSON
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
            {busy === "preview" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import JSON…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      )}

      {s && (
        <div className="flex flex-col gap-3 rounded-lg border border-sirius/30 bg-accent-soft/20 p-3">
          <p className="font-body text-[12px] text-fg-muted">
            Exported {s.exportedAt ? s.exportedAt.slice(0, 10) : "date unknown"}
            {s.exportedBy && <> by {s.exportedBy}</>}. Nothing has been written yet.
          </p>

          <Block tone="create" title={`Create ${s.created.length} use case${s.created.length === 1 ? "" : "s"}`} names={s.created}
            hint="A name that should have matched an existing entry will appear here as a NEW one — check for a rename before applying." />
          <Block tone="update" title={`Rewrite ${s.updated.length} definition${s.updated.length === 1 ? "" : "s"}`} names={s.updated} />
          {s.newCategories.length > 0 && (
            <Block tone="update" title={`Add ${s.newCategories.length} categor${s.newCategories.length === 1 ? "y" : "ies"}`} names={s.newCategories} />
          )}

          {s.warnings.length > 0 && (
            <div>
              <p className="font-body text-[12px] font-semibold text-[#8A6D12]">
                {s.warnings.length} thing{s.warnings.length === 1 ? "" : "s"} dropped
              </p>
              <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                {s.warnings.map((w, i) => (
                  <li key={i} className="font-body text-[11.5px] leading-relaxed text-[#8A6D12]">· {w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void confirm()} disabled={busy === "apply"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy === "apply" && <Loader2 size={12} className="animate-spin" />}
              {busy === "apply" ? "Applying…" : "Apply this import"}
            </button>
            <button onClick={() => { setPending(null); setError(null); }} disabled={busy === "apply"}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({ tone, title, names, hint }: {
  tone: "create" | "update"; title: string; names: string[]; hint?: string;
}) {
  if (names.length === 0) return null;
  return (
    <div>
      <p className={cn("font-body text-[12px] font-semibold",
        tone === "create" ? "text-sirius" : "text-fg")}>{title}</p>
      {hint && <p className="mt-0.5 font-body text-[11.5px] leading-relaxed text-fg-subtle">{hint}</p>}
      <ul className="mt-1 flex max-h-40 flex-wrap gap-x-2 gap-y-0.5 overflow-y-auto">
        {names.map((n) => (
          <li key={n} className="font-body text-[11.5px] text-fg-muted">{n}</li>
        ))}
      </ul>
    </div>
  );
}
