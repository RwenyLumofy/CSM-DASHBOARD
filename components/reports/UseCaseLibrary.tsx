"use client";

/* The Use Case Library — discovery and management.

   Replaces a permanently expanded 28-item sidebar next to a mostly empty
   canvas. That layout gave every use case identical prominence, truncated the
   long names, made categories impossible to compare, and spent the whole right
   half of the viewport on one selected entry that usually had nothing in it.

   This page does one job — find, compare and maintain — and hands the detail to
   its own route, so a use case can be linked, refreshed and navigated back to.

   Two views, because the two audiences differ. Cards are for exploring when you
   don't yet know what you're looking for; the table is for administration, where
   you are comparing status, ownership and coverage across the whole set and want
   density instead of prose. The choice persists, because whichever you prefer
   you will prefer it every time.

   ARR IS LABELLED ACCOUNT ARR. It is the sum of client.arr for accounts carrying
   the use case — the whole contract value of those accounts, not revenue this
   use case produced. Nothing in the data supports attribution, so the page must
   not imply it. */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, LayoutGrid, Table as TableIcon, X, Plus, SlidersHorizontal, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdoptionSummary } from "@/lib/use-case-adoption";
import type { UseCaseEntry } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import {
  definitionStatus, STATUS_LABEL, STATUS_TONE, STATUS_HELP,
  DEFINITION_STATUSES, type DefinitionStatus,
} from "@/lib/use-case-status";

const VIEW_KEY = "use-case-library-view";

/** Account ARR — the contract value of accounts carrying this use case. Never
 *  described as revenue the use case generated. */
const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

export interface LibraryRow {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  status: DefinitionStatus;
  accounts: number;
  accountArr: number;
}

function StatusChip({ status }: { status: DefinitionStatus }) {
  return (
    <span title={STATUS_HELP[status]}
      className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sirius/30 bg-accent-soft px-2.5 py-1 font-body text-[12px] font-medium text-sirius">
      {label}
      <button onClick={onClear} aria-label={`Remove filter: ${label}`} className="transition-opacity hover:opacity-70">
        <X size={11} />
      </button>
    </span>
  );
}

