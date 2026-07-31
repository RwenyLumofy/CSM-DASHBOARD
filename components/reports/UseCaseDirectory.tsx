"use client";

/* =========================================================================
   Use Case Universe — the directory shell.

   Replaces the old two-pane workbench. Structure follows the reference the
   user picked (trail-ml.com/ai-use-cases): a compact hero, a persistent left
   rail of plain checkbox filters, then uniform cards. Almost no chrome above
   the content, because the point of the page is to scan the library.

   WHAT THIS FILE DOES NOT DO: editing. Every editable surface is the one that
   already existed and is already exercised —

     UseCaseDetail    per-section Edit / Save / Cancel over the whole
                      definition, via saveUseCaseSectionAction. Rendered here
                      inside a drawer instead of a right-hand pane; `embedded`
                      keeps it one implementation rather than two.
     TaxonomyManager  add / rename / archive a use case, add / rename / delete
                      a category, via saveUseCaseAction + saveCategoryAction.
     UseCaseTransfer  export / import a library between environments.

   What IS new here is account linking (LinkDialog). It calls the same
   saveImplementationAction the client profile uses, so a link made from the
   directory and one made from the account are the same record. Note the
   permission split: definitions gate on isAdminOrSuper, linking gates on
   denyClientWrite(clientId) — a CSM can put a use case on their own account
   without being able to rewrite what it means for everyone.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, X, ChevronDown, MoreHorizontal, Plus, ArrowRight, Pencil, Link2,
  SlidersHorizontal, PenLine, ArrowLeftRight, Loader2, Check,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCTS, type UseCaseEntry } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import {
  IMPL_STATUS_LABEL, IMPL_STATUS_TONE,
  type ImplementationStatus, type ImplementationWithAccount,
} from "@/lib/use-case-implementation";
import { UseCaseDetail } from "@/components/reports/UseCaseDetail";
import { TaxonomyManager } from "@/components/reports/TaxonomyManager";
import { UseCaseTransfer } from "@/components/reports/UseCaseTransfer";
import {
  saveImplementationAction, removeImplementationAction,
} from "@/app/(app)/clients/[id]/use-case-implementation-actions";

export interface DirectoryRow {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  /** "" when there is nothing worth saying — see lib/use-case-status.ts. */
  statusText: string;
  accounts: ImplementationWithAccount[];
}

/** Every account in scope. Feeds the link picker AND the adoption read-out —
 *  ImplementationWithAccount carries only id+name, so ARR and industry are
 *  looked up here rather than widening that type for one screen. */
export interface DirectoryClient {
  id: string; name: string; arr: number; industry: string;
}

type Group = { id: string; label: string; blurb: string };
type Sort = "clients" | "name" | "updated";

/* Group heading and option labels must not restate each other. "Client usage →
   Running somewhere / Not linked yet" said "client"/"linked" twice; under an
   "Adoption" heading the options only have to name the two states. */
const USAGE = [
  { id: "linked", label: "In use" },
  { id: "unlinked", label: "Not in use" },
] as const;

/** $205,110 → $205K, $1,240,000 → $1.2M. Compact enough for a card footer.
 *  The threshold is tested AFTER rounding: 999,500 rounds to 1000K, so a naive
 *  `n >= 1_000_000` check renders "$1000K" instead of "$1M". */
const money = (n: number) => {
  if (n < 1_000) return `$${n}`;
  if (Math.round(n / 1_000) < 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};

/* Deterministic per-name tint, so a client is the same colour on every render
   and between server and client. Math.random here would hydrate mismatched. */
const TINTS = [
  "bg-[#E8EDFB] text-[#3355C6]", "bg-[#FDECEC] text-[#B3403F]", "bg-[#E8F5EE] text-[#2F7D52]",
  "bg-[#FCF1E3] text-[#9A6420]", "bg-[#F0EAF9] text-[#6A46A8]", "bg-[#E4F2F5] text-[#25707E]",
];
const tint = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
};
const initials = (name: string) =>
  name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] ?? "").join("").toUpperCase() || "?";

