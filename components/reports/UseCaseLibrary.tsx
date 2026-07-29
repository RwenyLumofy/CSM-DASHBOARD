"use client";

/* The Use Case Library — find the right use case, and see the shape of the
   portfolio.

   WHY THIS IS NO LONGER A DENSE LIST. The previous version was a spreadsheet
   in disguise: each row truncated the definition to one line and right-aligned
   five metadata slots that were mostly empty, so 28 use cases looked identical
   and the columns read as gaps. That was the correct shape when the library
   shipped empty and there was nothing to show. Every entry now carries a real
   one-line definition from the Use Case Definition Library, so the page can
   show what a use case actually MEANS — which is the only thing that makes 28
   of them tellable apart.

   REVIEW STATE IS AN AGGREGATE, NOT A BADGE. Every entry currently awaits its
   first review. Stamping "Needs review" on all 28 cards is exactly the noise
   that "Draft · Needs review" was — so the count lives in the header and the
   filter, and the individual flag lives on the detail page where it is about
   one entry and can be acted on.

   The table view is gone. It carried the same columns as the cards for an
   "administration" job that TaxonomyManager already does properly.

   ARR IS LABELLED ACCOUNT ARR. It is the sum of client.arr for accounts
   carrying the use case — the whole contract value of those accounts, not
   revenue this use case produced. Nothing in the data supports attribution. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Plus, SlidersHorizontal, PenLine } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdoptionSummary } from "@/lib/use-case-adoption";
import type { UseCaseEntry } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import type { LifecycleStatus } from "@/lib/use-case-status";

/** Account ARR — the contract value of accounts carrying this use case. Never
 *  described as revenue the use case generated. */
const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

export interface LibraryRow {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  status: LifecycleStatus;
  /** "" when there is nothing worth saying — see lib/use-case-status.ts. */
  statusText: string;
  accounts: number;
  accountArr: number;
}

type Filter = "needs_review" | "on_accounts" | "no_accounts" | "archived";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={cn("rounded-full border px-2.5 py-1 font-body text-[12px] font-medium transition-colors",
        on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
      {children}
    </button>
  );
}

