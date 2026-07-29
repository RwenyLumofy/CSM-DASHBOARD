"use client";

/* The Use Case Library — discovery and management.

   Replaces a permanently expanded 28-item sidebar next to a mostly empty
   canvas. That layout gave every use case identical prominence, truncated the
   long names, made categories impossible to compare, and spent the whole right
   half of the viewport on one selected entry that usually had nothing in it.

   This page does one job — find, compare and maintain — and hands the detail to
   its own route, so a use case can be linked, refreshed and navigated back to.

   The default is a DENSE LIST, not a card grid. Cards gave each entry ~180px
   of chrome and fitted six on screen; the list fits the whole taxonomy at once,
   which is what makes 28 things comparable. The answer to "there isn't enough
   detail on a card" is not a bigger card — it is a list you can scan and a
   detail you can reach instantly. Rows are grouped by category with counts, so
   the shape of the taxonomy reads without opening anything.

   Keyboard: "/" focuses search, up/down moves, Enter opens. A list this dense
   is only pleasant if you never have to reach for the mouse.

   The table stays for administration, where you want every column at once.

   ARR IS LABELLED ACCOUNT ARR. It is the sum of client.arr for accounts carrying
   the use case — the whole contract value of those accounts, not revenue this
   use case produced. Nothing in the data supports attribution, so the page must
   not imply it. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, LayoutGrid, Table as TableIcon, X, Plus, SlidersHorizontal, ChevronRight, PenLine,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AdoptionSummary } from "@/lib/use-case-adoption";
import type { UseCaseEntry } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import {
  STATUS_LABEL, STATUS_TONE, STATUS_HELP, statusLine,
  LIFECYCLE_STATUSES, type LifecycleStatus,
} from "@/lib/use-case-status";

const VIEW_KEY = "use-case-library-view";

/** Account ARR — the contract value of accounts carrying this use case. Never
 *  described as revenue the use case generated. */
const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

export interface LibraryRow {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  status: LifecycleStatus;
  /** Precomputed "Draft · Needs review" — the review half is derived server-side. */
  statusText: string;
  accounts: number;
  accountArr: number;
}

