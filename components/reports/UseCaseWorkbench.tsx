"use client";

/* The Use Case Library — an index you can read and a definition you can edit,
   side by side.

   WHY A WORKBENCH AND NOT A LIST-THEN-PAGE. The job here is comparing and
   maintaining 28 definitions, and both suffer when the index disappears the
   moment you open something. Selecting is instant, the index stays put, and a
   related use case is one click away from the entry that names it — which is
   what makes "how does this differ from that?" answerable at all.

   THE PANE IS THE WHOLE PAGE, INCLUDING EDITING. It renders UseCaseDetail, the
   same component the /use-cases/[id] route renders. There is exactly one
   implementation of section editing, so a fix or a new field lands in both
   places at once, and a link someone pasted into a QBR deck still opens.

   THE SIDEBAR CARRIES THE PROBLEM, NOT JUST THE NAME. Twenty-eight titles look
   alike; "Roles and expectations are inconsistent or outdated" does not. That
   line is what makes the index scannable rather than merely complete. Compact
   mode drops it for when you already know what you want.

   ADDING AND REMOVING lives in TaxonomyManager, opened from here. Editing what
   a use case MEANS is a writing job; changing what exists is a governance one,
   and a taxonomy drifts when the two are the same button. Retire never
   deletes — accounts are recorded against ids. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Circle, ChevronRight, ChevronDown, Plus, SlidersHorizontal, PenLine,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { UseCaseEntry } from "@/lib/use-case-library";
import type { ResolvedUseCase, TaxonomyOverlay } from "@/lib/use-case-overlay";
import type { AccountRef } from "@/lib/use-case-adoption";
import { UseCaseDetail } from "@/components/reports/UseCaseDetail";
import { TaxonomyManager } from "@/components/reports/TaxonomyManager";
import type { ImplementationRow } from "@/components/reports/UseCaseAccounts";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

export interface WorkbenchRow {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  /** "" when there is nothing worth saying — see lib/use-case-status.ts. */
  statusText: string;
  confirmed: AccountRef[];
  declaredOnly: AccountRef[];
  accountArr: number;
  implementations: ImplementationRow[];
}

type Group = { id: string; label: string; blurb: string };
type Filter = "all" | "on" | "off" | "gaps";

/** The customer problem, trimmed to its first sentence. */
function problemGist(r: WorkbenchRow): string {
  const p = r.entry?.customerProblem ?? "";
  if (!p) return r.entry?.oneLiner || r.option.summary;
  const stop = p.indexOf(". ");
  return stop > 40 ? p.slice(0, stop + 1) : p;
}

