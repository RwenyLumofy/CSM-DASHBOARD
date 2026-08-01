"use client";

/* Which use cases this account has been associated with, and the
   account-specific objective/scope/status for each — the "associate" flow,
   moved here from the Use Case Universe. The Universe is a pure, preset-free
   database of definitions with no accounts awareness at all; account linkage
   lives only here, on the client page.

   THE ONLY "use cases" BLOCK ON THIS PAGE. The older, separate concept this
   page used to also show — a CS-confirmed-vs-sales-declared picker over a
   shipped list, fed by HubSpot deal data (components/clients/AccountUseCases.tsx,
   lib/use-cases.ts) — is no longer rendered here. That component and its data
   model are untouched and still work; they're just not shown on this page
   anymore, per an explicit call to keep one use-case block here rather than
   two unrelated ones. This card owns "Use cases" alone now.

   TWO LEVELS OF EDIT, mirroring what the Universe's old Associate tab did —
   just inverted from "list accounts for one use case" to "list use cases for
   one account":
     Choose use cases   a checkbox picker over every live (non-retired) entry
                        in the database. Toggling one on/off immediately
                        creates or removes a bare association.
     Per-use-case Edit  the account-specific objective, scope, status,
                        stakeholder, target date and notes.

   NO "next step" FIELD. It was a text box that couldn't be assigned, dated or
   completed, and it duplicated — weakly — what Tasks now does properly against
   the same account (AccountTasks → today_tasks → Today board). The value is
   still carried on the record so nothing already written is destroyed, it just
   isn't edited or displayed here, and implementationGaps no longer counts its
   absence as a gap. */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2, Pencil, Trash2, AlertTriangle, ListChecks, Search, X, Check,
  Calendar, Users, UserCircle2, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import {
  IMPLEMENTATION_STATUSES, IMPL_STATUS_LABEL, IMPL_STATUS_TONE, IMPL_STATUS_HELP,
  implementationGaps, type UseCaseImplementation, type ImplementationStatus,
} from "@/lib/use-case-implementation";
import { saveImplementationAction, removeImplementationAction } from "@/app/(app)/clients/[id]/use-case-implementation-actions";

const fieldCls =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius";

/**
 * `h-full` + `mt-auto` on the control is the whole trick: side-by-side fields
 * where only one has a hint used to sit ~16px out of line, because the hint
 * pushed that column's input down. Now the label block sits at the top of the
 * cell and the control is pinned to the bottom, so a row of fields aligns
 * whether none, some or all of them carry a hint.
 *
 * `native={false}` renders a <div> instead of a <label>, and CUSTOM CONTROLS
 * MUST USE IT. A <button> is a labelable element, so a wrapping <label>
 * forwards its own activation to it — one user click reaches the handler
 * twice, and a toggle opens then instantly closes. That is exactly how the
 * stakeholder picker shipped broken: it never appeared to open at all.
 */
function Field({ label, hint, children, native = true }: {
  label: string; hint?: string; children: React.ReactNode; native?: boolean;
}) {
  const Wrap = native ? "label" : "div";
  return (
    <Wrap className="flex h-full flex-col gap-1">
      <span className="font-body text-[11.5px] font-semibold text-fg">{label}</span>
      {hint && <span className="-mt-1 font-body text-[11px] leading-snug text-fg-subtle">{hint}</span>}
      <span className="mt-auto block pt-1">{children}</span>
    </Wrap>
  );
}

const blankForm = () => ({
  status: "exploring" as ImplementationStatus, objective: "", scope: "",
  clientOwner: "", targetDate: "", nextStep: "", notes: "",
});

export interface StakeholderOption {
  id: string; name: string; email: string | null; jobTitle: string | null;
}

