"use client";

/* Which accounts are applying this use case, and what each is trying to do.

   Three kinds of row, and the difference matters:

     ASSOCIATED   an implementation record exists — somebody wrote down the
                  objective, scope and next step. Editable here.
     CONFIRMED    a CSM confirmed the use case on the client profile, but no
                  implementation record exists yet. One click to create one.
     DECLARED     it appeared on a deal and nobody has confirmed it since. The
                  weakest signal, and labelled as such rather than counted the
                  same as the others.

   Editing an implementation never touches the canonical definition — that is
   the whole reason the two are separate records.

   ARR here is ACCOUNT ARR: the contract value of the account, not revenue
   attributed to this use case. The column says so. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, X, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AccountRef } from "@/lib/use-case-adoption";
import {
  IMPLEMENTATION_STATUSES, IMPL_STATUS_LABEL, IMPL_STATUS_TONE, IMPL_STATUS_HELP,
  implementationGaps, type UseCaseImplementation, type ImplementationStatus,
} from "@/lib/use-case-implementation";
import { saveImplementationAction, removeImplementationAction } from "@/app/(app)/use-cases/implementation-actions";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

const fieldCls =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius";

/** An implementation joined to the account it belongs to. */
export interface ImplementationRow {
  account: AccountRef;
  implementation: UseCaseImplementation;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[11.5px] font-semibold text-fg">{label}</span>
      {hint && <span className="-mt-1 font-body text-[11px] text-fg-subtle">{hint}</span>}
      {children}
    </label>
  );
}

