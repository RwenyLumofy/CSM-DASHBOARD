"use client";

/* The Use Case Universe — a reference work, not a dashboard.

   The first version was built like an analytics page: four stat cards, the same
   stat-card pattern again inside the detail, every element in its own bordered
   box, and a flat alphabetical rail. Two things were wrong with that. The
   page's job is to make 23 definitions learnable, and it led with counts. And
   it is a page about CATEGORISATION whose categories were invisible — the rail
   was one undifferentiated stack.

   The name, one-line summary and categories are REAL — they come from the
   published Lumofy library. Everything longer is written by the team, and an
   entry nobody has written shows as undocumented rather than being filled with
   plausible text of unknown origin.

   So: the rail IS the taxonomy, grouped and dense, so the whole shape is on
   screen at once. The detail leads with the summary at reading size.
   Borders appear once, to separate the two panes; everything else is separated
   by space and weight, which is what stops a reference page reading as a
   control panel. Adoption survives as one quiet line and a disclosure, because
   here it is context, not the subject. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Info, ChevronRight, Pencil, Loader2, RotateCcw, X, SlidersHorizontal, Check,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, STAKEHOLDER_ROLES, type StakeholderRole } from "@/lib/stakeholders/profile";
import type { UseCaseEntry, UseCaseOverride } from "@/lib/use-case-library";
import type { AdoptionSummary } from "@/lib/use-case-adoption";
import { saveUseCaseEntryAction, resetUseCaseEntryAction } from "@/app/(app)/use-cases/actions";
import { TaxonomyManager } from "@/components/reports/TaxonomyManager";
import type { ResolvedUseCase, TaxonomyOverlay } from "@/lib/use-case-overlay";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}k` : `$${Math.round(n)}`;

const fieldCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15";

/* Section headings are sentence case at body weight, not uppercase micro-caps.
   Six shouty labels stacked down one column is noise; this page needs one
   emphasis level, not two. */
function Head({ children }: { children: React.ReactNode }) {
  return <h3 className="font-body text-[12.5px] font-semibold text-fg-subtle">{children}</h3>;
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Head>{title}</Head>
      <ul className="flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 font-body text-[13.5px] leading-relaxed text-fg-muted">
            <span aria-hidden className="mt-[9px] size-[3px] shrink-0 rounded-full bg-fg-subtle" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** An empty container to start writing into — nothing pre-filled, so no
 *  invented text can be saved by accident. */
const blankEntry = (id: string): UseCaseEntry => ({
  id, definition: "", inPractice: "", examples: [], evidence: [], pitfall: "", stakeholderRoles: [],
});

function EditField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[12px] font-semibold text-fg">{label}</span>
      {hint && <span className="-mt-1 font-body text-[11.5px] text-fg-subtle">{hint}</span>}
      {children}
    </label>
  );
}

