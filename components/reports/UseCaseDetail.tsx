"use client";

/* One use case — the definition, plus a read-only look at who has it.

   THE ACCOUNTS LIST HERE IS READ-ONLY. Associating an account with a use
   case, and its account-specific objective/scope/status, is edited only from
   the client page (components/clients/UseCasePortfolio.tsx) — this component
   never writes an implementation record. What it DOES show is which accounts
   already carry this use case, sourced from that same data, so a stakeholder
   browsing the Universe can see what's actually live and where there's room
   to extend a use case to more accounts.

   ONE COLUMN. A right-hand rail was tried and removed: everything it held was
   already on the page — category in the eyebrow, status in the header chip,
   capabilities and related use cases in their own sections. What remained was
   three governance one-liners, which now sit in the header where they belong,
   and the list of gaps, which sits at the foot next to the buttons that close
   them.

   SECTION-LEVEL EDITING. Each block owns its Edit / Save / Cancel and sends
   only its own fields. Two people editing different sections don't collide, a
   failed save loses only the section in hand, and the page is calm to read when
   nothing is being edited — no permanent inputs, no one giant form.

   Reading order answers the five questions in order: what problem, what
   outcome, how clients say it, who it's for, how Lumofy helps. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil, Loader2, X, Check, ExternalLink, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCTS, blankEntry, missingFields, safeHttpUrl, type UseCaseEntry, type Product } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import {
  IMPL_STATUS_LABEL, IMPL_STATUS_TONE, type ImplementationWithAccount,
} from "@/lib/use-case-implementation";
import { reviewState } from "@/lib/use-case-status";
import { saveUseCaseSectionAction, type SectionPatch } from "@/app/(app)/use-cases/actions";

const fieldCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Section({ title, canEdit, editing, busy, onEdit, onSave, onCancel, children, form }: {
  title: string; canEdit: boolean; editing: boolean; busy: boolean;
  onEdit: () => void; onSave: () => void; onCancel: () => void;
  children: React.ReactNode; form?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-body text-[13px] font-semibold text-fg">{title}</h2>
        {canEdit && !editing && (
          <button onClick={onEdit}
            className="inline-flex items-center gap-1 font-body text-[12px] font-medium text-fg-subtle transition-colors hover:text-sirius">
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
          {form}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={onCancel} disabled={busy}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </form>
      ) : children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) =>
  <p className="font-body text-[13px] italic text-fg-subtle">{children}</p>;

/** Two by default, the rest behind a disclosure — the section is a recognition
 *  aid, not the point of the page. */
function ClientPhrases({ phrases }: { phrases: string[] }) {
  const [all, setAll] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {(all ? phrases : phrases.slice(0, 2)).map((p, i) => (
        <p key={i} className="font-body text-[13px] italic leading-relaxed text-fg-muted">&ldquo;{p}&rdquo;</p>
      ))}
      {phrases.length > 2 && (
        <button onClick={() => setAll((a) => !a)}
          className="w-fit font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
          {all ? "Show fewer" : `Show ${phrases.length - 2} more`}
        </button>
      )}
    </div>
  );
}

