"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Upload, AlertTriangle, CheckCircle2,
  FileSpreadsheet, Loader2, UploadCloud, Download,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/format";
import type { ImportPreview } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading"; label: string }
  | { phase: "preview"; preview: ImportPreview }
  | { phase: "done"; imported: number }
  | { phase: "error"; message: string };

export function ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });

  function openDialog() {
    setFile(null);
    setPreview(null);
    setState({ phase: "idle" });
    setOpen(true);
  }

  function close() {
    if (state.phase === "loading") return;
    setOpen(false);
    if (state.phase === "done") router.refresh();
  }

  async function send(mode: "preview" | "commit", f: File) {
    setState({ phase: "loading", label: mode === "preview" ? "Reading file…" : "Importing…" });
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("mode", mode);
      const res = await fetch("/api/import/clients", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) { setState({ phase: "error", message: json.error ?? "Import failed." }); return; }
      if (mode === "commit") {
        setState({ phase: "done", imported: json.imported });
        router.refresh();
      } else {
        setPreview(json.preview);
        setState({ phase: "preview", preview: json.preview });
      }
    } catch (err) {
      setState({ phase: "error", message: String(err) });
    }
  }

  function onPick(f: File | null) {
    setFile(f);
    setPreview(null);
    setState({ phase: "idle" });
    if (f) send("preview", f);
  }

  const isDone = state.phase === "done";

  return (
    <>
      <button
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-strong bg-transparent px-3.5 py-2 font-body text-[13px] font-semibold text-fg transition-colors hover:bg-accent-soft hover:border-sirius-200"
      >
        <Upload size={14} strokeWidth={1.75} />
        Bulk import
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          <div className="relative z-10 mt-10 w-full max-w-2xl rounded-2xl border border-border bg-bg shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Clients</p>
                <h2 className="font-display text-[17px] font-semibold text-fg">Bulk import</h2>
              </div>
              <button onClick={close} className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-accent-soft hover:text-fg">
                <X size={18} />
              </button>
            </div>

            {isDone ? (
              /* ── Success state ─────────────────────────────────── */
              <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F7F1]">
                  <CheckCircle2 size={24} className="text-[#1E8F61]" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-body text-[15px] font-semibold text-fg">
                    {(state as { imported: number }).imported} {(state as { imported: number }).imported === 1 ? "client" : "clients"} imported
                  </p>
                  <p className="caption mt-1">Your client list has been updated.</p>
                </div>
                <Button size="sm" onClick={close}>Done</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-0 divide-y divide-border">

                {/* ── Step 1: Template ───────────────────────────── */}
                <div className="flex items-start gap-4 px-6 py-5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-muted font-body text-[12px] font-semibold text-fg-muted">
                    1
                  </div>
                  <div className="flex flex-1 items-center justify-between gap-4">
                    <div>
                      <p className="font-body text-[13px] font-semibold text-fg">Download the template</p>
                      <p className="caption mt-0.5">Fill in Client Name, HubSpot Company ID, Contract Value, CSM, Renewal Date, Region, Tier, and more.</p>
                    </div>
                    <a
                      href="/api/import/clients?template=1"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border-strong px-3.5 py-2 font-body text-[13px] font-semibold text-fg transition-colors hover:bg-accent-soft hover:border-sirius-200"
                    >
                      <Download size={14} strokeWidth={1.75} />
                      .xlsx template
                    </a>
                  </div>
                </div>

                {/* ── Step 2: Upload ─────────────────────────────── */}
                <div className="flex items-start gap-4 px-6 py-5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-muted font-body text-[12px] font-semibold text-fg-muted">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="font-body text-[13px] font-semibold text-fg mb-3">Upload your filled sheet</p>
                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0] ?? null); }}
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-bg-subtle px-6 py-8 text-center transition-colors hover:border-sirius-200 hover:bg-accent-soft/40"
                    >
                      <UploadCloud size={24} className="text-sirius" strokeWidth={1.5} />
                      <span className="font-body text-[13px] font-semibold text-fg">
                        {file ? file.name : "Drop file here or click to browse"}
                      </span>
                      <span className="caption">Accepts .xlsx, .xls, .csv</span>
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
                    </label>
                  </div>
                </div>

                {/* ── Status messages ────────────────────────────── */}
                {(state.phase === "loading" || state.phase === "error") && (
                  <div className="px-6 py-4">
                    {state.phase === "loading" && (
                      <div className="flex items-center gap-3 text-fg-muted">
                        <Loader2 size={15} className="animate-spin" />
                        <span className="font-body text-[13px]">{state.label}</span>
                      </div>
                    )}
                    {state.phase === "error" && (
                      <div className="flex items-center gap-2.5 rounded-lg bg-[#FFF0F3] px-3.5 py-2.5 text-[#B23A57]">
                        <AlertTriangle size={15} />
                        <span className="font-body text-[13px] font-medium">{state.message}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 3: Preview + confirm ──────────────────── */}
                {preview && (
                  <div className="flex items-start gap-4 px-6 py-5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-muted font-body text-[12px] font-semibold text-fg-muted">
                      3
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-body text-[13px] font-semibold text-fg">Review & confirm</p>
                          <Badge tone="aurora">{preview.toCreate} new</Badge>
                          {preview.toUpdate > 0 && <Badge tone="sirius">{preview.toUpdate} update</Badge>}
                          {preview.invalid > 0 && <Badge tone="nova">{preview.invalid} errors</Badge>}
                        </div>
                        <Button
                          size="sm"
                          iconLeft={FileSpreadsheet}
                          disabled={preview.valid === 0 || !file || state.phase === "loading"}
                          onClick={() => file && send("commit", file)}
                        >
                          Import {preview.valid} {preview.valid === 1 ? "client" : "clients"}
                        </Button>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        <div className="max-h-[220px] overflow-auto">
                          <table className="w-full border-collapse text-left">
                            <thead className="sticky top-0 bg-bg-subtle">
                              <tr className="border-b border-border">
                                {["Row", "Status", "Name", "ARR", "Notes"].map((h) => (
                                  <th key={h} className="px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.results.map((r) => (
                                <tr key={r.row} className="border-b border-border-subtle last:border-0">
                                  <td className="px-3 py-2"><span className="caption tabular">{r.row}</span></td>
                                  <td className="px-3 py-2">
                                    {r.action === "error" ? <Badge tone="nova">Error</Badge>
                                      : r.action === "update" ? <Badge tone="sirius">Update</Badge>
                                      : <Badge tone="aurora">New</Badge>}
                                  </td>
                                  <td className="px-3 py-2 max-w-[160px] truncate">
                                    <span className="font-body text-[13px] font-semibold text-fg">{r.data?.name ?? "—"}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <span className="tabular caption">{r.data ? formatCurrency(r.data.arr, r.data.currency, { compact: true }) : "—"}</span>
                                  </td>
                                  <td className="px-3 py-2 max-w-[180px] truncate">
                                    {r.errors.length > 0
                                      ? <span className="font-body text-[12px] text-[#B23A57]">{r.errors[0]}</span>
                                      : <span className="caption">{[r.data?.country, r.data?.csmEmail].filter(Boolean).join(" · ") || "—"}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
