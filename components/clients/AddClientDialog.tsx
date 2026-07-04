"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

interface FormData {
  name: string;
  hubspotId: string;
  arr: string;
  currency: string;
  csmEmail: string;
  startedAt: string;
  renewalDate: string;
  industry: string;
  country: string;
  employees: string;
  segment: string;
  domain: string;
}

const EMPTY: FormData = {
  name: "", hubspotId: "", arr: "", currency: "USD", csmEmail: "",
  startedAt: "", renewalDate: "", industry: "", country: "",
  employees: "", segment: "", domain: "",
};

type State = { phase: "idle" } | { phase: "saving" } | { phase: "done" } | { phase: "error"; message: string };

export function AddClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [state, setState] = useState<State>({ phase: "idle" });
  const nameRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openDialog() {
    setForm(EMPTY);
    setState({ phase: "idle" });
    setOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function close() {
    if (state.phase === "saving") return;
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "saving" });
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          hubspotId: form.hubspotId.trim(),
          arr: form.arr ? Number(form.arr) : undefined,
          currency: form.currency || "USD",
          csmEmail: form.csmEmail || undefined,
          startedAt: form.startedAt || undefined,
          renewalDate: form.renewalDate || undefined,
          industry: form.industry || undefined,
          country: form.country || undefined,
          employees: form.employees ? Number(form.employees) : undefined,
          segment: form.segment || undefined,
          domain: form.domain || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setState({ phase: "error", message: json.error ?? "Failed to create client." }); return; }
      setState({ phase: "done" });
      router.refresh();
      setTimeout(() => { setOpen(false); setState({ phase: "idle" }); }, 1400);
    } catch (err) {
      setState({ phase: "error", message: String(err) });
    }
  }

  return (
    <>
      <Button size="sm" iconLeft={Plus} onClick={openDialog}>
        Add Client
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-bg shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">New account</p>
                <h2 className="font-display text-[17px] font-semibold text-fg">Add client</h2>
              </div>
              <button onClick={close} className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-accent-soft hover:text-fg">
                <X size={18} />
              </button>
            </div>

            {/* Success state */}
            {state.phase === "done" ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <CheckCircle2 size={36} className="text-[#1E8F61]" strokeWidth={1.5} />
                <p className="font-body text-sm font-semibold text-fg">Client added successfully</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    {/* Error banner */}
                    {state.phase === "error" && (
                      <div className="flex items-center gap-2.5 rounded-lg bg-[#FFF0F3] px-3.5 py-2.5 text-[#B23A57]">
                        <AlertTriangle size={15} />
                        <span className="font-body text-[13px] font-medium">{state.message}</span>
                      </div>
                    )}

                    {/* Row: Name + HubSpot Company ID */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label required>Client name</Label>
                        <input
                          ref={nameRef}
                          required
                          value={form.name}
                          onChange={(e) => set("name", e.target.value)}
                          placeholder="Acme Industries"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label required>HubSpot Company ID</Label>
                        <input
                          required
                          value={form.hubspotId}
                          onChange={(e) => set("hubspotId", e.target.value)}
                          placeholder="4020153725"
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Row: ARR + Currency */}
                    <div className="grid grid-cols-[1fr_120px] gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label required>Contract value (ARR)</Label>
                        <input
                          required
                          type="number"
                          min={0}
                          step="any"
                          value={form.arr}
                          onChange={(e) => set("arr", e.target.value)}
                          placeholder="24000"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Currency</Label>
                        <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
                          <option>USD</option>
                          <option>SAR</option>
                          <option>EUR</option>
                          <option>GBP</option>
                          <option>AED</option>
                        </select>
                      </div>
                    </div>

                    {/* Row: Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Contract start</Label>
                        <input type="date" value={form.startedAt} onChange={(e) => set("startedAt", e.target.value)} className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Renewal date</Label>
                        <input type="date" value={form.renewalDate} onChange={(e) => set("renewalDate", e.target.value)} className={inputCls} />
                      </div>
                    </div>

                    {/* Row: CSM + Segment */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>CSM (email or name)</Label>
                        <input
                          value={form.csmEmail}
                          onChange={(e) => set("csmEmail", e.target.value)}
                          placeholder="csm@lumofy.com"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Tier</Label>
                        <select value={form.segment} onChange={(e) => set("segment", e.target.value)} className={inputCls}>
                          <option value="">— select —</option>
                          <option value="enterprise">Enterprise</option>
                          <option value="mid_market">Mid-market</option>
                          <option value="smb">SMB</option>
                        </select>
                      </div>
                    </div>

                    {/* Row: Industry + Country */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Industry</Label>
                        <input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Technology" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Region / Country</Label>
                        <input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Saudi Arabia" className={inputCls} />
                      </div>
                    </div>

                    {/* Row: Employees + Domain */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label>Total employees</Label>
                        <input type="number" min={1} value={form.employees} onChange={(e) => set("employees", e.target.value)} placeholder="250" className={inputCls} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Domain</Label>
                        <input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="acme.com" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-4">
                  <Button type="button" variant="secondary" size="sm" onClick={close} disabled={state.phase === "saving"}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={state.phase === "saving"} iconLeft={state.phase === "saving" ? Loader2 : undefined}>
                    {state.phase === "saving" ? "Saving…" : "Add client"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="font-body text-[12px] font-semibold text-fg-muted">
      {children}{required && <span className="ml-0.5 text-[#B23A57]">*</span>}
    </label>
  );
}

const inputCls = cn(
  "w-full rounded-[10px] border border-border-strong bg-bg px-3 py-2 font-body text-[13px] text-fg placeholder:text-fg-muted",
  "outline-none transition-colors focus:border-sirius focus:ring-2 focus:ring-sirius/20",
  "disabled:opacity-50",
);
