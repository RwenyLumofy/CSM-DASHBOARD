"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ExternalLink, ArrowRight } from "lucide-react";
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

type State = { phase: "idle" } | { phase: "saving" } | { phase: "done"; id: string; name: string } | { phase: "error"; message: string };

export interface AddClientOption { id: string; name: string; email?: string | null }

export function AddClientDialog({
  csms = [],
  countries = [],
  industries = [],
  existingNames = [],
}: {
  /** Real team members, so the owner is picked rather than typed — a typo'd
   *  email silently created an UNASSIGNED account, which then disappears from
   *  every CSM's book. */
  csms?: AddClientOption[];
  /** Values already in the book, offered as suggestions so "Saudi Arabia",
   *  "saudi arabia" and "KSA" don't become three separate filter values. */
  countries?: string[];
  industries?: string[];
  /** Lower-cased existing names, to warn before creating a duplicate. */
  existingNames?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [showMore, setShowMore] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openDialog() {
    setForm(EMPTY);
    setState({ phase: "idle" });
    setShowMore(false);
    setOpen(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function close() {
    if (state.phase === "saving") return;
    setOpen(false);
  }

  // Warn (never block) when the typed name already exists — a near-duplicate is
  // sometimes legitimate (two entities, same parent), so this is advisory.
  const nameSet = useMemo(() => new Set(existingNames.map((n) => n.trim().toLowerCase())), [existingNames]);
  const duplicate = form.name.trim().length > 2 && nameSet.has(form.name.trim().toLowerCase());

  const canSubmit = form.name.trim() !== "" && form.hubspotId.trim() !== "" && form.arr !== "" && state.phase !== "saving";

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
      // Keep the success state up with a link to the new account instead of
      // auto-closing — the next thing you usually want is to open it.
      setState({ phase: "done", id: json.id, name: json.name ?? form.name.trim() });
      router.refresh();
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />

          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">New account</p>
                <h2 className="font-display text-[17px] font-semibold text-fg">Add client</h2>
              </div>
              <button onClick={close} className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-accent-soft hover:text-fg">
                <X size={18} />
              </button>
            </div>

            {state.phase === "done" ? (
              <div className="flex flex-col items-center gap-3 px-6 py-11 text-center">
                <CheckCircle2 size={36} className="text-[#1E8F61]" strokeWidth={1.5} />
                <div>
                  <p className="font-body text-sm font-semibold text-fg">{state.name} added</p>
                  <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">It’s in the book now. Usage and support data link on the next sync.</p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setForm(EMPTY); setState({ phase: "idle" }); setShowMore(false); setTimeout(() => nameRef.current?.focus(), 50); }}>
                    Add another
                  </Button>
                  <Button size="sm" iconRight={ArrowRight} onClick={() => { setOpen(false); router.push(`/clients/${state.id}`); }}>
                    Open account
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    {state.phase === "error" && (
                      <div className="flex items-start gap-2.5 rounded-lg bg-[#FFF0F3] px-3.5 py-2.5 text-[#B23A57]">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span className="font-body text-[13px] font-medium">{state.message}</span>
                      </div>
                    )}

                    {/* ---- Essentials: the only three fields required to save ---- */}
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
                      {duplicate && (
                        <span className="flex items-center gap-1.5 font-body text-[12px] font-medium text-[#8A6D12]">
                          <AlertTriangle size={12} /> An account with this name already exists — check before adding.
                        </span>
                      )}
                    </div>

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
                          <option>USD</option><option>SAR</option><option>EUR</option><option>GBP</option><option>AED</option>
                        </select>
                      </div>
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
                      {/* Say WHY it's required — otherwise this reads as bureaucracy
                          and it's the field people get stuck on. */}
                      <span className="font-body text-[11.5px] leading-snug text-fg-subtle">
                        Links the account to its HubSpot deals, contacts and meetings on each sync.{" "}
                        <a
                          href="https://app.hubspot.com/contacts/objects/0-2/views/all/list"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-semibold text-sirius hover:underline"
                        >
                          Find it in HubSpot <ExternalLink size={10} />
                        </a>
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label>Owner (CSM)</Label>
                      {csms.length > 0 ? (
                        <select value={form.csmEmail} onChange={(e) => set("csmEmail", e.target.value)} className={inputCls}>
                          <option value="">— unassigned —</option>
                          {csms.map((m) => (
                            <option key={m.id} value={m.email ?? ""} disabled={!m.email}>
                              {m.name}{m.email ? "" : " (no email on file)"}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={form.csmEmail}
                          onChange={(e) => set("csmEmail", e.target.value)}
                          placeholder="csm@lumofy.com"
                          className={inputCls}
                        />
                      )}
                    </div>

                    {/* ---- Everything else is optional and collapsed by default ---- */}
                    <button
                      type="button"
                      onClick={() => setShowMore((v) => !v)}
                      className="-mx-1 flex items-center gap-1.5 rounded-lg px-1 py-1 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:text-fg"
                    >
                      <ChevronDown size={14} className={cn("transition-transform", showMore && "rotate-180")} />
                      {showMore ? "Hide" : "Add"} details — dates, segment, firmographics
                      <span className="font-normal text-fg-subtle">(optional)</span>
                    </button>

                    {showMore && (
                      <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
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

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <Label>Segment</Label>
                            <select value={form.segment} onChange={(e) => set("segment", e.target.value)} className={inputCls}>
                              <option value="">— select —</option>
                              <option value="enterprise">Enterprise</option>
                              <option value="mid_market">Mid-market</option>
                              <option value="smb">SMB</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label>Domain</Label>
                            <input value={form.domain} onChange={(e) => set("domain", e.target.value)} placeholder="acme.com" className={inputCls} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <Label>Industry</Label>
                            <input
                              list="add-client-industries"
                              value={form.industry}
                              onChange={(e) => set("industry", e.target.value)}
                              placeholder="Financial Services"
                              className={inputCls}
                            />
                            <datalist id="add-client-industries">
                              {industries.map((v) => <option key={v} value={v} />)}
                            </datalist>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label>Country</Label>
                            <input
                              list="add-client-countries"
                              value={form.country}
                              onChange={(e) => set("country", e.target.value)}
                              placeholder="Saudi Arabia"
                              className={inputCls}
                            />
                            <datalist id="add-client-countries">
                              {countries.map((v) => <option key={v} value={v} />)}
                            </datalist>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <Label>Total employees</Label>
                          <input type="number" min={1} value={form.employees} onChange={(e) => set("employees", e.target.value)} placeholder="250" className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2.5 border-t border-border px-6 py-4">
                  <span className="font-body text-[12px] text-fg-subtle">
                    {canSubmit ? "Ready to add" : "Name, ARR and HubSpot ID required"}
                  </span>
                  <div className="flex items-center gap-2.5">
                    <Button type="button" variant="secondary" size="sm" onClick={close} disabled={state.phase === "saving"}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={!canSubmit} iconLeft={state.phase === "saving" ? Loader2 : undefined}>
                      {state.phase === "saving" ? "Saving…" : "Add client"}
                    </Button>
                  </div>
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