export function UseCaseLibrary({ rows, groups, canEdit, adoption, basePath = "/use-cases" }: {
  rows: LibraryRow[];
  groups: { id: string; label: string; blurb: string }[];
  canEdit: boolean;
  adoption: AdoptionSummary;
  /** Where a card links. Overridden only by the dev preview harness. */
  basePath?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && t !== "INPUT" && t !== "SELECT" && t !== "TEXTAREA") {
        e.preventDefault(); searchRef.current?.focus();
      }
      if (e.key === "Escape") (e.target as HTMLElement)?.blur?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => ({
    total: rows.filter((r) => r.status !== "archived").length,
    onAccounts: rows.filter((r) => r.accounts > 0).length,
    needsReview: rows.filter((r) => r.statusText && r.status !== "archived").length,
    archived: rows.filter((r) => r.status === "archived").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // Archived is opt-in: it is kept for accounts that reference it, not for
      // browsing. Every other filter implies "not archived".
      if (filter === "archived") { if (r.status !== "archived") return false; }
      else if (r.status === "archived") return false;

      if (category && !(r.option.groups as string[]).includes(category)) return false;
      if (filter === "needs_review" && !r.statusText) return false;
      if (filter === "on_accounts" && r.accounts === 0) return false;
      if (filter === "no_accounts" && r.accounts > 0) return false;
      if (!q) return true;
      // clientPhrases are searched too: a CSM types what they heard on a call.
      return `${r.option.label} ${r.option.summary} ${r.entry?.oneLiner ?? ""} ${r.entry?.customerProblem ?? ""} ${(r.entry?.clientPhrases ?? []).join(" ")}`
        .toLowerCase().includes(q);
    });
  }, [rows, query, category, filter]);

  /** Grouped by category. A cross-listed use case appears under each of its
   *  categories, which is what cross-listing means. */
  const grouped = useMemo(() => {
    const out = groups
      .map((g) => ({ group: g, rows: filtered.filter((r) => (r.option.groups as string[]).includes(g.id)) }))
      .filter((s) => s.rows.length > 0);
    const filed = new Set(out.flatMap((s) => s.rows.map((r) => r.option.id)));
    const orphans = filtered.filter((r) => !filed.has(r.option.id));
    return orphans.length
      ? [...out, { group: { id: "__none", label: "Uncategorised", blurb: "" }, rows: orphans }]
      : out;
  }, [filtered, groups]);

  const active = [query.trim(), category, filter].filter(Boolean).length;
  const clearAll = () => { setQuery(""); setCategory(null); setFilter(null); };
  const toggle = (f: Filter) => setFilter((c) => (c === f ? null : f));

  return (
    <div className="flex flex-col gap-5">
      {/* ── what the portfolio looks like ──────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <p className="font-body text-[13px] text-fg-muted">
          <span className="tabular font-semibold text-fg">{counts.total}</span> use cases ·{" "}
          <span className="tabular font-semibold text-fg">{groups.length}</span> categories ·{" "}
          <span className="tabular font-semibold text-fg">{counts.onAccounts}</span> on accounts
          {counts.needsReview > 0 && <> · <span className="tabular font-semibold text-[#8A6D12]">{counts.needsReview}</span> awaiting review</>}
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${basePath}/write`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <PenLine size={13} /> Write definitions
            </Link>
            <Link href="/use-cases?manage=categories"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <SlidersHorizontal size={13} /> Manage
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
        <label className="relative flex min-w-[240px] flex-1 items-center sm:max-w-md">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
          <span className="sr-only">Search use cases</span>
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a problem, or what a client would say…    /"
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Filter by category</span>
          <select value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)}
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none focus:border-sirius">
            <option value="">All categories</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <Toggle on={filter === "on_accounts"} onClick={() => toggle("on_accounts")}>On accounts</Toggle>
        <Toggle on={filter === "no_accounts"} onClick={() => toggle("no_accounts")}>Not yet used</Toggle>
        {counts.needsReview > 0 && (
          <Toggle on={filter === "needs_review"} onClick={() => toggle("needs_review")}>Awaiting review</Toggle>
        )}
        {counts.archived > 0 && (
          <Toggle on={filter === "archived"} onClick={() => toggle("archived")}>Archived {counts.archived}</Toggle>
        )}
        {active > 0 && (
          <button onClick={clearAll}
            className="inline-flex items-center gap-1 font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
            <X size={11} /> Clear · {filtered.length} of {counts.total}
          </button>
        )}
      </div>

      {/* ── results ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <p className="font-body text-[13.5px] font-semibold text-fg">Nothing matches</p>
          <p className="mt-1 font-body text-[12.5px] text-fg-muted">Try a broader search, or clear the filters.</p>
          <button onClick={clearAll}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(({ group, rows: gRows }) => (
            <section key={group.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="font-body text-[12px] font-semibold uppercase tracking-[0.07em] text-fg">{group.label}</h2>
                <span className="tabular font-body text-[12px] text-fg-subtle">{gRows.length}</span>
                {/* The category blurb existed all along and was never shown. It
                    is the one line that says why these belong together. */}
                {group.blurb && (
                  <p className="w-full font-body text-[12.5px] leading-relaxed text-fg-subtle sm:w-auto sm:flex-1">{group.blurb}</p>
                )}
              </div>

              <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {gRows.map((r) => {
                  const meta = [
                    r.entry?.products.length ? r.entry.products.join(" · ") : null,
                    r.accounts ? `${r.accounts} account${r.accounts === 1 ? "" : "s"}` : null,
                    r.accountArr ? `${money(r.accountArr)} account ARR` : null,
                  ].filter(Boolean) as string[];
                  return (
                    <li key={r.option.id}>
                      <Link href={`${basePath}/${r.option.id}`}
                        className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-sirius/50 hover:bg-accent-soft/20">
                        <div className="flex items-start justify-between gap-2">
                          <span dir="auto" className="font-body text-[13.5px] font-semibold leading-snug text-fg">
                            {r.option.label}
                          </span>
                          {r.option.unresolved && (
                            <span title="Not selectable on a HubSpot deal"
                              className="shrink-0 whitespace-nowrap rounded-full border border-[#C99A14]/30 px-1.5 py-0.5 font-body text-[10.5px] text-[#8A6D12]">
                              Outside set
                            </span>
                          )}
                        </div>
                        <p dir="auto" className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                          {r.entry?.oneLiner || r.option.summary}
                        </p>
                        {meta.length > 0 && (
                          <p className="mt-auto pt-1 font-body text-[11.5px] text-fg-subtle">{meta.join("  ·  ")}</p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
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
