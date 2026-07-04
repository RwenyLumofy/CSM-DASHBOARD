"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import type { ImportPreview } from "@/lib/types";

type State =
  | { phase: "idle" }
  | { phase: "loading"; label: string }
  | { phase: "preview"; preview: ImportPreview }
  | { phase: "done"; imported: number; preview: ImportPreview }
  | { phase: "error"; message: string };

export function ImportClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });

  async function send(mode: "preview" | "commit", f: File) {
    setState({ phase: "loading", label: mode === "preview" ? "Reading file…" : "Importing…" });
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("mode", mode);
      const res = await fetch("/api/import/clients", { method: "POST", body: form });
      const json = await res.json();
      if (!json.ok) {
        setState({ phase: "error", message: json.error ?? "Import failed." });
        return;
      }
      if (mode === "commit") {
        setState({ phase: "done", imported: json.imported, preview: json.preview });
        router.refresh();
      } else {
        setState({ phase: "preview", preview: json.preview });
      }
    } catch (err) {
      setState({ phase: "error", message: String(err) });
    }
  }

  function onPick(f: File | null) {
    setFile(f);
    setState({ phase: "idle" });
    if (f) send("preview", f);
  }

  const preview = state.phase === "preview" ? state.preview : state.phase === "done" ? state.preview : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Dropzone */}
      <Card>
        <CardEyebrow>Upload file</CardEyebrow>
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onPick(e.dataTransfer.files?.[0] ?? null);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-bg-subtle px-6 py-10 text-center transition-colors hover:border-sirius-200 hover:bg-accent-soft/40"
        >
          <UploadCloud size={28} className="text-sirius" strokeWidth={1.5} />
          <span className="font-body text-sm font-semibold text-fg">
            {file ? file.name : "Drop an .xlsx or .csv file here, or click to browse"}
          </span>
          <span className="caption">Required columns: name, arr. Everything else is optional.</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
      </Card>

      {state.phase === "loading" && (
        <Card>
          <div className="flex items-center gap-3 text-fg-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="font-body text-sm">{state.label}</span>
          </div>
        </Card>
      )}

      {state.phase === "error" && (
        <Card>
          <div className="flex items-center gap-3 text-[#B23A57]">
            <AlertTriangle size={18} />
            <span className="font-body text-sm font-semibold">{state.message}</span>
          </div>
        </Card>
      )}

      {state.phase === "done" && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[#1E8F61]">
              <CheckCircle2 size={20} />
              <span className="font-body text-sm font-semibold">
                Imported {state.imported} {state.imported === 1 ? "client" : "clients"} successfully.
              </span>
            </div>
            <Button href="/clients" variant="secondary" size="sm">
              View clients
            </Button>
          </div>
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardEyebrow>{state.phase === "done" ? "Imported" : "Preview"}</CardEyebrow>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="aurora">{preview.toCreate} to create</Badge>
                <Badge tone="sirius">{preview.toUpdate} to update</Badge>
                {preview.invalid > 0 && <Badge tone="nova">{preview.invalid} with errors</Badge>}
                <span className="caption">{preview.totalRows} rows read</span>
              </div>
            </div>
            {state.phase === "preview" && (
              <Button
                size="sm"
                disabled={preview.valid === 0 || !file}
                onClick={() => file && send("commit", file)}
                iconLeft={FileSpreadsheet}
              >
                Import {preview.valid} {preview.valid === 1 ? "client" : "clients"}
              </Button>
            )}
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-bg-subtle">
                <tr className="border-b border-border">
                  <Th>Row</Th>
                  <Th>Status</Th>
                  <Th>Name</Th>
                  <Th align="right">ARR</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.row} className="border-b border-border-subtle last:border-0">
                    <Td>
                      <span className="tabular caption">{r.row}</span>
                    </Td>
                    <Td>
                      {r.action === "error" ? (
                        <Badge tone="nova">Error</Badge>
                      ) : r.action === "update" ? (
                        <Badge tone="sirius">Update</Badge>
                      ) : (
                        <Badge tone="aurora">Create</Badge>
                      )}
                    </Td>
                    <Td>
                      <span className="font-body text-[13px] font-semibold text-fg">{r.data?.name ?? "—"}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular font-body text-[13px] text-fg-muted">
                        {r.data ? formatCurrency(r.data.arr, r.data.currency, { compact: true }) : "—"}
                      </span>
                    </Td>
                    <Td>
                      {r.errors.length > 0 ? (
                        <span className="font-body text-[12px] text-[#B23A57]">{r.errors.join("; ")}</span>
                      ) : (
                        <span className="caption">
                          {[r.data?.domain, r.data?.country, r.data?.csmEmail].filter(Boolean).join(" · ") || "—"}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Th({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted",
        align === "right" && "text-right",
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <td className={cn("px-4 py-2.5 align-middle", align === "right" && "text-right")}>{children}</td>;
}