export function UseCaseAccounts({ useCaseId, confirmed, declaredOnly, implementations, canEdit }: {
  useCaseId: string;
  confirmed: AccountRef[];
  declaredOnly: AccountRef[];
  implementations: ImplementationRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<{ account: AccountRef; impl?: UseCaseImplementation } | null>(null);
  const [removing, setRemoving] = useState<ImplementationRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ImplementationStatus | null>(null);

  const withImpl = useMemo(() => new Set(implementations.map((r) => r.account.id)), [implementations]);
  // Confirmed accounts that nobody has written an objective for yet.
  const awaiting = confirmed.filter((a) => !withImpl.has(a.id));
  const declared = declaredOnly.filter((a) => !withImpl.has(a.id));

  const rows = statusFilter ? implementations.filter((r) => r.implementation.status === statusFilter) : implementations;

  const [form, setForm] = useState({
    status: "exploring" as ImplementationStatus, objective: "", scope: "",
    clientOwner: "", targetDate: "", nextStep: "", notes: "",
  });

  function open(account: AccountRef, impl?: UseCaseImplementation) {
    setForm({
      status: impl?.status ?? "exploring", objective: impl?.objective ?? "", scope: impl?.scope ?? "",
      clientOwner: impl?.clientOwner ?? "", targetDate: impl?.targetDate ?? "",
      nextStep: impl?.nextStep ?? "", notes: impl?.notes ?? "",
    });
    setEditing({ account, impl }); setError(null);
  }

  async function save() {
    if (!editing) return;
    setBusy(true); setError(null);
    const r = await saveImplementationAction(editing.account.id, { id: editing.impl?.id, useCaseId, ...form });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return; }
    window.location.reload();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true); setError(null);
    const r = await removeImplementationAction(removing.account.id, removing.implementation.id);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't remove."); return; }
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] font-body text-[12.5px] leading-relaxed text-fg-muted">
        <b className="font-semibold text-fg">Account ARR</b> is each account&rsquo;s full contract value, not revenue
        attributed to this use case.
      </p>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {/* ── edit / create ─────────────────────────────────────────── */}
      {editing && (
        <form className="flex flex-col gap-3 rounded-xl border border-sirius/30 bg-accent-soft/20 p-4"
          onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="font-body text-[13px] font-semibold text-fg">
            {editing.impl ? "Edit" : "Associate"} — <span dir="auto">{editing.account.name}</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select className={fieldCls} value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ImplementationStatus }))}>
                {IMPLEMENTATION_STATUSES.map((s) => (
                  <option key={s} value={s} title={IMPL_STATUS_HELP[s]}>{IMPL_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Scope / population" hint='e.g. "30 engineers", "all of Ops"'>
              <input className={fieldCls} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} />
            </Field>
          </div>
          <Field label="Account-specific objective" hint="What THIS client is trying to achieve.">
            <textarea rows={2} className={fieldCls} value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Client owner">
              <input className={fieldCls} dir="auto" value={form.clientOwner}
                onChange={(e) => setForm((f) => ({ ...f, clientOwner: e.target.value }))} />
            </Field>
            <Field label="Target date">
              <input type="date" className={fieldCls} value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} />
            </Field>
            <Field label="Next step">
              <input className={fieldCls} value={form.nextStep}
                onChange={(e) => setForm((f) => ({ ...f, nextStep: e.target.value }))} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea rows={2} className={fieldCls} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(null); setError(null); }}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          </div>
        </form>
      )}

      {/* ── remove confirmation ───────────────────────────────────── */}
      {removing && (
        <div role="alertdialog" aria-labelledby="rm-title" className="rounded-xl border border-[#B23A57]/30 bg-[#B23A57]/5 p-4">
          <p id="rm-title" className="font-body text-[13px] font-semibold text-fg">
            Remove <span dir="auto">{removing.account.name}</span> from this use case?
          </p>
          <p className="mt-1 max-w-[70ch] font-body text-[12.5px] leading-relaxed text-fg-muted">
            This deletes the objective, scope and next step recorded for this account. The account itself and the
            use-case definition are untouched.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B23A57] px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Remove
            </button>
            <button onClick={() => setRemoving(null)}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Keep</button>
          </div>
        </div>
      )}

      {/* ── associated ────────────────────────────────────────────── */}
      {implementations.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-body text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Filter</span>
            {IMPLEMENTATION_STATUSES.map((s) => (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                aria-pressed={statusFilter === s} title={IMPL_STATUS_HELP[s]}
                className={cn("rounded-full border px-2.5 py-0.5 font-body text-[11.5px] font-medium transition-colors",
                  statusFilter === s ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
                {IMPL_STATUS_LABEL[s]}
                <span className="tabular ml-1 text-fg-subtle">
                  {implementations.filter((r) => r.implementation.status === s).length}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] border-collapse">
              <caption className="sr-only">Accounts applying this use case</caption>
              <thead>
                <tr className="border-b border-border bg-bg-muted/40 text-left">
                  {["Account", "Status", "Objective", "CSM", "Scope", "Next step", "Account ARR", ""].map((h) => (
                    <th key={h} scope="col"
                      className={cn("whitespace-nowrap px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle",
                        h === "Account ARR" && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ account, implementation: i }) => {
                  const gaps = implementationGaps(i);
                  return (
                    <tr key={i.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-muted/40">
                      <td className="px-3 py-2.5">
                        <Link href={`/clients/${account.id}`} dir="auto"
                          className="font-body text-[13px] font-semibold text-fg hover:text-sirius">{account.name}</Link>
                        {gaps.length > 0 && (
                          <span className="block font-body text-[11px] text-[#8A6D12]">{gaps.join(" · ")}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", IMPL_STATUS_TONE[i.status])}>
                          {IMPL_STATUS_LABEL[i.status]}
                        </span>
                      </td>
                      <td className="max-w-[26ch] px-3 py-2.5 font-body text-[12.5px] text-fg-muted">
                        {i.objective || <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{i.csmEmail ?? account.csm ?? "—"}</td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{i.scope || "—"}</td>
                      <td className="max-w-[22ch] px-3 py-2.5 font-body text-[12px] text-fg-muted">
                        {i.nextStep || <span className="text-fg-subtle">—</span>}
                        {i.targetDate && <span className="block text-[11px] text-fg-subtle">by {i.targetDate}</span>}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-body text-[12.5px] text-fg">{money(account.arr)}</td>
                      <td className="px-2 py-2.5">
                        {canEdit && (
                          <span className="flex items-center gap-0.5">
                            <button onClick={() => open(account, i)} aria-label={`Edit ${account.name}`}
                              className="rounded p-1.5 text-fg-subtle transition-colors hover:text-sirius"><Pencil size={12} /></button>
                            <button onClick={() => { setRemoving({ account, implementation: i }); setError(null); }}
                              aria-label={`Remove ${account.name}`}
                              className="rounded p-1.5 text-fg-subtle transition-colors hover:text-[#B23A57]"><Trash2 size={12} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── recorded but not yet written up ───────────────────────── */}
      {(awaiting.length > 0 || declared.length > 0) && (
        <section className="rounded-xl border border-border-subtle bg-bg-muted/30 p-4">
          <h3 className="font-body text-[12.5px] font-semibold text-fg">
            {awaiting.length + declared.length} account{awaiting.length + declared.length === 1 ? "" : "s"} recorded, nothing written up
          </h3>
          <p className="mt-0.5 max-w-[70ch] font-body text-[11.5px] leading-relaxed text-fg-muted">
            These carry the use case but no objective, scope or next step. Associating one turns it into something a CSM can act on.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1">
            {[...awaiting.map((a) => [a, "Confirmed by CS"] as const),
              ...declared.map((a) => [a, "Declared on a deal, not confirmed"] as const)].map(([a, how]) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-1.5 last:border-0">
                <Link href={`/clients/${a.id}`} dir="auto" className="font-body text-[12.5px] font-medium text-fg hover:text-sirius">{a.name}</Link>
                <span className="font-body text-[11.5px] text-fg-subtle">{how}</span>
                <span className="tabular ml-auto font-body text-[12px] text-fg-muted">{money(a.arr)}</span>
                {canEdit && (
                  <button onClick={() => open(a)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    <Plus size={10} /> Associate
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {implementations.length === 0 && awaiting.length === 0 && declared.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <p className="font-body text-[13.5px] font-semibold text-fg">No accounts are using this yet</p>
          <p className="mx-auto mt-1 max-w-md font-body text-[12.5px] text-fg-muted">
            Accounts appear here when a CSM confirms the use case on the client profile, or a deal declares it.
          </p>
        </div>
      )}
    </div>
  );
}
