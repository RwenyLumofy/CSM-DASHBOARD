"use client";

/* What the account is actually trying to achieve.

   Two lists, deliberately not merged:

     Confirmed   what CS has verified is really happening. Editable here.
     Declared    what sales recorded on the deal. Read-only — the HubSpot sync
                 rewrites deal columns on every run, so anything typed there
                 lasts four hours at most.

   The gap between them is the point. A use case sold but never confirmed is a
   promise nobody has validated; one CS found that was never sold is expansion
   signal. Merging them into a single chip list — which is what the rollup did —
   destroys both facts.

   The picker groups 26 options into 5 themes and adds search, because the
   previous experience was one flat ungrouped multi-select. */

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Search, Target, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  USE_CASES, USE_CASE_GROUPS, USE_CASE_BY_ID, useCaseLabel, compareUseCases, isProvisionalOnly,
} from "@/lib/use-cases";
import { setAccountUseCasesAction } from "@/app/(app)/clients/[id]/use-case-actions";

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "confirmed" | "muted" | "warn" }) {
  const tones = {
    neutral: "border-border bg-bg-muted text-fg-muted",
    confirmed: "border-sirius/30 bg-accent-soft text-sirius",
    muted: "border-border-subtle bg-bg text-fg-subtle",
    warn: "border-[#C99A14]/30 bg-[#8A6D12]/5 text-[#8A6D12]",
  };
  return <span className={cn("inline-block rounded-full border px-2.5 py-0.5 font-body text-[11.5px] font-medium", tones[tone])}>{children}</span>;
}