/* The card blurb. Prefers the one-liner — that field exists to be the short
   form — and falls back to the first sentence of the problem so no card is
   ever blank. */
const gist = (r: DirectoryRow) => {
  const p = r.entry?.oneLiner || r.entry?.customerProblem || r.option.summary || "";
  const stop = p.indexOf(". ");
  return stop > 40 ? p.slice(0, stop + 1) : p;
};

/* The "meaningful direction" read: is adoption concentrated in one industry?
   Only worth saying above two clients — "1 of 1 are banks" is noise — and only
   on a real majority. */
function concentration(industries: string[]): string | null {
  if (industries.length < 2) return null;
  const tally = new Map<string, number>();
  for (const i of industries) if (i) tally.set(i, (tally.get(i) ?? 0) + 1);
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
  if (!top || top[1] < 2 || top[1] / industries.length < 0.5) return null;
  return top[1] === industries.length
    ? `All ${industries.length} are ${top[0]}`
    : `${top[1]} of ${industries.length} are ${top[0]}`;
}

export function UseCaseDirectory({
  rows, groups, allEntries, canEdit, today, clients, basePath = "/use-cases",
}: {
  rows: DirectoryRow[];
  groups: Group[];
  /** Includes retired entries — TaxonomyManager shows what can be restored. */
  allEntries: ResolvedUseCase[];
  canEdit: boolean;
  today: string;
  clients: DirectoryClient[];
  basePath?: string;
}) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [prods, setProds] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<Set<string>>(new Set());
  /* Most-used by default, not A–Z: "what is actually landing" is the question
     this page exists to answer, and alphabetical buries it. */
  const [sort, setSort] = useState<Sort>("clients");
  const [sel, setSel] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const label = useMemo(() => {
    const m = new Map(groups.map((g) => [g.id, g.label]));
    return (id: string) => m.get(id) ?? id;
  }, [groups]);

  const clientMeta = useMemo(
    () => new Map(clients.map((c) => [c.id, c])), [clients],
  );

  const toggle = (set: Set<string>, id: string, put: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); put(n);
  };

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (query) {
        const hay = `${r.option.label} ${r.entry?.oneLiner ?? ""} ${r.entry?.customerProblem ?? ""}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (cats.size && !r.option.groups.some((g) => cats.has(g))) return false;
      if (prods.size && !(r.entry?.products ?? []).some((p) => prods.has(p))) return false;
      /* Both boxes ticked means "either", which is everything — same as none
         ticked. Left as-is: a group where ticking every box narrows nothing is
         what people expect. */
      if (usage.size === 1) {
        if (usage.has("linked") !== r.accounts.length > 0) return false;
      }
      return true;
    });
    return out.sort((a, b) =>
      sort === "clients" ? b.accounts.length - a.accounts.length || a.option.label.localeCompare(b.option.label)
        : sort === "updated" ? (b.entry?.updatedAt ?? "").localeCompare(a.entry?.updatedAt ?? "") || a.option.label.localeCompare(b.option.label)
          : a.option.label.localeCompare(b.option.label));
  }, [rows, q, cats, prods, usage, sort]);

  const activeCount = cats.size + prods.size + usage.size + (q.trim() ? 1 : 0);
  const clearAll = () => { setCats(new Set()); setProds(new Set()); setUsage(new Set()); setQ(""); };

  const selected = sel ? rows.find((r) => r.option.id === sel) ?? null : null;
  const linkingRow = linking ? rows.find((r) => r.option.id === linking) ?? null : null;

  if (managing) {
    return <TaxonomyManager entries={allEntries} groups={groups} onClose={() => setManaging(false)} />;
  }
  if (transferring) return <UseCaseTransfer onClose={() => setTransferring(false)} />;

  return (
    <>
      {/* ---- Hero. One title, one line, one search box. ---- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[560px]">
          <h1 className="h2">Use Case Universe</h1>
          <p className="mt-1.5 font-body text-[13.5px] leading-relaxed text-fg-muted">
            Every use case Lumofy delivers, and which clients are running it.
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => setManaging(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-sirius/90">
              <Plus size={15} /> Add use case
            </button>
            <Menu trigger={<MoreHorizontal size={16} />} label="Library actions">
              <MenuItem icon={<SlidersHorizontal size={14} />} label="Manage categories" onClick={() => setManaging(true)} />
              <MenuLink icon={<PenLine size={14} />} label="Write across library" href={`${basePath}/write`} />
              <MenuItem icon={<ArrowLeftRight size={14} />} label="Export / import" onClick={() => setTransferring(true)} />
            </Menu>
          </div>
        )}
      </div>

      <div className="relative max-w-[460px]">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search use cases…"
          className="w-full rounded-lg border border-border bg-bg py-2.5 pl-9 pr-9 font-body text-[13.5px] text-fg placeholder:text-fg-subtle focus:border-sirius focus:outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex items-start gap-9 border-t border-border-subtle pt-6">
        {/* ---- Left rail. Plain checkboxes, always visible. ---- */}
        <aside className="sticky top-6 hidden w-[196px] shrink-0 lg:block">
          <FilterGroup title="Category" options={groups.map((g) => ({ id: g.id, label: g.label }))}
            selected={cats} onToggle={(id) => toggle(cats, id, setCats)} />
          <FilterGroup title="Product" options={PRODUCTS.map((p) => ({ id: p, label: p }))}
            selected={prods} onToggle={(id) => toggle(prods, id, setProds)} />
          <FilterGroup title="Adoption" options={USAGE.map((u) => ({ id: u.id, label: u.label }))}
            selected={usage} onToggle={(id) => toggle(usage, id, setUsage)} />
          <button onClick={clearAll} disabled={!activeCount}
            className="mt-2 w-full rounded-lg border border-border bg-surface py-2 font-body text-[12.5px] font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:pointer-events-none disabled:opacity-40">
            Clear all
          </button>
        </aside>

        {/* ---- Results ---- */}
        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
            <p className="font-body text-[14px] text-fg">
              <span className="font-semibold">{shown.length}</span>
              <span className="text-fg-muted"> {shown.length === 1 ? "use case" : "use cases"}</span>
              {activeCount > 0 && <span className="text-fg-subtle"> of {rows.length}</span>}
            </p>
            <label className="flex items-center gap-2 font-body text-[12.5px] text-fg-muted">
              Sort by
              <span className="relative">
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                  className="appearance-none rounded-lg border border-border bg-surface py-1.5 pl-3 pr-8 font-body text-[12.5px] font-medium text-fg focus:border-sirius focus:outline-none">
                  <option value="clients">Most used</option>
                  <option value="name">A to Z</option>
                  <option value="updated">Recently updated</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              </span>
            </label>
          </div>

          {shown.length === 0 ? (
            <div className="mt-10 text-center">
              <p className="font-body text-[14px] text-fg-muted">
                {rows.length === 0 ? "The library is empty." : "No use case matches these filters."}
              </p>
              {rows.length === 0
                ? canEdit && (
                  <button onClick={() => setManaging(true)} className="mt-2 font-body text-[13px] font-semibold text-sirius hover:underline">
                    Add the first use case
                  </button>
                )
                : <button onClick={clearAll} className="mt-2 font-body text-[13px] font-semibold text-sirius hover:underline">Clear all</button>}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {shown.map((r) => (
                <Card key={r.option.id} row={r} label={label} canEdit={canEdit} meta={clientMeta}
                  onOpen={() => setSel(r.option.id)} onLink={() => setLinking(r.option.id)} />
              ))}
            </div>
          )}
        </main>
      </div>

      {selected && (
        <DetailDrawer onClose={() => setSel(null)}>
          <UseCaseDetail
            key={selected.option.id}
            embedded
            option={selected.option}
            entry={selected.entry}
            allEntries={allEntries}
            groups={groups}
            canEdit={canEdit}
            accounts={selected.accounts}
            today={today}
            basePath={basePath}
          />
        </DetailDrawer>
      )}

      {linkingRow && (
        <LinkDialog row={linkingRow} clients={clients} onClose={() => setLinking(null)} />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- filters -- */

function FilterGroup({ title, options, selected, onToggle }: {
  title: string; options: { id: string; label: string }[];
  selected: Set<string>; onToggle: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="mb-6">
      <legend className="mb-2.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.09em] text-fg-subtle">
        {title}
      </legend>
      <div className="flex flex-col gap-0.5">
        {options.map((o) => {
          const on = selected.has(o.id);
          return (
            <label key={o.id} className="flex cursor-pointer items-start gap-2.5 rounded-md py-1 pl-0.5 pr-1 hover:bg-bg-muted">
              <input type="checkbox" checked={on} onChange={() => onToggle(o.id)}
                className="mt-[3px] size-[15px] shrink-0 cursor-pointer accent-[#3355C6]" />
              <span className={cn("font-body text-[13px] leading-[1.35]", on ? "font-medium text-fg" : "text-fg-muted")}>
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ card -- */

function Card({ row, label, canEdit, meta, onOpen, onLink }: {
  row: DirectoryRow; label: (id: string) => string; canEdit: boolean;
  meta: Map<string, DirectoryClient>; onOpen: () => void; onLink: () => void;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border-subtle bg-surface p-5 transition hover:border-sirius/40 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-body text-[11px] font-semibold text-sirius">
          {row.option.groups.length ? label(row.option.groups[0]) : "Uncategorised"}
        </span>
        {canEdit && (
          <Menu trigger={<MoreHorizontal size={16} />} label={`Actions for ${row.option.label}`} subtle>
            <MenuItem icon={<Pencil size={14} />} label="Edit definition" onClick={onOpen} />
            <MenuItem icon={<Link2 size={14} />} label="Link to a client…" onClick={onLink} />
          </Menu>
        )}
      </div>

      <h3 dir="auto" className="mt-3 font-display text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-fg">
        {row.option.label}
      </h3>
      <p dir="auto" className="mt-1.5 line-clamp-3 font-body text-[13px] leading-relaxed text-fg-muted">
        {gist(row)}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3.5">
        <ClientStack accounts={row.accounts} meta={meta} />
        <button onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-1 font-body text-[12.5px] font-semibold text-sirius hover:underline">
          View details <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}

/* Overlapping initials, a count and the ARR behind it. "Who is running this"
   is the directory's whole point, so it belongs on the card. */
function ClientStack({ accounts, meta }: {
  accounts: ImplementationWithAccount[]; meta: Map<string, DirectoryClient>;
}) {
  if (accounts.length === 0) {
    return <span className="font-body text-[12px] text-fg-subtle">No clients yet</span>;
  }
  const arr = accounts.reduce((s, a) => s + (meta.get(a.account.id)?.arr ?? 0), 0);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 -space-x-1.5">
        {accounts.slice(0, 3).map((a) => (
          <span key={a.account.id} title={a.account.name}
            className={cn("grid size-[22px] place-items-center rounded-full border-2 border-surface font-body text-[9.5px] font-bold", tint(a.account.name))}>
            {initials(a.account.name)}
          </span>
        ))}
        {accounts.length > 3 && (
          <span className="grid size-[22px] place-items-center rounded-full border-2 border-surface bg-bg-muted font-body text-[9.5px] font-bold text-fg-muted">
            +{accounts.length - 3}
          </span>
        )}
      </div>
      <span className="truncate font-body text-[12px] text-fg-muted">
        {accounts.length} {accounts.length === 1 ? "client" : "clients"}
        {arr > 0 && <span className="text-fg-subtle"> · {money(arr)}</span>}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- drawer -- */

function DetailDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="pm-slide-in relative flex h-full w-full flex-col overflow-y-auto bg-surface p-6 shadow-2xl sm:w-[620px]">
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-md bg-surface text-fg-muted hover:bg-bg-muted hover:text-fg">
          <X size={17} />
        </button>
        {children}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ link dialog -- */

/* The operational half: put a use case on a client from the directory, rather
   than only the other way round from each profile. Writes through the SAME
   action the client page uses, so there is one record and one permission
   check. A bare link is created with no objective/scope — those are per-account
   and are filled in on the profile, which the footer says. */
function LinkDialog({ row, clients, onClose }: {
  row: DirectoryRow; clients: DirectoryClient[]; onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Optimistic local view of the links, so a tick responds immediately and the
     dialog does not have to wait for a server round-trip plus a refresh. Seeded
     from the server data, then reconciled by router.refresh() on close. */
  const [linked, setLinked] = useState<Map<string, string>>(
    () => new Map(row.accounts.map((a) => [a.account.id, a.implementation.id])),
  );

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return clients.filter((c) => !query || c.name.toLowerCase().includes(query));
  }, [clients, q]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });

  function close() { router.refresh(); onClose(); }

  async function toggle(client: DirectoryClient) {
    if (busy) return;
    setBusy(client.id); setError(null);
    const existing = linked.get(client.id);
    const res = existing
      ? await removeImplementationAction(client.id, existing)
      : await saveImplementationAction(client.id, { useCaseId: row.option.id });
    setBusy(null);
    if (!res.ok) { setError(res.error ?? "That didn't save."); return; }
    setLinked((prev) => {
      const next = new Map(prev);
      if (existing) next.delete(client.id);
      else if (res.implementation) next.set(client.id, res.implementation.id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/35" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label={`Link ${row.option.label} to clients`}
        className="relative flex max-h-[80vh] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-fg">Link to clients</h2>
            <p dir="auto" className="mt-0.5 truncate font-body text-[12.5px] text-fg-muted">{row.option.label}</p>
          </div>
          <button onClick={close} aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border-subtle px-5 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
              className="w-full rounded-lg border border-border bg-bg py-2 pl-8 pr-3 font-body text-[13px] text-fg placeholder:text-fg-subtle focus:border-sirius focus:outline-none" />
          </div>
        </div>

        {error && (
          <p role="alert" className="border-b border-border-subtle bg-danger-soft px-5 py-2 font-body text-[12px] text-danger">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
          {shown.length === 0
            ? <p className="px-2.5 py-6 text-center font-body text-[12.5px] text-fg-subtle">No client matches.</p>
            : shown.map((c) => {
              const on = linked.has(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c)} disabled={!!busy}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-bg-muted disabled:opacity-60">
                  <span className={cn("grid size-[15px] shrink-0 place-items-center rounded border",
                    on ? "border-sirius bg-sirius text-white" : "border-border")}>
                    {busy === c.id ? <Loader2 size={10} className="animate-spin" /> : on ? <Check size={11} /> : null}
                  </span>
                  <span className={cn("grid size-[24px] shrink-0 place-items-center rounded-full font-body text-[10px] font-bold", tint(c.name))}>
                    {initials(c.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate font-body text-[13px] text-fg">{c.name}</span>
                    {c.industry && <span className="block truncate font-body text-[11px] text-fg-subtle">{c.industry}</span>}
                  </span>
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3">
          <p className="font-body text-[11px] text-fg-subtle">
            Objective and scope are set on the client profile.
          </p>
          <button onClick={close}
            className="rounded-lg bg-sirius px-3.5 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-sirius/90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ menu -- */

function Menu({ trigger, children, label, subtle }: {
  trigger: React.ReactNode; children: React.ReactNode; label: string; subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label={label} aria-expanded={open}
        className={cn("grid place-items-center rounded-lg",
          subtle
            ? "size-[26px] text-fg-subtle hover:bg-bg-muted hover:text-fg"
            : "size-[34px] border border-border bg-surface text-fg-muted hover:border-sirius hover:text-sirius")}>
        {trigger}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

const ITEM = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left font-body text-[12.5px] text-fg hover:bg-bg-muted";

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={ITEM}>
      <span className="shrink-0 text-fg-subtle">{icon}</span>{label}
    </button>
  );
}

function MenuLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link href={href} className={ITEM}>
      <span className="shrink-0 text-fg-subtle">{icon}</span>{label}
    </Link>
  );
}