/**
 * Searchable stakeholder picker. A native <select> can't be typed into, which
 * is fine for the three-name accounts and useless for the ones with a properly
 * mapped org — so this is a button + filtered list rather than a dropdown.
 *
 * The stored value is the stakeholder's email when they have one, else their
 * name (matching what the record has always held). A value that no longer
 * matches anyone — typed before this was a picker, or a person since removed
 * from the map — is still shown and kept, never silently cleared.
 */
function StakeholderPicker({ value, options, onChange }: {
  value: string;
  options: StakeholderOption[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const match = options.find((s) => (s.email || s.name) === value);
  const label = value ? (match ? match.name : value) : "Not assigned";

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options;
    return options.filter((s) => `${s.name} ${s.email ?? ""} ${s.jobTitle ?? ""}`.toLowerCase().includes(query));
  }, [options, q]);

  const pick = (next: string) => { onChange(next); setOpen(false); setQ(""); };

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
        className={cn(fieldCls, "flex items-center justify-between gap-2 text-left",
          !value && "text-fg-subtle")}>
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0 text-fg-subtle" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {options.length > 4 && (
            <label className="relative flex items-center border-b border-border-subtle">
              <Search size={12} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
              <span className="sr-only">Search stakeholders</span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full bg-transparent py-2 pl-7 pr-2 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle" />
            </label>
          )}
          <div role="listbox" className="max-h-56 overflow-y-auto p-1">
            <button type="button" role="option" aria-selected={!value} onClick={() => pick("")}
              className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-left font-body text-[12.5px] transition-colors hover:bg-bg-muted",
                !value ? "font-semibold text-sirius" : "text-fg-muted")}>
              Not assigned
            </button>
            {shown.map((s) => {
              const v = s.email || s.name;
              return (
                <button key={s.id} type="button" role="option" aria-selected={v === value} onClick={() => pick(v)}
                  className={cn("flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bg-muted",
                    v === value && "bg-accent-soft")}>
                  <span dir="auto" className={cn("font-body text-[12.5px] leading-snug",
                    v === value ? "font-semibold text-sirius" : "text-fg")}>{s.name}</span>
                  {(s.jobTitle || s.email) && (
                    <span className="truncate font-body text-[11px] text-fg-subtle">
                      {[s.jobTitle, s.email].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-center font-body text-[11.5px] text-fg-subtle">No one matches &ldquo;{q}&rdquo;.</p>
            )}
            {/* A value that isn't in the map any more still has to be visible,
                or reopening the picker would look like it had been cleared. */}
            {value && !match && (
              <p className="border-t border-border-subtle px-2 py-2 font-body text-[11px] text-fg-subtle">
                Currently: <span className="text-fg-muted">{value}</span> — not in the stakeholder map.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UseCasePortfolio({ clientId, canEdit, liveEntries, allEntries, groups, stakeholders, implementations }: {
  clientId: string;
  canEdit: boolean;
  /** Non-retired only — what the picker offers to newly associate. */
  liveEntries: ResolvedUseCase[];
  /** Includes retired — so an existing association still resolves a label. */
  allEntries: ResolvedUseCase[];
  /** Categories, so the picker can group rather than list 29 flat checkboxes. */
  groups: { id: string; label: string; blurb: string }[];
  /** The account's mapped stakeholders — who on the client side owns this use
   *  case. Picked from the real relationship map rather than retyped, so the
   *  name matches the Stakeholders tab and can't drift into a third spelling. */
  stakeholders: StakeholderOption[];
  implementations: UseCaseImplementation[];
}) {
  const router = useRouter();
  /* router.refresh() has to run inside a transition. Called bare from an event
     handler it does not reliably apply the revalidation the Server Action
     requested, so the page keeps rendering the props it already had: the write
     lands in Postgres, a hard reload shows it, and the open panel never does.
     That is what made selecting a use case look like it did nothing. */
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ useCaseId: string; impl?: UseCaseImplementation } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /* OPTIMISTIC TICKS, and the reason they are not optional.
     The checkboxes are controlled by `implementations`, which is server data.
     Without this, a click paints straight back to its old state — React
     re-renders from a prop that has not changed yet — and only ticks a second
     or two later once the action has returned and router.refresh() has brought
     new props down. It reads as a dead control, so the natural response is to
     click again, and because this is a TOGGLE the second click deletes the
     association the first one just made.
     `pending` holds the state the user asked for, per id, and wins over the
     server data until the refresh catches up. Several can be in flight at once
     — picking four use cases in a row is the normal case, not an edge one. */
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const settle = (id: string) => setPending((p) => {
    const n = new Map(p); n.delete(id); return n;
  });
  /* Two different things, kept apart on purpose:
       pending   what the user asked for — holds the checkbox until the server
                 data agrees, which only happens after the page refreshes
       inFlight  whether THIS id's write is still running — clears as soon as
                 the action returns, so the row unlocks in about a second
                 rather than waiting on a whole-page refresh */
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  // Something was written while the panel was open, so the page owes a refresh.
  const dirty = useRef(false);

  /* Ids whose write has just landed. A tick alone says "you clicked"; it does
     not say "this is stored", and the two are hard to tell apart when the
     result of the change — a card in the list — is below the fold behind an
     open picker. This drives a short-lived "Saved" on the row, and clears
     itself so the panel does not accumulate badges. */
  const [justSaved, setJustSaved] = useState<Set<string>>(new Set());
  const savedTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const markSaved = (id: string) => {
    setJustSaved((s) => new Set(s).add(id));
    clearTimeout(savedTimers.current.get(id));
    savedTimers.current.set(id, setTimeout(() => {
      setJustSaved((s) => { const n = new Set(s); n.delete(id); return n; });
      savedTimers.current.delete(id);
    }, 2600));
  };
  // Timers outlive the component if the panel is closed mid-save.
  useEffect(() => () => { for (const t of savedTimers.current.values()) clearTimeout(t); }, []);

  /* What is selected RIGHT NOW, optimistic writes included. Reading this from
     the server data alone left the counter a second or two behind the checkbox
     the user had just ticked, so the one number on screen that could have
     confirmed the change instead contradicted it. */
  const effectiveIds = useMemo(() => {
    const ids = new Set(implementations.map((i) => i.useCaseId));
    for (const [id, want] of pending) { if (want) ids.add(id); else ids.delete(id); }
    return ids;
  }, [implementations, pending]);
  const selectedCount = effectiveIds.size;

  const entryById = useMemo(() => new Map(allEntries.map((u) => [u.id, u])), [allEntries]);
  const rows = useMemo(
    () => implementations
      .map((impl) => ({ impl, entry: entryById.get(impl.useCaseId) }))
      .sort((a, b) => (a.entry?.label ?? "").localeCompare(b.entry?.label ?? "")),
    [implementations, entryById],
  );
  const associatedIds = useMemo(() => new Set(implementations.map((i) => i.useCaseId)), [implementations]);

  /* The picker is a list of ~30 definitions, so it needs finding rather than
     scrolling: search first, then grouped by category. An entry filed under no
     surviving category still has to be reachable, hence the Uncategorised
     bucket — otherwise it would be invisible and un-associable. */
  const picker = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pool = query
      ? liveEntries.filter((e) => `${e.label} ${e.summary}`.toLowerCase().includes(query))
      : liveEntries;
    const byLabel = (a: ResolvedUseCase, b: ResolvedUseCase) => a.label.localeCompare(b.label);
    const sections = groups
      .map((g) => ({ group: g, entries: pool.filter((e) => e.groups.includes(g.id)).sort(byLabel) }))
      .filter((s) => s.entries.length > 0);
    const filed = new Set(sections.flatMap((s) => s.entries.map((e) => e.id)));
    const orphans = pool.filter((e) => !filed.has(e.id)).sort(byLabel);
    return orphans.length
      ? [...sections, { group: { id: "__none", label: "Uncategorised", blurb: "" }, entries: orphans }]
      : sections;
  }, [liveEntries, groups, q]);

  const shownCount = picker.reduce((n, s) => n + s.entries.length, 0);

  function openEdit(row: { impl: UseCaseImplementation; entry: ResolvedUseCase | undefined }) {
    setForm({
      status: row.impl.status, objective: row.impl.objective, scope: row.impl.scope,
      clientOwner: row.impl.clientOwner, targetDate: row.impl.targetDate ?? "",
      nextStep: row.impl.nextStep, notes: row.impl.notes,
    });
    setEditing({ useCaseId: row.impl.useCaseId, impl: row.impl });
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setBusyId(editing.useCaseId); setError(null);
    const r = await saveImplementationAction(clientId, { id: editing.impl?.id, useCaseId: editing.useCaseId, ...form });
    setBusyId(null);
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return; }
    setEditing(null);
    refresh();
  }

  async function toggle(entry: ResolvedUseCase) {
    // Already in flight: ignore rather than queue a second write for the same
    // id, which would race the first and could land in either order.
    if (inFlight.has(entry.id)) return;
    setError(null);
    const existing = implementations.find((i) => i.useCaseId === entry.id);

    const start = (want: boolean) => {
      setPending((p) => new Map(p).set(entry.id, want));
      setInFlight((s) => new Set(s).add(entry.id));
    };
    const done = () => setInFlight((s) => { const n = new Set(s); n.delete(entry.id); return n; });

    if (existing) {
      const hasContent = existing.objective || existing.scope || existing.nextStep || existing.notes;
      if (hasContent && !window.confirm(
        `Remove "${entry.label}" from this account? This deletes the objective, scope and notes recorded for it.`,
      )) return;
      start(false);
      const r = await removeImplementationAction(clientId, existing.id);
      done();
      if (!r.ok) { settle(entry.id); setError(r.error ?? "Couldn't remove."); return; }
    } else {
      start(true);
      const r = await saveImplementationAction(clientId, { useCaseId: entry.id, ...blankForm() });
      done();
      if (!r.ok) { settle(entry.id); setError(r.error ?? "Couldn't associate."); return; }
    }
    markSaved(entry.id);
    dirty.current = true;

    /* NO refresh here, deliberately. router.refresh() re-renders the whole
       client profile — every tab's data, ~20 queries — and doing that per
       checkbox made each tick cost seconds and fight the next one. The picker
       already shows the truth optimistically; the page is brought back into
       line ONCE when the panel closes, which is also the moment the list
       underneath becomes visible again. */
  }

  /* Closing the picker is the commit point. It refreshes only once everything
     in flight has landed — closing mid-save and refreshing against a
     half-written account is exactly what made a selection fail to show up
     after pressing Done. */
  useEffect(() => {
    if (picking || !dirty.current || inFlight.size > 0) return;
    dirty.current = false;
    refresh();
  }, [picking, inFlight]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Clear an optimistic tick only once the server data agrees with it — not
     when the action returns. router.refresh() is asynchronous, so dropping it
     any earlier reverts the checkbox for the frame or two before the new props
     land, which is the flicker this exists to remove. */
  useEffect(() => {
    if (!pending.size) return;
    // Pure updater: markSaved is called by the writer, not from in here.
    setPending((p) => {
      const n = new Map(p);
      for (const [id, want] of p) if (associatedIds.has(id) === want) n.delete(id);
      return n.size === p.size ? p : n;
    });
  }, [associatedIds, pending]);

  async function remove(row: { impl: UseCaseImplementation; entry: ResolvedUseCase | undefined }) {
    if (!window.confirm(
      `Remove "${row.entry?.label ?? "this use case"}" from this account? This deletes the objective, scope and notes recorded for it.`,
    )) return;
    setBusyId(row.impl.useCaseId); setError(null);
    const r = await removeImplementationAction(clientId, row.impl.id);
    setBusyId(null);
    if (!r.ok) { setError(r.error ?? "Couldn't remove."); return; }
    refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-body text-[13.5px] font-semibold text-fg">Use cases</h2>
          {/* Two sentences, each doing one job: what this list is, and how it
              differs from the other use-case list on the same page. The earlier
              wording opened with "What CS has established this account is
              actually working on", which takes a re-read to parse and buries
              the noun. */}
          <p className="mt-0.5 max-w-[72ch] font-body text-[12px] text-fg-muted">
            What this account is working on, and what it wants from each.
            The header above shows what Sales sold &mdash; this is what CS confirmed, and the two can differ.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setPicking((p) => !p)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            <ListChecks size={13} /> {picking ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {picking && (
        <div className="flex flex-col gap-3 rounded-xl border border-sirius/25 bg-accent-soft/15 p-4">
          {liveEntries.length === 0 ? (
            <p className="font-body text-[12.5px] italic text-fg-subtle">
              Nothing in the Use Case Universe yet — an admin adds entries from{" "}
              <Link href="/use-cases" className="not-italic font-medium text-sirius underline decoration-dotted underline-offset-2">Use Cases</Link>.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-body text-[12.5px] font-semibold text-fg">
                  Choose use cases
                  <span className="font-normal text-fg-subtle">
                    {selectedCount} of {liveEntries.length} selected
                  </span>
                  {/* One place that always says whether the panel is settled,
                      so the state is legible without hunting for the row you
                      last touched. */}
                  {inFlight.size > 0 ? (
                    <span className="inline-flex items-center gap-1 font-normal text-fg-subtle">
                      <Loader2 size={11} className="animate-spin" aria-hidden /> saving…
                    </span>
                  ) : justSaved.size > 0 ? (
                    <span className="inline-flex items-center gap-1 font-normal text-[#2F7D52]">
                      <Check size={11} aria-hidden /> saved
                    </span>
                  ) : null}
                </p>
                <label className="relative flex min-w-[190px] flex-1 items-center sm:max-w-[260px] sm:flex-none">
                  <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
                  <span className="sr-only">Search use cases</span>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                    className="w-full rounded-lg border border-border bg-bg py-1.5 pl-7 pr-7 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
                  {q && (
                    <button onClick={() => setQ("")} aria-label="Clear search"
                      className="absolute right-2 text-fg-subtle hover:text-fg"><X size={12} /></button>
                  )}
                </label>
              </div>

              <div className="-mr-1 max-h-[min(58vh,460px)] overflow-y-auto pr-1">
                {picker.map(({ group, entries }) => {
                  const shut = collapsed.has(group.id);
                  // Optimistic, like the headline count — a category badge that
                  // lags the checkbox inside it is its own small contradiction.
                  const on = entries.filter((e) => effectiveIds.has(e.id)).length;
                  return (
                    <section key={group.id} className="mb-1 last:mb-0">
                      <button type="button" aria-expanded={!shut}
                        onClick={() => setCollapsed((p) => {
                          const n = new Set(p); n.has(group.id) ? n.delete(group.id) : n.add(group.id); return n;
                        })}
                        className="sticky top-0 z-10 flex w-full items-center gap-1.5 bg-accent-soft/40 px-1.5 py-1.5 text-left backdrop-blur">
                        {shut ? <ChevronRight size={11} className="shrink-0 text-fg-subtle" />
                              : <ChevronDown size={11} className="shrink-0 text-fg-subtle" />}
                        <span className="flex-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
                          {group.label}
                        </span>
                        {on > 0 && (
                          <span className="tabular rounded-full bg-sirius/15 px-1.5 font-body text-[10.5px] font-semibold text-sirius">{on}</span>
                        )}
                        <span className="tabular font-body text-[10.5px] text-fg-subtle">{entries.length}</span>
                      </button>
                      {!shut && entries.map((entry) => {
                        // What the user asked for wins until the server agrees.
                        const busy = inFlight.has(entry.id);
                        const saved = justSaved.has(entry.id);
                        const checked = pending.has(entry.id) ? pending.get(entry.id)! : associatedIds.has(entry.id);
                        return (
                          <label key={entry.id}
                            className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition-colors",
                              checked ? "bg-surface" : "hover:bg-surface/70",
                              // A settled write is worth a beat of green. Not a
                              // toast: it stays on the row it describes.
                              saved && "ring-1 ring-[#2F7D52]/35")}>
                            <input type="checkbox" checked={checked} disabled={busy}
                              onChange={() => void toggle(entry)} className="mt-[3px] shrink-0 accent-sirius" />
                            <span className="min-w-0 flex-1">
                              <span dir="auto" className={cn("block font-body text-[12.5px] leading-snug",
                                checked ? "font-semibold text-fg" : "font-medium text-fg")}>
                                {entry.label}
                              </span>
                              {entry.summary && (
                                <span dir="auto" className="mt-0.5 line-clamp-2 font-body text-[11.5px] leading-snug text-fg-subtle">
                                  {entry.summary}
                                </span>
                              )}
                            </span>
                            {/* Left of the row, so it reads as the state of THIS
                                use case. `busyId` no longer tracks toggles —
                                several can be in flight at once — so this reads
                                the same per-id state the checkbox does. */}
                            {busy && <Loader2 size={12} className="mt-1 shrink-0 animate-spin text-fg-subtle" aria-label="Saving" />}
                            {!busy && saved && (
                              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-[#2F7D52]/10 px-1.5 py-0.5 font-body text-[10px] font-semibold text-[#2F7D52]">
                                <Check size={9} aria-hidden /> Saved
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </section>
                  );
                })}
                {shownCount === 0 && (
                  <p className="px-2 py-8 text-center font-body text-[12px] text-fg-subtle">
                    Nothing matches &ldquo;{q}&rdquo;.{" "}
                    <button onClick={() => setQ("")} className="underline decoration-dotted underline-offset-2 hover:text-sirius">Clear</button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <form className="flex flex-col gap-4 rounded-xl border border-sirius/25 bg-accent-soft/15 p-4"
          onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
          <p className="font-body text-[13px] font-semibold text-fg">
            Edit — <span dir="auto">{entryById.get(editing.useCaseId)?.label ?? editing.useCaseId}</span>
          </p>
          {/* ORDER: what they're trying to do → who it's for → how it's tracked
              → anything else. The objective led the record conceptually but sat
              third, so the form opened with "Exploring" and a headcount before
              it said what the client actually wants. */}
          <Field label="Account-specific objective" hint="What THIS client is trying to achieve.">
            <textarea rows={3} className={fieldCls} value={form.objective}
              onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))} />
          </Field>
          {/* A textarea, not an input: scope is rarely one number. "300 field
              engineers across 4 regions, excluding contractors — phase 2 adds
              the KSA team" is a normal answer and was being typed into a
              single line you couldn't read back. */}
          <Field label="Scope / population" hint='Who it covers — e.g. "30 engineers", "all of Ops, excluding contractors".'>
            <textarea rows={2} className={fieldCls} value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} />
          </Field>

          {/* The three tracking fields banded together and visually separated
              from the writing above: they're what you glance at and nudge, not
              what you compose. NO "Next step" among them — the next action is a
              task now (owner, due date, Today board). `nextStep` still rides in
              form state untouched so saving can't wipe an older value. */}
          <fieldset className="rounded-lg border border-border-subtle bg-surface/40 p-3">
            <legend className="px-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
              Tracking
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Status" hint="Where this stands today.">
                <select className={fieldCls} value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ImplementationStatus }))}>
                  {IMPLEMENTATION_STATUSES.map((s) => (
                    <option key={s} value={s} title={IMPL_STATUS_HELP[s]}>{IMPL_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              {/* Picked from the account's mapped stakeholders, not retyped — the
                  free-text version drifted from the Stakeholders tab immediately.
                  Anything already stored stays selectable so an older record
                  doesn't silently lose its owner on the next save. */}
              <Field label="Stakeholder" native={false} hint={stakeholders.length ? "Who owns this client-side." : "None mapped on this account yet."}>
                <StakeholderPicker value={form.clientOwner} options={stakeholders}
                  onChange={(next) => setForm((f) => ({ ...f, clientOwner: next }))} />
              </Field>
              <Field label="Target date" hint="Deliver by.">
                <input type="date" className={fieldCls} value={form.targetDate}
                  onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} />
              </Field>
            </div>
          </fieldset>

          <Field label="Notes" hint="Anything that doesn't belong above.">
            <textarea rows={3} className={fieldCls} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex items-center gap-2 border-t border-sirius/15 pt-3">
            <button type="submit" disabled={busyId === editing.useCaseId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busyId === editing.useCaseId && <Loader2 size={12} className="animate-spin" />} Save
            </button>
            <button type="button" onClick={() => { setEditing(null); setError(null); }}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        !picking && (
          <p className="font-body text-[12.5px] italic text-fg-subtle">
            No use cases associated with this account yet.{canEdit && " Click Edit to choose some."}
          </p>
        )
      ) : (
        /* One card per use case rather than hairline-divided rows: each carries
           several fields, and rows that tight read as one dense block. */
        <div className="flex flex-col gap-2.5">
          {rows.map(({ impl, entry }) => {
            const gaps = implementationGaps(impl);
            /* Only the facts that exist. Rendering "Scope: —" for every empty
               field is what made this look like a form instead of a summary. */
            const meta = [
              impl.scope && { icon: Users, text: impl.scope },
              impl.targetDate && { icon: Calendar, text: impl.targetDate },
              impl.clientOwner && { icon: UserCircle2, text: impl.clientOwner },
            ].filter(Boolean) as { icon: typeof Users; text: string }[];

            return (
              <article key={impl.id} className="rounded-xl border border-border-subtle bg-bg-muted/25 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 dir="auto" className="font-body text-[13.5px] font-semibold leading-snug text-fg">
                      {entry?.label ?? impl.useCaseId}
                    </h3>
                    <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", IMPL_STATUS_TONE[impl.status])}>
                      {IMPL_STATUS_LABEL[impl.status]}
                    </span>
                    {entry?.retired && (
                      <span className="rounded-full bg-bg-muted px-1.5 py-px font-body text-[10px] font-semibold text-fg-muted">retired</span>
                    )}
                  </div>
                  {canEdit && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button onClick={() => openEdit({ impl, entry })} aria-label={`Edit ${entry?.label ?? impl.useCaseId}`}
                        className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface hover:text-sirius"><Pencil size={13} /></button>
                      <button onClick={() => void remove({ impl, entry })} aria-label={`Remove ${entry?.label ?? impl.useCaseId}`}
                        disabled={busyId === impl.useCaseId}
                        className="rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-surface hover:text-[#B23A57] disabled:opacity-40">
                        {busyId === impl.useCaseId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </span>
                  )}
                </div>

                <p dir="auto" className="mt-1.5 max-w-[80ch] font-body text-[12.5px] leading-relaxed text-fg-muted">
                  {impl.objective || <span className="italic text-fg-subtle">No objective written yet.</span>}
                </p>

                {meta.length > 0 && (
                  <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border-subtle pt-2.5">
                    {meta.map(({ icon: Icon, text }, i) => (
                      <div key={i} className="flex min-w-0 items-center gap-1.5">
                        <Icon size={12} className="shrink-0 text-fg-subtle" aria-hidden />
                        <dd dir="auto" className="truncate font-body text-[11.5px] text-fg-muted">{text}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {gaps.length > 0 && (
                  <p className="mt-2 font-body text-[11px] text-fg-subtle">
                    Still to fill in: <span className="text-[#8A6D12]">{gaps.join(" · ")}</span>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