export function UseCaseLibrary({ rows, groups, canEdit, adoption }: {
  rows: LibraryRow[];
  groups: { id: string; label: string; blurb: string }[];
  canEdit: boolean;
  adoption: AdoptionSummary;
}) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<DefinitionStatus | null>(null);
  const [adoptionFilter, setAdoptionFilter] = useState<"active" | "none" | null>(null);

  // Restore the preferred view. Read after mount so the server and first client
  // render agree — reading localStorage during render hydrates mismatched.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_KEY) : null;
    if (saved === "table" || saved === "cards") setView(saved);
  }, []);
  useEffect(() => { try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category && !(r.option.groups as string[]).includes(category)) return false;
      if (status && r.status !== status) return false;
      if (adoptionFilter === "active" && r.accounts === 0) return false;
      if (adoptionFilter === "none" && r.accounts > 0) return false;
      if (!q) return true;
      // soundsLike is searched too: a CSM types what they heard on the call.
      return `${r.option.label} ${r.option.summary} ${r.entry?.goal ?? ""} ${(r.entry?.soundsLike ?? []).join(" ")}`
        .toLowerCase().includes(q);
    });
  }, [rows, query, category, status, adoptionFilter]);

  const activeFilters = [category, status, adoptionFilter, query.trim()].filter(Boolean).length;
  const clearAll = () => { setCategory(null); setStatus(null); setAdoptionFilter(null); setQuery(""); };

  const counts = useMemo(() => ({
    total: rows.length,
    described: rows.filter((r) => r.status === "described").length,
    needsDefinition: rows.filter((r) => r.status === "needs_definition").length,
    active: rows.filter((r) => r.accounts > 0).length,
  }), [rows]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── summary strip, inline rather than metric cards ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <p className="font-body text-[13px] text-fg-muted">
          <span className="tabular font-semibold text-fg">{counts.total}</span> use cases ·{" "}
          <span className="tabular font-semibold text-fg">{groups.length}</span> categories ·{" "}
          <span className="tabular font-semibold text-fg">{counts.described}</span> described ·{" "}
          <span className="tabular font-semibold text-fg">{counts.active}</span> active on accounts
        </p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link href="/use-cases?manage=categories"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <SlidersHorizontal size={13} /> Manage categories
            </Link>
            <Link href="/use-cases?new=1"
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white">
              <Plus size={13} /> Add use case
            </Link>
          </div>
        )}
      </div>

      {/* ── controls ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
          <span className="sr-only">Search use cases</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — including what a client would say…"
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius" />
        </label>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filter by category</span>
          <select value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)}
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none focus:border-sirius">
            <option value="">All categories</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filter by definition status</span>
          <select value={status ?? ""} onChange={(e) => setStatus((e.target.value || null) as DefinitionStatus | null)}
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none focus:border-sirius">
            <option value="">Any status</option>
            {DEFINITION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>

        <div role="tablist" aria-label="View" className="ml-auto flex rounded-lg border border-border p-0.5">
          {([["cards", LayoutGrid, "Cards"], ["table", TableIcon, "Table"]] as const).map(([k, Icon, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} title={label}
              className={cn("inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 font-body text-[12.5px] font-medium transition-colors",
                view === k ? "bg-accent-soft text-sirius" : "text-fg-muted hover:text-fg")}>
              <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeFilters > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {query.trim() && <FilterChip label={`“${query.trim()}”`} onClear={() => setQuery("")} />}
          {category && <FilterChip label={groups.find((g) => g.id === category)?.label ?? category} onClear={() => setCategory(null)} />}
          {status && <FilterChip label={STATUS_LABEL[status]} onClear={() => setStatus(null)} />}
          {adoptionFilter && <FilterChip label={adoptionFilter === "active" ? "On at least one account" : "No accounts yet"} onClear={() => setAdoptionFilter(null)} />}
          <button onClick={clearAll} className="font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
            Clear all
          </button>
          <span className="ml-1 font-body text-[12px] text-fg-subtle">{filtered.length} of {rows.length}</span>
        </div>
      )}

      {/* ── results ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <p className="font-body text-[13.5px] font-semibold text-fg">Nothing matches those filters</p>
          <p className="mt-1 font-body text-[12.5px] text-fg-muted">Try a broader search, or clear the filters.</p>
          <button onClick={clearAll} className="mt-3 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
            Clear all filters
          </button>
        </div>
      ) : view === "cards" ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.option.id}>
              <Link href={`/use-cases/${r.option.id}`}
                className="group flex h-full flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-sirius">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-body text-[11px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                    {r.option.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ")}
                  </span>
                  <StatusChip status={r.status} />
                </div>

                <h3 dir="auto" className="font-body text-[15px] font-semibold leading-snug text-fg">{r.option.label}</h3>

                <p className="line-clamp-2 font-body text-[12.5px] leading-relaxed text-fg-muted">
                  {r.entry?.goal || r.option.summary}
                </p>

                {r.option.unresolved && (
                  <span className="self-start rounded-full border border-[#C99A14]/30 bg-[#8A6D12]/5 px-2 py-0.5 font-body text-[11px] font-medium text-[#8A6D12]">
                    Outside published set
                  </span>
                )}

                <div className="mt-auto flex flex-col gap-1.5 border-t border-border-subtle pt-2.5">
                  <p className="tabular font-body text-[12px] text-fg-muted">
                    {r.accounts === 0
                      ? "No accounts yet"
                      : <>{r.accounts} account{r.accounts === 1 ? "" : "s"} · {money(r.accountArr)} account ARR</>}
                  </p>
                  {(r.entry?.modules.length ?? 0) > 0 && (
                    <p className="font-body text-[12px] text-fg-subtle">{r.entry!.modules.join(" · ")}</p>
                  )}
                  <span className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius">
                    View use case <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] border-collapse">
            <caption className="sr-only">Use cases with definition status, adoption and account ARR</caption>
            <thead>
              <tr className="border-b border-border bg-bg-muted/40 text-left">
                {["Use case", "Category", "Definition", "Accounts", "Account ARR", "Modules", "Outside set"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.option.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Link href={`/use-cases/${r.option.id}`} dir="auto"
                      className="font-body text-[13px] font-semibold text-fg hover:text-sirius">
                      {r.option.label}
                    </Link>
                    <span className="block max-w-[38ch] truncate font-body text-[11.5px] text-fg-subtle">
                      {r.entry?.goal || r.option.summary}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">
                    {r.option.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-3 py-2.5"><StatusChip status={r.status} /></td>
                  <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg">{r.accounts || "—"}</td>
                  <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg">{r.accountArr ? money(r.accountArr) : "—"}</td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{r.entry?.modules.join(" · ") || "—"}</td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">
                    {r.option.unresolved ? "Yes" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adoption.unmappedValues.length > 0 && (
        <p className="font-body text-[12px] text-fg-subtle">
          Unrecognised values on deals: {adoption.unmappedValues.join(", ")}. Kept, not counted.
        </p>
      )}
    </div>
  );
}