export function UseCaseUniverse({ library, adoption, canEdit, overrides, allEntries, groups, taxonomy }: {
  library: UseCaseEntry[];
  adoption: AdoptionSummary;
  canEdit: boolean;
  overrides: Record<string, UseCaseOverride>;
  allEntries: ResolvedUseCase[];
  groups: { id: string; label: string; blurb: string }[];
  taxonomy: TaxonomyOverlay;
}) {
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(adoption.rows[0]?.option.id ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draft, setDraft] = useState<UseCaseEntry | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const adoptionById = useMemo(() => new Map(adoption.rows.map((r) => [r.option.id, r])), [adoption.rows]);

  const q = query.trim().toLowerCase();

  /** The rail IS the taxonomy: every category with its entries beneath it. */
  const sections = useMemo(() => {
    const hit = (id: string) => {
      if (!q) return true;
      const r = adoptionById.get(id);
      const e = byId.get(id);
      return `${r?.option.label ?? ""} ${r?.option.summary ?? ""} ${e?.definition ?? ""} ${e?.inPractice ?? ""}`
        .toLowerCase().includes(q);
    };
    return groups
      .map((g) => ({
        group: g,
        rows: adoption.rows.filter((r) => (r.option.groups as string[]).includes(g.id) && hit(r.option.id)),
      }))
      .filter((s) => s.rows.length > 0);
  }, [groups, adoption.rows, q, adoptionById, byId]);

  const visibleCount = useMemo(
    () => new Set(sections.flatMap((s) => s.rows.map((r) => r.option.id))).size, [sections]);

  const selected = adoptionById.get(selectedId);
  const entry = byId.get(selectedId);

  // Switching entry abandons an open edit, so half-typed text can't follow you
  // onto the next one and overwrite it.
  useEffect(() => {
    setEditing(false); setDraft(null); setSaveError(null);
    detailRef.current?.scrollTo?.({ top: 0 });
  }, [selectedId]);

  const customised = !!overrides[selectedId] &&
    Object.keys(overrides[selectedId]).some((k) => k !== "updatedAt" && k !== "updatedBy");

  const documented = library.length;

  async function save() {
    if (!draft) return;
    setBusy(true); setSaveError(null);
    const r = await saveUseCaseEntryAction(draft.id, {
      definition: draft.definition, inPractice: draft.inPractice,
      examples: draft.examples, evidence: draft.evidence,
      pitfall: draft.pitfall, stakeholderRoles: draft.stakeholderRoles,
    });
    setBusy(false);
    if (!r.ok) { setSaveError(r.error ?? "Couldn't save."); return; }
    window.location.reload();
  }

  /** Clears the description entirely — there is no shipped text to fall back
   *  to, so this leaves the use case undocumented again. */
  async function clearDescription() {
    if (!window.confirm("Delete this description? The use case stays; only the writing goes.")) return;
    setBusy(true); setSaveError(null);
    const r = await resetUseCaseEntryAction(selectedId);
    setBusy(false);
    if (!r.ok) { setSaveError(r.error ?? "Couldn't reset."); return; }
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── one line of context, not four stat cards ─────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="font-body text-[13px] text-fg-muted">
          <span className="tabular font-semibold text-fg">{allEntries.filter((e) => !e.retired).length}</span> use cases ·{" "}
          <span className="tabular font-semibold text-fg">{groups.length}</span> categories ·{" "}
          <span className="tabular font-semibold text-fg">{documented}</span> described
        </p>
        <div className="flex items-center gap-2">
          <label className="relative flex items-center">
            <Search size={13} className="pointer-events-none absolute left-2.5 text-fg-subtle" aria-hidden />
            <span className="sr-only">Search use cases</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
              className="w-[190px] rounded-lg border border-border bg-bg py-1.5 pl-7 pr-2.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius" />
          </label>
          {canEdit && (
            <button onClick={() => setManaging((m) => !m)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
                managing ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
              <SlidersHorizontal size={13} /> Manage
            </button>
          )}
        </div>
      </div>

      {managing && canEdit && (
        <TaxonomyManager entries={allEntries} groups={groups} overlay={taxonomy} onClose={() => setManaging(false)} />
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── the taxonomy, grouped ───────────────────────────────── */}
        <nav aria-label="Use cases by category"
          className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          {sections.length === 0 && (
            <p className="font-body text-[13px] text-fg-muted">Nothing matches &ldquo;{query}&rdquo;.</p>
          )}
          <div className="flex flex-col gap-5">
            {sections.map(({ group, rows }) => (
              <div key={group.id} className="flex flex-col gap-0.5">
                <p title={group.blurb}
                  className="mb-1 font-body text-[10.5px] font-semibold uppercase tracking-[0.09em] text-fg-subtle">
                  {group.label}
                </p>
                {rows.map((r) => {
                  const active = r.option.id === selectedId;
                  return (
                    <button key={r.option.id} onClick={() => setSelectedId(r.option.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex items-baseline gap-2 rounded-md border-l-2 py-[5px] pl-2.5 pr-1.5 text-left transition-colors",
                        active
                          ? "border-sirius bg-accent-soft/70 text-sirius"
                          : "border-transparent text-fg-muted hover:border-border hover:text-fg",
                      )}>
                      <span className={cn("min-w-0 flex-1 truncate font-body text-[13px]", active && "font-semibold")}>
                        {r.option.label}
                      </span>
                      {r.option.unresolved && (
                        <span aria-label="outside the published set" title="Carries data but is outside the published set"
                          className="size-1.5 shrink-0 rounded-full bg-[#C99A14]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {q && (
            <p className="mt-4 font-body text-[11.5px] text-fg-subtle">
              {visibleCount} of {adoption.rows.length} match
            </p>
          )}
        </nav>

        {/* ── one use case, definition first ──────────────────────── */}
        {selected ? (
          <article ref={detailRef} className="min-w-0 lg:border-l lg:border-border-subtle lg:pl-8">
            <header className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2">
                {selected.option.groups.map((g, i) => {
                  const meta = groups.find((x) => x.id === g);
                  if (!meta) return null;
                  return (
                    <span key={g} className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-sirius">
                      {i > 0 && <span className="mr-2 text-fg-subtle">·</span>}{meta.label}
                    </span>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
                  {selected.option.label}
                </h2>
                {canEdit && !editing && (
                  <button onClick={() => { setDraft(entry ? { ...entry } : blankEntry(selected.option.id)); setEditing(true); }}
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    <Pencil size={11} /> Edit
                  </button>
                )}
              </div>

              {!editing && (
                <p className="max-w-[62ch] font-body text-[16px] leading-[1.62] text-fg">
                  {entry?.definition || selected.option.summary}
                </p>
              )}

              {/* Adoption demoted to one quiet line — context, not the subject. */}
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-body text-[12px] text-fg-subtle">
                <span className="tabular">{selected.confirmed.length + selected.declaredOnly.length} accounts</span>
                {selected.totalArr > 0 && <><span aria-hidden>·</span><span className="tabular">{money(selected.totalArr)}</span></>}
                {!entry && <><span aria-hidden>·</span><span className="text-fg-subtle">not described yet</span></>}
                {selected.option.unresolved && <><span aria-hidden>·</span><span className="font-semibold text-[#8A6D12]">outside the published set</span></>}
              </p>
            </header>

            {saveError && (
              <p role="alert" className="mt-4 rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
                {saveError}
              </p>
            )}

            {editing && draft ? (
              <form className="mt-6 flex max-w-[68ch] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
                <p className="font-body text-[12.5px] text-fg-subtle">
                  The name and categories come from the taxonomy — change those under <b className="font-semibold text-fg-muted">Manage</b>.
                </p>
                <EditField label="Definition" hint="One sentence: what the client is trying to achieve.">
                  <textarea rows={2} className={fieldCls} value={draft.definition}
                    onChange={(e) => setDraft({ ...draft, definition: e.target.value })} />
                </EditField>
                <EditField label="What it looks like" hint="What it actually looks like inside an account.">
                  <textarea rows={3} className={fieldCls} value={draft.inPractice}
                    onChange={(e) => setDraft({ ...draft, inPractice: e.target.value })} />
                </EditField>
                <EditField label="Examples" hint="One per line.">
                  <textarea rows={Math.max(3, draft.examples.length + 1)} className={fieldCls}
                    value={draft.examples.join("\n")}
                    onChange={(e) => setDraft({ ...draft, examples: e.target.value.split("\n") })} />
                </EditField>
                <EditField label="Evidence it's working" hint="One per line — what you would actually observe.">
                  <textarea rows={Math.max(3, draft.evidence.length + 1)} className={fieldCls}
                    value={draft.evidence.join("\n")}
                    onChange={(e) => setDraft({ ...draft, evidence: e.target.value.split("\n") })} />
                </EditField>
                <EditField label="How it usually fails">
                  <textarea rows={2} className={fieldCls} value={draft.pitfall}
                    onChange={(e) => setDraft({ ...draft, pitfall: e.target.value })} />
                </EditField>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="font-body text-[12px] font-semibold text-fg">Who usually owns it</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {STAKEHOLDER_ROLES.map((role) => {
                      const on = draft.stakeholderRoles.includes(role);
                      return (
                        <button key={role} type="button" aria-pressed={on}
                          onClick={() => setDraft({
                            ...draft,
                            stakeholderRoles: on ? draft.stakeholderRoles.filter((r) => r !== role)
                                                 : [...draft.stakeholderRoles, role as StakeholderRole],
                          })}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                            on ? "border-sirius bg-accent-soft font-medium text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                          {on && <Check size={10} strokeWidth={3} />} {ROLE_LABEL[role]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white disabled:opacity-50">
                    {busy && <Loader2 size={12} className="animate-spin" />} Save
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setDraft(null); setSaveError(null); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
                    <X size={12} /> Cancel
                  </button>
                  {customised && (
                    <button type="button" onClick={clearDescription} disabled={busy}
                      className="ml-auto inline-flex items-center gap-1 font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-sirius">
                      <RotateCcw size={11} /> Delete description
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="mt-7 flex max-w-[68ch] flex-col gap-6">
                {!entry ? (
                  <p className="font-body text-[13.5px] leading-relaxed text-fg-muted">
                    Nothing written about this one yet.{" "}
                    {canEdit
                      ? <>Its name and category come from the published library — the description is yours to write.</>
                      : <>Its name and category come from the published library.</>}
                  </p>
                ) : (
                  <>
                    {entry.inPractice && (
                      <section className="flex flex-col gap-1.5">
                        <Head>What it looks like</Head>
                        <p className="font-body text-[13.5px] leading-relaxed text-fg-muted">{entry.inPractice}</p>
                      </section>
                    )}

                    <Bullets title="Examples" items={entry.examples} />
                    <Bullets title="Evidence it&rsquo;s working" items={entry.evidence} />

                    {entry.pitfall && (
                      <section className="flex flex-col gap-1.5">
                        <Head>How it usually fails</Head>
                        <p className="font-body text-[13.5px] leading-relaxed text-fg-muted">{entry.pitfall}</p>
                      </section>
                    )}

                    {entry.stakeholderRoles.length > 0 && (
                      <section className="flex flex-col gap-1.5">
                        <Head>Who usually owns it</Head>
                        <p className="font-body text-[13.5px] text-fg-muted">
                          {entry.stakeholderRoles.map((r) => ROLE_LABEL[r]).join(" · ")}
                        </p>
                      </section>
                    )}
                  </>
                )}

                {(selected.confirmed.length > 0 || selected.declaredOnly.length > 0) && (
                  <details className="group">
                    <summary className="cursor-pointer list-none font-body text-[12.5px] font-semibold text-fg-subtle transition-colors hover:text-sirius">
                      <ChevronRight size={12} className="mr-1 inline transition-transform group-open:rotate-90" aria-hidden />
                      {selected.confirmed.length + selected.declaredOnly.length} accounts recorded against this
                    </summary>
                    <ul className="mt-2 flex flex-col">
                      {[...selected.confirmed, ...selected.declaredOnly].map((a) => (
                        <li key={a.id}>
                          <a href={`/clients/${a.id}`}
                            className="flex items-baseline gap-3 rounded py-1 font-body text-[13px] text-fg-muted transition-colors hover:text-sirius">
                            <span dir="auto" className="min-w-0 flex-1 truncate">{a.name}</span>
                            <span className="tabular shrink-0 text-[12px] text-fg-subtle">{money(a.arr)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </article>
        ) : (
          <p className="font-body text-[13.5px] text-fg-muted">Choose a use case.</p>
        )}
      </div>
    </div>
  );
}