function StatusChip({ status, text }: { status: LifecycleStatus; text: string }) {
  return (
    <span title={STATUS_HELP[status]}
      className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", STATUS_TONE[status])}>
      {text}
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

export function UseCaseLibrary({ rows, groups, canEdit, adoption, basePath = "/use-cases" }: {
  rows: LibraryRow[];
  groups: { id: string; label: string; blurb: string }[];
  canEdit: boolean;
  adoption: AdoptionSummary;
  /** Where a row links. Overridden only by the dev preview harness. */
  basePath?: string;
}) {
  const [view, setView] = useState<"list" | "table">("list");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<LifecycleStatus | null>(null);
  const [adoptionFilter, setAdoptionFilter] = useState<"active" | "none" | null>(null);

  // Restore the preferred view. Read after mount so the server and first client
  // render agree — reading localStorage during render hydrates mismatched.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(VIEW_KEY) : null;
    if (saved === "table" || saved === "list") setView(saved);
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
      return `${r.option.label} ${r.option.summary} ${r.entry?.oneLiner ?? ""} ${r.entry?.customerProblem ?? ""} ${(r.entry?.clientPhrases ?? []).join(" ")}`
        .toLowerCase().includes(q);
    });
  }, [rows, query, category, status, adoptionFilter]);

  const activeFilters = [category, status, adoptionFilter, query.trim()].filter(Boolean).length;
  const clearAll = () => { setCategory(null); setStatus(null); setAdoptionFilter(null); setQuery(""); };

  /** Grouped by category, the way Linear groups by status — the group header
   *  carries the count so the distribution reads without expanding anything.
   *  A cross-listed use case appears under each of its categories, which is
   *  correct: that is what cross-listing means. */
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

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /** Flat order for keyboard movement, matching what is on screen. */
  const flat = useMemo(
    () => grouped.flatMap((g) => (collapsed.has(g.group.id) ? [] : g.rows)), [grouped, collapsed]);

  useEffect(() => { setCursor(0); }, [query, category, status, adoptionFilter]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT";
      if (e.key === "/" && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (typing && e.key !== "Escape") return;
      if (e.key === "Escape") { (e.target as HTMLElement)?.blur?.(); return; }
      if (view !== "list" || flat.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && flat[cursor]) router.push(`${basePath}/${flat[cursor].option.id}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, cursor, view, router, basePath]);

  const counts = useMemo(() => ({
    total: rows.length,
    published: rows.filter((r) => r.status === "published").length,
    needsWriting: rows.filter((r) => !r.entry).length,
    active: rows.filter((r) => r.accounts > 0).length,
  }), [rows]);

  return (
    <div className="flex flex-col gap-5">
      {/* ── summary strip, inline rather than metric cards ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <p className="font-body text-[13px] text-fg-muted">
          <span className="tabular font-semibold text-fg">{counts.total}</span> use cases ·{" "}
          <span className="tabular font-semibold text-fg">{groups.length}</span> categories ·{" "}
          <span className="tabular font-semibold text-fg">{counts.published}</span> published ·{" "}
          <span className="tabular font-semibold text-fg">{counts.needsWriting}</span> not written ·{" "}
          <span className="tabular font-semibold text-fg">{counts.active}</span> active on accounts
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Sits first because it is the work actually outstanding: filling
                the definitions, not adding more empty ones. */}
            <Link href={`${basePath}/write`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <PenLine size={13} /> Write definitions
              {counts.needsWriting > 0 && <span className="tabular text-fg-subtle">{counts.needsWriting}</span>}
            </Link>
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
            ref={searchRef}
            placeholder="Search — including what a client would say…    /"
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
          <select value={status ?? ""} onChange={(e) => setStatus((e.target.value || null) as LifecycleStatus | null)}
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none focus:border-sirius">
            <option value="">Any status</option>
            {LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>

        <div role="tablist" aria-label="View" className="ml-auto flex rounded-lg border border-border p-0.5">
          {([["list", LayoutGrid, "List"], ["table", TableIcon, "Table"]] as const).map(([k, Icon, label]) => (
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
      ) : view === "list" ? (
        <div className="flex flex-col">
          {grouped.map(({ group, rows: gRows }) => {
            const shut = collapsed.has(group.id);
            return (
              <section key={group.id}>
                {/* Group header carries the count — the distribution reads
                    without expanding anything. */}
                <button
                  onClick={() => setCollapsed((prev) => {
                    const next = new Set(prev);
                    next.has(group.id) ? next.delete(group.id) : next.add(group.id);
                    return next;
                  })}
                  aria-expanded={!shut}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border-subtle bg-canvas/95 py-2 text-left backdrop-blur">
                  <ChevronRight size={12} aria-hidden
                    className={cn("shrink-0 text-fg-subtle transition-transform", !shut && "rotate-90")} />
                  <span className="font-body text-[11.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                    {group.label}
                  </span>
                  <span className="tabular font-body text-[11.5px] text-fg-subtle">{gRows.length}</span>
                </button>

                {!shut && gRows.map((r) => {
                  const i = flat.findIndex((f) => f.option.id === r.option.id);
                  const active = i === cursor;
                  return (
                    <Link key={r.option.id} href={`${basePath}/${r.option.id}`} onMouseEnter={() => setCursor(i)}
                      className={cn(
                        "group flex items-center gap-3 border-b border-border-subtle px-2 py-2 transition-colors",
                        active ? "bg-accent-soft/50" : "hover:bg-bg-muted/50",
                      )}>
                      <span dir="auto" className="min-w-0 shrink-0 max-w-[42%] truncate font-body text-[13.5px] font-medium text-fg">
                        {r.option.label}
                      </span>
                      <span dir="auto" className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg-subtle">
                        {r.entry?.oneLiner || r.option.summary}
                      </span>

                      {/* Metadata right-aligned in fixed slots so the columns
                          line up down the whole list, Linear-style. */}
                      {r.option.unresolved && (
                        <span className="hidden shrink-0 whitespace-nowrap font-body text-[11px] text-[#8A6D12] lg:inline">
                          Outside set
                        </span>
                      )}
                      <span className="hidden w-[92px] shrink-0 text-right font-body text-[11.5px] text-fg-subtle sm:inline">
                        {r.entry?.products.length ? r.entry.products.join(" · ") : ""}
                      </span>
                      <span className="tabular hidden w-[74px] shrink-0 text-right font-body text-[12px] text-fg-muted md:inline">
                        {r.accounts ? `${r.accounts} acct${r.accounts === 1 ? "" : "s"}` : ""}
                      </span>
                      <span className="tabular hidden w-[64px] shrink-0 text-right font-body text-[12px] text-fg-muted lg:inline">
                        {r.accountArr ? money(r.accountArr) : ""}
                      </span>
                      <span className="w-[132px] shrink-0 text-right"><StatusChip status={r.status} text={r.statusText} /></span>
                    </Link>
                  );
                })}
              </section>
            );
          })}
          <p className="mt-3 font-body text-[11.5px] text-fg-subtle">
            <kbd className="rounded border border-border px-1">/</kbd> search ·{" "}
            <kbd className="rounded border border-border px-1">↑</kbd>
            <kbd className="rounded border border-border px-1">↓</kbd> move ·{" "}
            <kbd className="rounded border border-border px-1">↵</kbd> open
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] border-collapse">
            <caption className="sr-only">Use cases with definition status, adoption and account ARR</caption>
            <thead>
              <tr className="border-b border-border bg-bg-muted/40 text-left">
                {["Use case", "Category", "Status", "Accounts", "Associated ARR", "Products", "Outside set"].map((h) => (
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
                    <Link href={`${basePath}/${r.option.id}`} dir="auto"
                      className="font-body text-[13px] font-semibold text-fg hover:text-sirius">
                      {r.option.label}
                    </Link>
                    <span className="block max-w-[38ch] truncate font-body text-[11.5px] text-fg-subtle">
                      {r.entry?.oneLiner || r.option.summary}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">
                    {r.option.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-3 py-2.5"><StatusChip status={r.status} text={r.statusText} /></td>
                  <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg">{r.accounts || "—"}</td>
                  <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg">{r.accountArr ? money(r.accountArr) : "—"}</td>
                  <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{r.entry?.products.join(" · ") || "—"}</td>
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