export function AccountUseCases({ clientId, accountUseCases, dealUseCases, canEdit }: {
  clientId: string;
  /** Raw stored ids from client.properties.account_use_cases. */
  accountUseCases: unknown;
  /** Union of tracked deals' use_cases, as synced. */
  dealUseCases: string[];
  canEdit: boolean;
}) {
  const cmp = useMemo(() => compareUseCases(accountUseCases, dealUseCases), [accountUseCases, dealUseCases]);
  const [selected, setSelected] = useState<string[]>(cmp.confirmed);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["learning"]));

  const dirty = useMemo(
    () => JSON.stringify([...selected].sort()) !== JSON.stringify([...cmp.confirmed].sort()),
    [selected, cmp.confirmed],
  );

  async function save() {
    setBusy(true); setError(null);
    const r = await setAccountUseCasesAction(clientId, selected);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return; }
    setEditing(false);
  }

  const q = query.trim().toLowerCase();
  const matches = (id: string) => !q || useCaseLabel(id).toLowerCase().includes(q);

  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="uc-h">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="uc-h" className="flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-fg">
            <Target size={14} className="text-fg-subtle" aria-hidden /> Use cases
          </h3>
          <p className="mt-0.5 font-body text-[11.5px] text-fg-muted">What this account is using Lumofy to achieve.</p>
        </div>
        {canEdit && !editing && (
          <button onClick={() => { setSelected(cmp.confirmed); setEditing(true); }}
            className="rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            {cmp.confirmed.length ? "Edit" : "Confirm use cases"}
          </button>
        )}
      </div>

      {!editing && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <p className="mb-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              Confirmed by CS
            </p>
            {cmp.confirmed.length === 0 ? (
              <p className="font-body text-[12.5px] text-fg-muted">
                Nobody has confirmed what this account is actually doing.
                {cmp.declared.length > 0 && " Sales recorded some on the deal — confirm or correct them."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {cmp.confirmed.map((id) => <Chip key={id} tone="confirmed">{useCaseLabel(id)}</Chip>)}
              </div>
            )}
            {isProvisionalOnly(cmp.confirmed) && (
              <p className="mt-1.5 flex items-start gap-1.5 font-body text-[11.5px] text-[#8A6D12]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                Only provisional answers recorded — the account&rsquo;s purpose is still unestablished.
              </p>
            )}
          </div>

          {cmp.declared.length > 0 && (
            <div>
              <p className="mb-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Declared on the deal <span className="font-normal normal-case tracking-normal">· from HubSpot, read-only</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cmp.declared.map((id) => <Chip key={id} tone="muted">{useCaseLabel(id)}</Chip>)}
              </div>
            </div>
          )}

          {/* The two deltas — the reason these lists are kept apart. */}
          {cmp.unconfirmed.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-[#C99A14]/25 bg-[#8A6D12]/5 px-2.5 py-2 font-body text-[11.5px] text-[#8A6D12]">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span><strong className="font-semibold">Sold but not confirmed:</strong> {cmp.unconfirmed.map(useCaseLabel).join(", ")}. Nobody has verified the account is doing this.</span>
            </p>
          )}
          {cmp.emergent.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg border border-sirius/25 bg-accent-soft/50 px-2.5 py-2 font-body text-[11.5px] text-sirius">
              <Sparkles size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span><strong className="font-semibold">Emerged after the sale:</strong> {cmp.emergent.map(useCaseLabel).join(", ")}. Not on any deal — possible expansion.</span>
            </p>
          )}
          {cmp.unmapped.length > 0 && (
            <p className="font-body text-[11.5px] text-fg-subtle">
              Unrecognised value{cmp.unmapped.length === 1 ? "" : "s"} from HubSpot: {cmp.unmapped.join(", ")}. Kept, but not counted in reporting.
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          <label className="relative flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
            <span className="sr-only">Search use cases</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search use cases…"
              className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius" />
          </label>

          <div className="flex flex-col gap-1.5">
            {USE_CASE_GROUPS.map((g) => {
              const items = USE_CASES.filter((u) => u.group === g.id && matches(u.id));
              if (items.length === 0) return null;
              // Search auto-expands, otherwise groups behave as the user left them.
              const open = q.length > 0 || openGroups.has(g.id);
              const chosen = items.filter((u) => selected.includes(u.id)).length;
              return (
                <div key={g.id} className="rounded-lg border border-border-subtle">
                  <button type="button" aria-expanded={open}
                    onClick={() => setOpenGroups((prev) => {
                      const next = new Set(prev);
                      next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                      return next;
                    })}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left">
                    <span className="flex-1">
                      <span className="block font-body text-[12.5px] font-semibold text-fg">{g.label}</span>
                      <span className="block font-body text-[11px] text-fg-subtle">{g.blurb}</span>
                    </span>
                    {chosen > 0 && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-body text-[10.5px] font-semibold text-sirius">{chosen}</span>
                    )}
                    <ChevronDown size={13} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                  {open && (
                    <ul className="border-t border-border-subtle p-1.5">
                      {items.map((u) => {
                        const on = selected.includes(u.id);
                        return (
                          <li key={u.id}>
                            <button type="button" role="checkbox" aria-checked={on}
                              onClick={() => setSelected((prev) => on ? prev.filter((x) => x !== u.id) : [...prev, u.id])}
                              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-[12.5px] transition-colors",
                                on ? "bg-accent-soft text-sirius" : "text-fg-muted hover:bg-bg-muted")}>
                              <span className={cn("grid size-4 shrink-0 place-items-center rounded border",
                                on ? "border-sirius bg-sirius text-white" : "border-border")}>
                                {on && <Check size={11} strokeWidth={3} />}
                              </span>
                              <span className="flex-1">{u.label}</span>
                              {u.provisional && <span className="font-body text-[10.5px] text-fg-subtle">provisional</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p role="alert" className="font-body text-[12px] text-[#B23A57]">{error}</p>}

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button onClick={() => { setEditing(false); setSelected(cmp.confirmed); setError(null); }}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
            <span className="font-body text-[11.5px] text-fg-subtle">{selected.length} selected</span>
          </div>
        </div>
      )}
    </section>
  );
}