export function UseCaseWorkbench({
  rows, groups, allEntries, overlay, canEdit, today, basePath = "/use-cases",
}: {
  rows: WorkbenchRow[];
  groups: Group[];
  /** Includes retired entries — TaxonomyManager has to show what can be restored. */
  allEntries: ResolvedUseCase[];
  overlay: TaxonomyOverlay;
  canEdit: boolean;
  today: string;
  basePath?: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [dense, setDense] = useState<"detailed" | "compact">("detailed");
  const [managing, setManaging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const live = useMemo(() => rows.filter((r) => r.entry?.status !== "archived"), [rows]);

  const grouped = useMemo(() => {
    const query = q.trim().toLowerCase();
    const matches = (r: WorkbenchRow) => {
      if (query && !`${r.option.label} ${r.entry?.oneLiner ?? ""} ${r.entry?.customerProblem ?? ""} ${(r.entry?.clientPhrases ?? []).join(" ")}`
        .toLowerCase().includes(query)) return false;
      const n = r.confirmed.length + r.declaredOnly.length;
      if (filter === "on") return n > 0;
      if (filter === "off") return n === 0;
      if (filter === "gaps") return !!r.statusText || !r.entry?.ownerEmail;
      return true;
    };
    const pool = live.filter(matches);
    const out = groups
      .map((g) => ({ group: g, rows: pool.filter((r) => (r.option.groups as string[]).includes(g.id)) }))
      .filter((s) => s.rows.length > 0);
    const filed = new Set(out.flatMap((s) => s.rows.map((r) => r.option.id)));
    const orphans = pool.filter((r) => !filed.has(r.option.id));
    return orphans.length
      ? [...out, { group: { id: "__none", label: "Uncategorised", blurb: "" }, rows: orphans }]
      : out;
  }, [live, groups, q, filter]);

  const flat = useMemo(
    () => grouped.flatMap((g) => (shut.has(g.group.id) ? [] : g.rows)), [grouped, shut]);
  const current = flat.find((r) => r.option.id === sel) ?? flat[0];

  const onCount = live.filter((r) => r.confirmed.length + r.declaredOnly.length > 0).length;
  const gapCount = live.filter((r) => r.statusText || !r.entry?.ownerEmail).length;

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = (ev.target as HTMLElement)?.tagName;
      if (ev.key === "/" && t !== "INPUT" && t !== "TEXTAREA" && t !== "SELECT") {
        ev.preventDefault(); searchRef.current?.focus(); return;
      }
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") {
        if (ev.key === "Escape") (ev.target as HTMLElement).blur();
        return;
      }
      if (!flat.length) return;
      const i = flat.findIndex((r) => r.option.id === current?.option.id);
      if (ev.key === "ArrowDown" || ev.key === "j") { ev.preventDefault(); setSel(flat[Math.min(i + 1, flat.length - 1)].option.id); }
      if (ev.key === "ArrowUp" || ev.key === "k") { ev.preventDefault(); setSel(flat[Math.max(i - 1, 0)].option.id); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, current]);

  // Keep the selected row in view when the arrows move past the fold.
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { selRef.current?.scrollIntoView({ block: "nearest" }); }, [current?.option.id]);

  if (managing) {
    return (
      <TaxonomyManager entries={allEntries} groups={groups} overlay={overlay}
        onClose={() => setManaging(false)} />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* ── index ───────────────────────────────────────────────── */}
      <div className="flex max-h-[82vh] flex-col gap-2.5 overflow-hidden rounded-xl border border-border bg-surface p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-body text-[11.5px] text-fg-subtle">
            <span className="tabular font-semibold text-fg">{onCount}</span> of{" "}
            <span className="tabular">{live.length}</span> on accounts
            {gapCount > 0 && <> · <span className="tabular text-[#8A6D12]">{gapCount}</span> need attention</>}
          </p>
          <button onClick={() => setDense((d) => (d === "detailed" ? "compact" : "detailed"))}
            className="font-body text-[11px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
            {dense === "detailed" ? "Compact" : "Detailed"}
          </button>
        </div>

        <label className="relative flex items-center">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
          <span className="sr-only">Search use cases</span>
          <input ref={searchRef} value={q} onChange={(ev) => setQ(ev.target.value)}
            placeholder="Search a problem…    /"
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-7 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search"
              className="absolute right-2 text-fg-subtle hover:text-fg"><X size={12} /></button>
          )}
        </label>

        <div className="flex gap-1">
          {([["all", "All"], ["on", "On accounts"], ["off", "Not used"], ["gaps", "Needs work"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("flex-1 rounded-md border px-1 py-1 font-body text-[11px] font-medium transition-colors",
                filter === k ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
              {l}
            </button>
          ))}
        </div>

        <div className="-mr-1 flex-1 overflow-y-auto pr-1">
          {grouped.map(({ group, rows: gRows }) => {
            const closed = shut.has(group.id);
            return (
              <section key={group.id}>
                <button
                  onClick={() => setShut((p) => {
                    const n = new Set(p); n.has(group.id) ? n.delete(group.id) : n.add(group.id); return n;
                  })}
                  aria-expanded={!closed}
                  className="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-surface/95 py-1.5 text-left backdrop-blur">
                  {closed ? <ChevronRight size={11} className="shrink-0 text-fg-subtle" />
                          : <ChevronDown size={11} className="shrink-0 text-fg-subtle" />}
                  <span className="flex-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                    {group.label}
                  </span>
                  <span className="tabular font-body text-[10.5px] text-fg-subtle">{gRows.length}</span>
                </button>
                {!closed && gRows.map((r) => {
                  const on = current?.option.id === r.option.id;
                  const n = r.confirmed.length + r.declaredOnly.length;
                  return (
                    <button key={r.option.id} ref={on ? selRef : undefined} onClick={() => setSel(r.option.id)}
                      className={cn("flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                        on ? "bg-accent-soft" : "hover:bg-bg-muted/70")}>
                      {/* A dot, not a word: 28 rows each labelled "Needs review"
                          is the noise we just removed from everywhere else. */}
                      <Circle size={5} aria-label={r.statusText || undefined}
                        className={cn("mt-[6px] shrink-0",
                          r.statusText ? "fill-[#C99A14] text-[#C99A14]" : "fill-transparent text-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className={cn("block font-body text-[12.5px] leading-snug",
                          on ? "font-semibold text-sirius" : "text-fg")}>
                          {r.option.label}
                        </span>
                        {/* No `block` on the clamped line: line-clamp sets display
                            to -webkit-box and a display utility alongside it wins
                            by stylesheet order, silently unclamping it. */}
                        {dense === "detailed" && (
                          <span dir="auto" className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-snug text-fg-subtle">
                            {problemGist(r)}
                          </span>
                        )}
                      </span>
                      {n > 0 && (
                        <span className="shrink-0 text-right">
                          <span className="tabular block font-body text-[11px] font-medium text-fg-muted">{n}</span>
                          {dense === "detailed" && r.accountArr > 0 && (
                            <span className="tabular block font-body text-[10px] text-fg-subtle">{money(r.accountArr)}</span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            );
          })}
          {flat.length === 0 && (
            <p className="px-2 py-8 text-center font-body text-[12px] text-fg-subtle">
              Nothing matches.{" "}
              <button onClick={() => { setQ(""); setFilter("all"); }}
                className="underline decoration-dotted underline-offset-2 hover:text-sirius">Clear</button>
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-2.5">
            <button onClick={() => setManaging(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-2.5 py-1.5 font-body text-[12px] font-semibold text-white">
              <Plus size={12} /> Add use case
            </button>
            <button onClick={() => setManaging(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <SlidersHorizontal size={12} /> Manage
            </button>
            <Link href={`${basePath}/write`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <PenLine size={12} /> Write
            </Link>
          </div>
        )}

        <p className="font-body text-[10.5px] text-fg-subtle">
          <kbd className="rounded border border-border px-1">/</kbd> search ·{" "}
          <kbd className="rounded border border-border px-1">↑</kbd>
          <kbd className="rounded border border-border px-1">↓</kbd> move ·{" "}
          <span className="inline-flex items-center gap-1"><Circle size={5} className="fill-[#C99A14] text-[#C99A14]" /> needs review</span>
        </p>
      </div>

      {/* ── the definition, editable ────────────────────────────── */}
      <div className="max-h-[82vh] overflow-y-auto rounded-xl border border-border bg-surface p-6">
        {current ? (
          <UseCaseDetail
            key={current.option.id}
            embedded
            option={current.option}
            entry={current.entry}
            allEntries={allEntries}
            groups={groups}
            canEdit={canEdit}
            confirmed={current.confirmed}
            declaredOnly={current.declaredOnly}
            implementations={current.implementations}
            today={today}
            basePath={basePath}
          />
        ) : (
          <p className="py-16 text-center font-body text-[13px] text-fg-subtle">
            Nothing selected.
          </p>
        )}
      </div>
    </div>
  );
}