export function UseCaseDetail({
  option, entry, allEntries, groups, canEdit, accounts,
  today, basePath = "/use-cases", embedded = false,
}: {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  allEntries: ResolvedUseCase[];
  groups: { id: string; label: string; blurb: string }[];
  canEdit: boolean;
  /** Read-only — who has this use case. See the module header. */
  accounts: ImplementationWithAccount[];
  today: string;
  basePath?: string;
  /** Rendered inside the Workbench's right pane rather than on its own route:
   *  drops the back link and the outer heading level, since the sidebar is
   *  already the navigation. Everything else — every editable section — is
   *  identical, so there is one implementation of editing, not two. */
  embedded?: boolean;
}) {
  const [section, setSection] = useState<string | null>(null);
  const [draft, setDraft] = useState<UseCaseEntry>(entry ?? blankEntry(option.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const e = entry ?? blankEntry(option.id);
  const gaps = missingFields(entry);
  const categoryLabel = option.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ");

  function open(id: string) {
    setDraft(entry ? { ...entry, audience: { ...entry.audience } } : blankEntry(option.id));
    setSection(id); setError(null);
  }
  const cancel = () => { setSection(null); setError(null); };
  const isOpen = (id: string) => section === id;

  /* Which optional sections have something to show. An empty one is HIDDEN
     rather than rendered as a grey "Not defined yet" — a page of placeholders
     reads as broken, and it made the sparse state look like a bug instead of
     work not yet done. They come back through the "Add" strip at the bottom. */
  const optional = [
    { id: "phrases", title: "How clients describe the need", short: "Client phrases", has: e.clientPhrases.length > 0 },
    { id: "audience", title: "Who it is for", short: "Who it’s for", has: Object.values(e.audience).some(Boolean) },
    // Products alone are enough to render this section, so they also count as
    // "has" — otherwise it shows AND is offered under "Add" at the same time.
    { id: "capabilities", title: "What Lumofy enables", short: "What Lumofy enables", has: e.capabilities.length > 0 || e.products.length > 0 },
    { id: "indicators", title: "Success indicators", short: "Success indicators", has: e.successIndicators.length > 0 },
    { id: "related", title: "How this differs from related use cases", short: "Related use cases", has: e.relatedUseCases.length > 0 },
  ];
  const shows = (id: string) => !!optional.find((s) => s.id === id)?.has || isOpen(id);
  const hiddenSections = optional.filter((s) => !s.has && !isOpen(s.id));

  async function save(patch: SectionPatch) {
    setBusy(true); setError(null);
    const r = await saveUseCaseSectionAction(option.id, patch);
    if (!r.ok) { setBusy(false); setError(r.error ?? "Couldn't save."); return; }   // stays open, nothing typed is lost
    // router.refresh, not location.reload: a full reload after every section
    // save meant scroll position and open state were lost 182 times over.
    setSection(null);
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {!embedded && (
        <Link href={basePath}
          className="inline-flex w-fit items-center gap-1 font-body text-[12.5px] font-medium text-fg-muted transition-colors hover:text-sirius">
          <ChevronLeft size={13} /> Use Cases
        </Link>
      )}

      <header className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-sirius">{categoryLabel}</span>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 dir="auto" className={cn("font-display font-semibold leading-tight tracking-[-0.02em] text-fg",
            embedded ? "text-[23px]" : "text-[27px]")}>
            {option.label}
          </h1>
          {canEdit && (
            <button onClick={() => open("header")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <Pencil size={12} /> Edit definition
            </button>
          )}
        </div>

        <p className="max-w-[64ch] font-body text-[15px] leading-[1.6] text-fg">{e.oneLiner || option.summary}</p>

        {/* NO META STRIP. It read "Needs review · 0 accounts · Owner: not set"
            on every entry — three facts already on the screen: the index dot
            and the footer flag the review, the accounts section below carries
            its own count, and the footer names the governance gaps. Only the
            source link had nowhere else to live, so it stays. */}
        {/* Re-checked at the render, not trusted from storage: this href is
            shown to every viewer, and a `javascript:`/`data:` value that got in
            through some future write path must not become a live link here. */}
        {safeHttpUrl(e.sourceUrl) && (
          <a href={safeHttpUrl(e.sourceUrl)!} target="_blank" rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 font-body text-[12px] text-sirius underline decoration-dotted underline-offset-2">
            Source <ExternalLink size={10} />
          </a>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-body text-[13px] font-semibold text-fg">
          Accounts using this
          {accounts.length > 0 && <span className="tabular ml-1.5 text-fg-subtle">({accounts.length})</span>}
        </h2>
        {accounts.length === 0 ? (
          <Empty>No account has this associated yet — associate one from its profile page.</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {accounts.map(({ account, implementation }) => (
              <li key={implementation.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle px-3 py-2">
                <Link href={`/clients/${account.id}`} dir="auto"
                  className="font-body text-[13px] font-semibold text-fg hover:text-sirius">
                  {account.name}
                </Link>
                <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-medium",
                  IMPL_STATUS_TONE[implementation.status])}>
                  {IMPL_STATUS_LABEL[implementation.status]}
                </span>
                {implementation.objective && (
                  <span className="min-w-0 flex-1 truncate font-body text-[12px] text-fg-muted">{implementation.objective}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          {error}
        </p>
      )}

      {isOpen("header") && (
        <form className="flex max-w-[68ch] flex-col gap-3 rounded-xl border border-sirius/30 bg-accent-soft/20 p-4"
          onSubmit={(ev) => { ev.preventDefault(); void save({
            oneLiner: draft.oneLiner, status: draft.status,
            products: draft.products, sourceUrl: draft.sourceUrl }); }}>
          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-fg">One-line definition</span>
            <textarea rows={2} className={fieldCls} value={draft.oneLiner} placeholder={option.summary}
              onChange={(ev) => setDraft({ ...draft, oneLiner: ev.target.value })} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-[12px] font-semibold text-fg">Status</span>
              <select className={fieldCls} value={draft.status}
                onChange={(ev) => setDraft({ ...draft, status: ev.target.value as UseCaseEntry["status"] })}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-body text-[12px] font-semibold text-fg">Lumofy products</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCTS.map((p) => {
                const on = draft.products.includes(p);
                return (
                  <button key={p} type="button" aria-pressed={on}
                    onClick={() => setDraft({ ...draft, products: on ? draft.products.filter((x) => x !== p) : [...draft.products, p as Product] })}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                      on ? "border-sirius bg-accent-soft font-medium text-sirius" : "border-border text-fg-muted hover:border-sirius")}>
                    {on && <Check size={10} strokeWidth={3} />} {p}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="font-body text-[12px] font-semibold text-fg">Source</span>
            <input className={fieldCls} placeholder="https://notion.so/…" value={draft.sourceUrl ?? ""}
              onChange={(ev) => setDraft({ ...draft, sourceUrl: ev.target.value || null })} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-medium text-fg-muted hover:text-fg">Cancel</button>
            <button type="button" onClick={() => void save({ markReviewed: true })} disabled={busy}
              className="ml-auto font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
              Mark reviewed
            </button>
          </div>
        </form>
      )}

      {/* Single column. The right rail repeated what the header and the body
          already said, so the page now runs top to bottom at one readable
          measure and nothing competes with the prose. */}
      <div className="flex max-w-[70ch] flex-col gap-7">
            <Section title="Customer problem" canEdit={canEdit} editing={isOpen("problem")} busy={busy}
              onEdit={() => open("problem")} onCancel={cancel}
              onSave={() => void save({ customerProblem: draft.customerProblem, desiredOutcome: draft.desiredOutcome })}
              form={<>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-[12px] font-semibold text-fg">Customer problem</span>
                  <textarea rows={4} className={fieldCls} value={draft.customerProblem}
                    onChange={(ev) => setDraft({ ...draft, customerProblem: ev.target.value })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-body text-[12px] font-semibold text-fg">Desired outcome</span>
                  <textarea rows={3} className={fieldCls} value={draft.desiredOutcome}
                    onChange={(ev) => setDraft({ ...draft, desiredOutcome: ev.target.value })} />
                </label>
              </>}>
              {e.customerProblem
                ? <p className="font-body text-[13.5px] leading-relaxed text-fg-muted">{e.customerProblem}</p>
                : <Empty>Not written yet — what is wrong at the client?</Empty>}
            </Section>

            {!isOpen("problem") && (
              <section className="flex flex-col gap-2">
                <h2 className="font-body text-[13px] font-semibold text-fg">Desired outcome</h2>
                {e.desiredOutcome
                  ? <p className="font-body text-[13.5px] leading-relaxed text-fg-muted">{e.desiredOutcome}</p>
                  : <Empty>Not written yet — what does &ldquo;working&rdquo; look like?</Empty>}
              </section>
            )}

            {shows("phrases") && (
            <Section title="How clients describe the need" canEdit={canEdit} editing={isOpen("phrases")} busy={busy}
              onEdit={() => open("phrases")} onCancel={cancel}
              onSave={() => void save({ clientPhrases: draft.clientPhrases })}
              form={
                <label className="flex flex-col gap-1">
                  <span className="font-body text-[12px] font-semibold text-fg">One per line</span>
                  <span className="-mt-1 font-body text-[11.5px] text-fg-subtle">The client&rsquo;s own words. Search reads these.</span>
                  <textarea rows={Math.max(3, draft.clientPhrases.length + 1)} className={fieldCls}
                    value={draft.clientPhrases.join("\n")}
                    onChange={(ev) => setDraft({ ...draft, clientPhrases: ev.target.value.split("\n") })} />
                </label>}>
              {e.clientPhrases.length ? <ClientPhrases phrases={e.clientPhrases} /> : <Empty>None recorded.</Empty>}
            </Section>
            )}

            {shows("audience") && (
            <Section title="Who it is for" canEdit={canEdit} editing={isOpen("audience")} busy={busy}
              onEdit={() => open("audience")} onCancel={cancel}
              onSave={() => void save({ audience: draft.audience })}
              form={<>
                {([["buyer", "Typical buyer"], ["operationalOwner", "Operational owner"],
                   ["targetPopulation", "Target population"], ["contexts", "Typical contexts"]] as const).map(([k, label]) => (
                  <label key={k} className="flex flex-col gap-1">
                    <span className="font-body text-[12px] font-semibold text-fg">{label}</span>
                    <input className={fieldCls} value={draft.audience[k]}
                      onChange={(ev) => setDraft({ ...draft, audience: { ...draft.audience, [k]: ev.target.value } })} />
                  </label>
                ))}
              </>}>
              {Object.values(e.audience).some(Boolean) ? (
                <dl className="flex flex-col gap-1.5">
                  {([["Typical buyer", e.audience.buyer], ["Operational owner", e.audience.operationalOwner],
                     ["Target population", e.audience.targetPopulation], ["Typical contexts", e.audience.contexts]] as const)
                    .filter(([, v]) => v).map(([label, v]) => (
                      <div key={label} className="flex flex-wrap gap-x-2 font-body text-[13px]">
                        <dt className="shrink-0 text-fg-subtle">{label}:</dt>
                        <dd className="text-fg-muted">{v}</dd>
                      </div>
                    ))}
                </dl>
              ) : <Empty>Not defined yet.</Empty>}
            </Section>
            )}

            {/* Products and capabilities are one idea — which product this runs
                on, and what inside it does the work. They were split across the
                two columns, so neither read as an answer. */}
            {shows("capabilities") && (
            <Section title="What Lumofy enables" canEdit={canEdit} editing={isOpen("capabilities")} busy={busy}
              onEdit={() => open("capabilities")} onCancel={cancel}
              onSave={() => void save({ capabilities: draft.capabilities, products: draft.products })}
              form={<>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="font-body text-[12px] font-semibold text-fg">Lumofy products</legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {PRODUCTS.map((p) => {
                      const on = draft.products.includes(p);
                      return (
                        <button key={p} type="button" aria-pressed={on}
                          onClick={() => setDraft({ ...draft, products: on ? draft.products.filter((x) => x !== p) : [...draft.products, p as Product] })}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                            on ? "border-sirius bg-accent-soft font-medium text-sirius" : "border-border text-fg-muted hover:border-sirius")}>
                          {on && <Check size={10} strokeWidth={3} />} {p}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <span className="font-body text-[11.5px] text-fg-subtle">
                  The capability, and what it does for this use case specifically.
                </span>
                {draft.capabilities.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <input className={cn(fieldCls, "max-w-[190px] flex-1")} placeholder="Capability" value={c.name}
                      onChange={(ev) => setDraft({ ...draft, capabilities: draft.capabilities.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) })} />
                    <input className={cn(fieldCls, "flex-[2]")} placeholder="Role in the use case" value={c.role}
                      onChange={(ev) => setDraft({ ...draft, capabilities: draft.capabilities.map((x, j) => j === i ? { ...x, role: ev.target.value } : x) })} />
                    <button type="button" aria-label="Remove capability"
                      onClick={() => setDraft({ ...draft, capabilities: draft.capabilities.filter((_, j) => j !== i) })}
                      className="rounded-lg border border-border p-2 text-fg-subtle hover:text-[#B23A57]"><X size={12} /></button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => setDraft({ ...draft, capabilities: [...draft.capabilities, { name: "", role: "" }] })}
                  className="inline-flex w-fit items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
                  <Plus size={11} /> Add capability
                </button>
              </>}>
              {e.products.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {e.products.map((p) => (
                    <span key={p} className="rounded-full border border-sirius/30 bg-accent-soft px-2.5 py-0.5 font-body text-[12px] font-medium text-sirius">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {/* Two shapes, because the content has two shapes. The Definition
                  Library states capabilities as plain sentences; earlier
                  hand-written entries pair a name with its role here. A table
                  with an empty right-hand column would look broken, so a
                  role-less list renders as a list. */}
              {e.capabilities.length === 0 ? (
                <Empty>No capabilities listed.</Empty>
              ) : e.capabilities.some((c) => c.role) ? (
                <div className="overflow-hidden rounded-lg border border-border-subtle">
                  <table className="w-full border-collapse">
                    <caption className="sr-only">Capabilities and their role in this use case</caption>
                    <tbody>
                      {e.capabilities.map((c, i) => (
                        <tr key={i} className="border-b border-border-subtle last:border-0">
                          <th scope="row" className="w-[38%] px-3 py-2 text-left align-top font-body text-[12.5px] font-semibold text-fg">{c.name}</th>
                          <td className="px-3 py-2 font-body text-[12.5px] text-fg-muted">{c.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {e.capabilities.map((c, i) => (
                    <li key={i} className="flex gap-2.5 font-body text-[13px] leading-relaxed text-fg-muted">
                      <span aria-hidden className="mt-[9px] size-[3px] shrink-0 rounded-full bg-fg-subtle" />
                      <span>{c.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            )}

            {shows("indicators") && (
            <Section title="Success indicators" canEdit={canEdit} editing={isOpen("indicators")} busy={busy}
              onEdit={() => open("indicators")} onCancel={cancel}
              onSave={() => void save({ successIndicators: draft.successIndicators })}
              form={
                <label className="flex flex-col gap-1">
                  <span className="font-body text-[12px] font-semibold text-fg">One per line</span>
                  <span className="-mt-1 font-body text-[11.5px] text-fg-subtle">
                    Recommended indicators for this use case. No data connection needed yet.
                  </span>
                  <textarea rows={Math.max(3, draft.successIndicators.length + 1)} className={fieldCls}
                    value={draft.successIndicators.join("\n")}
                    onChange={(ev) => setDraft({ ...draft, successIndicators: ev.target.value.split("\n") })} />
                </label>}>
              {e.successIndicators.length ? (
                <ul className="flex flex-col gap-1">
                  {e.successIndicators.map((s, i) => (
                    <li key={i} className="flex gap-2.5 font-body text-[13px] leading-relaxed text-fg-muted">
                      <span aria-hidden className="mt-[9px] size-[3px] shrink-0 rounded-full bg-fg-subtle" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>None recorded.</Empty>}
            </Section>
            )}

            {shows("related") && (
            <Section title="How this differs from related use cases" canEdit={canEdit} editing={isOpen("related")} busy={busy}
              onEdit={() => open("related")} onCancel={cancel}
              onSave={() => void save({ relatedUseCases: draft.relatedUseCases })}
              form={<>
                {draft.relatedUseCases.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-start gap-2">
                    <select className={cn(fieldCls, "max-w-[210px] flex-1")} value={r.id}
                      onChange={(ev) => setDraft({ ...draft, relatedUseCases: draft.relatedUseCases.map((x, j) => j === i ? { ...x, id: ev.target.value } : x) })}>
                      {allEntries.filter((u) => !u.retired && u.id !== option.id).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                    <input className={cn(fieldCls, "flex-[2]")} placeholder="how this differs" value={r.distinction}
                      onChange={(ev) => setDraft({ ...draft, relatedUseCases: draft.relatedUseCases.map((x, j) => j === i ? { ...x, distinction: ev.target.value } : x) })} />
                    <button type="button" aria-label="Remove related use case"
                      onClick={() => setDraft({ ...draft, relatedUseCases: draft.relatedUseCases.filter((_, j) => j !== i) })}
                      className="rounded-lg border border-border p-2 text-fg-subtle hover:text-[#B23A57]"><X size={12} /></button>
                  </div>
                ))}
                <button type="button"
                  onClick={() => {
                    const first = allEntries.find((u) => !u.retired && u.id !== option.id && !draft.relatedUseCases.some((r) => r.id === u.id));
                    if (first) setDraft({ ...draft, relatedUseCases: [...draft.relatedUseCases, { id: first.id, distinction: "" }] });
                  }}
                  className="inline-flex w-fit items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius">
                  <Plus size={11} /> Add one
                </button>
              </>}>
              {e.relatedUseCases.length ? (
                <ul className="flex flex-col gap-2">
                  {e.relatedUseCases.map((r) => {
                    const other = allEntries.find((u) => u.id === r.id);
                    if (!other) return null;
                    return (
                      <li key={r.id} className="font-body text-[13px] leading-relaxed text-fg-muted">
                        <Link href={`${basePath}/${r.id}`} className="font-semibold text-sirius underline decoration-dotted underline-offset-2">
                          {other.label}
                        </Link>
                        {r.distinction && <> — {r.distinction}</>}
                      </li>
                    );
                  })}
                </ul>
              ) : <Empty>None recorded.</Empty>}
            </Section>
            )}

            {/* What is left to do, at the foot of what has been done — the
                status chip has already flagged it at the top, so this is the
                detail and the way to act on it, not a second warning. */}
            {(gaps.length > 0 || (canEdit && hiddenSections.length > 0)) && (
              <footer className="flex flex-col gap-2.5 border-t border-border-subtle pt-4">
                {gaps.length > 0 && (
                  <p className="font-body text-[12px] leading-relaxed text-[#8A6D12]">
                    <span className="font-semibold">
                      {reviewState(entry, today) === "overdue" ? "Review overdue" : "Still missing"}:
                    </span>{" "}
                    {gaps.join(" · ")}
                  </p>
                )}
                {/* The one fact from the old meta strip worth keeping, now
                    beside the rest of the governance rather than above the
                    definition. */}
                {e.updatedAt && (
                  <p className="font-body text-[11.5px] text-fg-subtle">
                    Last updated {shortDate(e.updatedAt)}
                    {e.updatedBy && <> by {e.updatedBy}</>}
                    {e.lastReviewedAt && <> · reviewed {shortDate(e.lastReviewedAt)}</>}
                  </p>
                )}
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {hiddenSections.map((s) => (
                      <button key={s.id} onClick={() => open(s.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                        <Plus size={11} /> {s.short}
                      </button>
                    ))}
                    <Link href={`${basePath}/write`}
                      className="font-body text-[12px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-sirius">
                      Write these across the library →
                    </Link>
                  </div>
                )}
              </footer>
            )}
        </div>
    </div>
  );
}
