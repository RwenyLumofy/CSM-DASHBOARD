"use client";

/* The Use Case Universe.

   Two things at once, and the split is deliberate:

     LEFT   the taxonomy — 23 use cases across 6 categories, browsable and
            searchable. Category first, because that is how the deck frames it
            and how a CSM narrows down ("what kind of thing is this account
            doing?" before "which one exactly?").

     RIGHT  one use case in full — definition, what it looks like in practice,
            evidence it's working, how it usually fails, who owns it — beside
            REAL adoption from the book: which accounts confirmed it, which
            only ever had it declared on a deal, and the ARR behind each.

   The adoption numbers are what stop this being a glossary. They are also the
   part most easily misread, so counts inflated by picker behaviour rather than
   demand say so on the row itself instead of being presented as a ranking. */

import { useMemo, useState } from "react";
import { Search, Info, AlertTriangle, TrendingUp, Users2, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import { USE_CASE_GROUPS, type UseCaseGroup } from "@/lib/use-cases";
import { ROLE_LABEL } from "@/lib/stakeholders/profile";
import type { UseCaseEntry } from "@/lib/use-case-library";
import type { AdoptionSummary, UseCaseAdoption } from "@/lib/use-case-adoption";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}k` : `$${Math.round(n)}`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle px-3 py-2">
      <p className="font-body text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</p>
      <p className="tabular mt-0.5 font-display text-[17px] font-semibold text-fg">{value}</p>
      {hint && <p className="mt-0.5 font-body text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{title}</h4>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 font-body text-[12.5px] leading-relaxed text-fg-muted">
            <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-fg-subtle" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UseCaseUniverse({ library, adoption }: { library: UseCaseEntry[]; adoption: AdoptionSummary }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<UseCaseGroup | "all">("all");
  const [selectedId, setSelectedId] = useState<string>(adoption.rows[0]?.option.id ?? "");

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const adoptionById = useMemo(() => new Map(adoption.rows.map((r) => [r.option.id, r])), [adoption.rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return adoption.rows.filter((r) => {
      if (group !== "all" && !r.option.groups.includes(group)) return false;
      if (!q) return true;
      const e = byId.get(r.option.id);
      return `${r.option.label} ${r.option.summary} ${e?.definition ?? ""} ${e?.inPractice ?? ""}`.toLowerCase().includes(q);
    });
  }, [adoption.rows, group, query, byId]);

  const selected = adoptionById.get(selectedId);
  const entry = byId.get(selectedId);

  const published = adoption.rows.filter((r) => !r.option.unresolved && !r.option.provisional);
  const inUse = published.filter((r) => r.confirmed.length + r.declaredOnly.length > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Published use cases" value="23" hint="across 6 categories" />
        <Stat label="Seen in the book" value={`${inUse} of 23`} hint="confirmed or declared" />
        <Stat label="Accounts with none confirmed" value={String(adoption.unconfirmedAccounts.length)}
          hint={`of ${adoption.totalAccounts} live accounts`} />
        <Stat label="ARR without a confirmed use case" value={money(adoption.unconfirmedAccounts.reduce((n, a) => n + a.arr, 0))}
          hint="no recorded definition of success" />
      </section>

      {adoption.unconfirmedAccounts.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-[#C99A14]/25 bg-[#8A6D12]/5 px-3 py-2.5 font-body text-[12.5px] text-[#8A6D12]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{adoption.unconfirmedAccounts.length} accounts have no confirmed use case.</strong>{" "}
            An account with no recorded purpose has no definition of success, so its renewal becomes a price conversation.
            Confirm them from each account&rsquo;s profile.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
          <span className="sr-only">Search use cases</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search use cases and definitions…"
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius" />
        </label>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setGroup("all")} aria-pressed={group === "all"}
            className={cn("rounded-lg border px-2.5 py-1.5 font-body text-[12px] font-medium transition-colors",
              group === "all" ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
            All
          </button>
          {USE_CASE_GROUPS.map((g) => (
            <button key={g.id} onClick={() => setGroup(g.id)} aria-pressed={group === g.id} title={g.blurb}
              className={cn("rounded-lg border px-2.5 py-1.5 font-body text-[12px] font-medium transition-colors",
                group === g.id ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ── the taxonomy ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
          {visible.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center font-body text-[12.5px] text-fg-muted">
              Nothing matches that.
            </p>
          )}
          {visible.map((r) => {
            const total = r.confirmed.length + r.declaredOnly.length;
            const active = r.option.id === selectedId;
            return (
              <button key={r.option.id} onClick={() => setSelectedId(r.option.id)} aria-current={active ? "true" : undefined}
                className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active ? "border-sirius bg-accent-soft/60" : "border-border-subtle hover:border-border hover:bg-bg-muted/40")}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate font-body text-[13px] font-semibold text-fg">{r.option.label}</span>
                    {r.option.unresolved && (
                      <span title="Carries real data but is not in the published 23"
                        className="shrink-0 rounded-full border border-[#C99A14]/30 bg-[#8A6D12]/5 px-1.5 py-px font-body text-[10px] font-semibold text-[#8A6D12]">
                        unlisted
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate font-body text-[11.5px] text-fg-subtle">{r.option.summary}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block font-body text-[13px] font-semibold text-fg">{total}</span>
                  <span className="block font-body text-[10px] text-fg-subtle">account{total === 1 ? "" : "s"}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── one use case in full ─────────────────────────────────── */}
        {selected && entry ? (
          <article className="flex flex-col gap-4 rounded-xl border border-border p-4" aria-live="polite">
            <header>
              <div className="flex flex-wrap items-center gap-1.5">
                {selected.option.groups.map((g) => {
                  const meta = USE_CASE_GROUPS.find((x) => x.id === g)!;
                  return (
                    <span key={g} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-muted px-2 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
                      {meta.label}
                    </span>
                  );
                })}
                {selected.option.groups.length > 1 && (
                  <span className="inline-flex items-center gap-1 font-body text-[10.5px] text-fg-subtle">
                    <Layers size={10} aria-hidden /> cross-listed
                  </span>
                )}
              </div>
              <h2 className="mt-1.5 font-display text-[19px] font-semibold text-fg">{selected.option.label}</h2>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-fg-muted">{entry.definition}</p>
            </header>

            {selected.option.unresolved && (
              <p className="flex items-start gap-2 rounded-lg border border-[#C99A14]/25 bg-[#8A6D12]/5 px-2.5 py-2 font-body text-[12px] text-[#8A6D12]">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span>Not one of the published 23, but it carries real data. It keeps working; somebody needs to decide whether it becomes a use case in its own right or folds into an existing one.</span>
              </p>
            )}

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Confirmed by CS" value={String(selected.confirmed.length)} hint={money(selected.confirmedArr)} />
              <Stat label="Declared only" value={String(selected.declaredOnly.length)} hint="on a deal, never confirmed" />
              <Stat label="Total ARR" value={money(selected.totalArr)} hint="accounts touching it either way" />
            </section>

            {selected.defaultSuspicion && (
              <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-muted/40 px-2.5 py-2 font-body text-[12px] text-fg-muted">
                <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
                <span><strong className="font-semibold text-fg">Read this count carefully.</strong> {selected.defaultSuspicion}</span>
              </p>
            )}

            <div>
              <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">What it looks like</h4>
              <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">{entry.inPractice}</p>
            </div>

            <Bullets title="Examples" items={entry.examples} />
            <Bullets title="Evidence it's working" items={entry.evidence} />

            <div>
              <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">How it usually fails</h4>
              <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">{entry.pitfall}</p>
            </div>

            {entry.stakeholderRoles.length > 0 && (
              <div>
                <h4 className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Who usually owns it
                </h4>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.stakeholderRoles.map((r) => (
                    <span key={r} className="rounded-full border border-border bg-bg-muted px-2 py-0.5 font-body text-[11.5px] text-fg-muted">
                      {ROLE_LABEL[r]}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 font-body text-[11px] text-fg-subtle">
                  Roles from stakeholder mapping — an account doing this without one of these mapped is worth a look.
                </p>
              </div>
            )}

            {(selected.confirmed.length > 0 || selected.declaredOnly.length > 0) && (
              <section className="border-t border-border-subtle pt-3">
                <h4 className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  <Users2 size={11} aria-hidden /> Accounts
                </h4>
                {selected.confirmed.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {selected.confirmed.map((a) => (
                      <li key={a.id}>
                        <a href={`/clients/${a.id}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-muted">
                          <TrendingUp size={11} className="shrink-0 text-sirius" aria-hidden />
                          <span dir="auto" className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg">{a.name}</span>
                          <span className="tabular shrink-0 font-body text-[11.5px] text-fg-subtle">{money(a.arr)}</span>
                          <ChevronRight size={12} className="shrink-0 text-fg-subtle" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {selected.declaredOnly.length > 0 && (
                  <>
                    <p className="mt-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                      Declared on a deal, never confirmed
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {selected.declaredOnly.map((a) => (
                        <li key={a.id}>
                          <a href={`/clients/${a.id}`}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-muted">
                            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-fg-subtle" />
                            <span dir="auto" className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg-muted">{a.name}</span>
                            <span className="tabular shrink-0 font-body text-[11.5px] text-fg-subtle">{money(a.arr)}</span>
                            <ChevronRight size={12} className="shrink-0 text-fg-subtle" aria-hidden />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {selected.confirmed.length === 0 && selected.declaredOnly.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center font-body text-[12.5px] text-fg-muted">
                No account in your book is recorded against this yet.
                {!selected.option.unresolved && " It may genuinely not be sold — or the option may simply not exist in HubSpot for sales to pick."}
              </p>
            )}
          </article>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center font-body text-[13px] text-fg-muted">
            Choose a use case to see its definition and where it appears in your book.
          </p>
        )}
      </div>
    </div>
  );
}
