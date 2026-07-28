"use client";

/* One use case, on its own page.

   Header carries identity and state once — name, category, status, value
   proposition, adoption, owner, last reviewed — and nothing below repeats it.
   Tabs group the rest by the question being asked rather than by which table a
   field came from.

   Overview and Accounts are built here. Delivery Blueprint and Evidence are
   declared as tabs and say plainly that they are not built yet, rather than
   being hidden: a CSM should know the shape of the thing they are filling in,
   and an empty tab that announces itself is more honest than a missing one.

   ARR IS ACCOUNT ARR throughout — the contract value of accounts carrying this
   use case, not revenue it produced. There is no attribution data, and the
   label never implies otherwise. */

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil, Loader2, X, Check, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABEL, STAKEHOLDER_ROLES, type StakeholderRole } from "@/lib/stakeholders/profile";
import { MODULES, type UseCaseEntry, type Module } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import type { AccountRef } from "@/lib/use-case-adoption";
import { STATUS_LABEL, STATUS_TONE, STATUS_HELP, completenessLabel, type DefinitionStatus } from "@/lib/use-case-status";
import { saveUseCaseEntryAction } from "@/app/(app)/use-cases/actions";

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`;

const fieldCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "blueprint", label: "Delivery Blueprint" },
  { id: "accounts", label: "Accounts" },
  { id: "evidence", label: "Evidence & Resources" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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

function EditField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[12px] font-semibold text-fg">{label}</span>
      {hint && <span className="-mt-1 font-body text-[11.5px] text-fg-subtle">{hint}</span>}
      {children}
    </label>
  );
}

const blank = (id: string): UseCaseEntry => ({
  id, goal: "", soundsLike: [], delivers: [], confusedWith: [], watchFor: [],
  modules: [], stakeholderRoles: [], sourceUrl: null,
});

/** A tab that exists in the model but isn't built. Named rather than hidden, so
 *  the shape of the record is visible and nobody assumes it is missing. */
function NotBuiltYet({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
      <p className="font-body text-[13.5px] font-semibold text-fg">{title} isn&rsquo;t built yet</p>
      <p className="mx-auto mt-1 max-w-md font-body text-[12.5px] leading-relaxed text-fg-muted">{blurb}</p>
    </div>
  );
}

export function UseCaseDetail({
  option, entry, allEntries, groups, status, canEdit, confirmed, declaredOnly, accountArr, updatedAt, updatedBy,
}: {
  option: ResolvedUseCase;
  entry: UseCaseEntry | undefined;
  allEntries: ResolvedUseCase[];
  groups: { id: string; label: string; blurb: string }[];
  status: DefinitionStatus;
  canEdit: boolean;
  confirmed: AccountRef[];
  declaredOnly: AccountRef[];
  accountArr: number;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UseCaseEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = [...confirmed, ...declaredOnly];

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null);
    const r = await saveUseCaseEntryAction(draft.id, {
      goal: draft.goal, soundsLike: draft.soundsLike, delivers: draft.delivers,
      confusedWith: draft.confusedWith, watchFor: draft.watchFor,
      modules: draft.modules, stakeholderRoles: draft.stakeholderRoles, sourceUrl: draft.sourceUrl,
    });
    setBusy(false);
    // The drawer stays open on failure so nothing typed is lost.
    if (!r.ok) { setError(r.error ?? "Couldn't save."); return; }
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/use-cases"
        className="inline-flex w-fit items-center gap-1 font-body text-[12.5px] font-medium text-fg-muted transition-colors hover:text-sirius">
        <ChevronLeft size={13} /> Use Cases
      </Link>

      {/* ── header: identity and state, stated once ─────────────────── */}
      <header className="flex flex-col gap-2.5 border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-sirius">
            {option.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ")}
          </span>
          <span title={STATUS_HELP[status]}
            className={cn("rounded-full border px-2 py-0.5 font-body text-[11px] font-medium", STATUS_TONE[status])}>
            {STATUS_LABEL[status]}
          </span>
          {option.unresolved && (
            <span className="rounded-full border border-[#C99A14]/30 bg-[#8A6D12]/5 px-2 py-0.5 font-body text-[11px] font-medium text-[#8A6D12]">
              Outside published set
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 dir="auto" className="font-display text-[27px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            {option.label}
          </h1>
          {canEdit && !editing && (
            <button onClick={() => { setDraft(entry ? { ...entry } : blank(option.id)); setEditing(true); setError(null); }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <Pencil size={12} /> Edit definition
            </button>
          )}
        </div>

        <p className="max-w-[64ch] font-body text-[15.5px] leading-[1.6] text-fg">{entry?.goal || option.summary}</p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[12px] text-fg-subtle">
          <span className="tabular">
            {accounts.length === 0 ? "No accounts yet" : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
          </span>
          {accountArr > 0 && (
            <span className="tabular" title="Total contract value of the accounts carrying this use case — not revenue attributed to it">
              {money(accountArr)} account ARR
            </span>
          )}
          {updatedAt && <span>Updated {new Date(updatedAt).toLocaleDateString()}{updatedBy ? ` by ${updatedBy}` : ""}</span>}
        </p>
      </header>

      <nav role="tablist" aria-label="Use case sections" className="flex flex-wrap gap-1 border-b border-border-subtle">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-3 py-2 font-body text-[13px] font-medium transition-colors",
              tab === t.id ? "border-sirius text-sirius" : "border-transparent text-fg-muted hover:text-fg")}>
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-3 py-2 font-body text-[12.5px] text-[#B23A57]">
          {error}
        </p>
      )}

      {/* ── Overview ───────────────────────────────────────────────── */}
      {tab === "overview" && (editing && draft ? (
        <form className="flex max-w-[68ch] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <p className="font-body text-[12.5px] text-fg-subtle">
            The name and categories come from the taxonomy — change those from the library.
          </p>
          <EditField label="The goal" hint="One sentence: what the client is trying to achieve.">
            <textarea rows={2} className={fieldCls} value={draft.goal}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })} />
          </EditField>
          <EditField label="You'll hear it as" hint="The client's own words, one per line. Search reads this.">
            <textarea rows={Math.max(3, draft.soundsLike.length + 1)} className={fieldCls}
              placeholder={"every manager onboards differently\nit takes months before they're useful"}
              value={draft.soundsLike.join("\n")}
              onChange={(e) => setDraft({ ...draft, soundsLike: e.target.value.split("\n") })} />
          </EditField>
          <EditField label="What we deliver" hint="The artefacts, one per line.">
            <textarea rows={Math.max(3, draft.delivers.length + 1)} className={fieldCls}
              value={draft.delivers.join("\n")}
              onChange={(e) => setDraft({ ...draft, delivers: e.target.value.split("\n") })} />
          </EditField>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-body text-[12px] font-semibold text-fg">Often confused with</legend>
            <span className="-mt-1 font-body text-[11.5px] text-fg-subtle">
              Name the neighbour and how to tell them apart.
            </span>
            {draft.confusedWith.map((c, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <select className={cn(fieldCls, "max-w-[220px] flex-1")} value={c.id}
                  onChange={(e) => setDraft({ ...draft, confusedWith: draft.confusedWith.map((x, j) => j === i ? { ...x, id: e.target.value } : x) })}>
                  {allEntries.filter((u) => !u.retired && u.id !== draft.id).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
                <input className={cn(fieldCls, "flex-[2]")} placeholder="how to tell them apart" value={c.distinction}
                  onChange={(e) => setDraft({ ...draft, confusedWith: draft.confusedWith.map((x, j) => j === i ? { ...x, distinction: e.target.value } : x) })} />
                <button type="button" aria-label="Remove"
                  onClick={() => setDraft({ ...draft, confusedWith: draft.confusedWith.filter((_, j) => j !== i) })}
                  className="rounded-lg border border-border p-2 text-fg-subtle hover:text-[#B23A57]"><X size={12} /></button>
              </div>
            ))}
            <button type="button"
              onClick={() => {
                const first = allEntries.find((u) => !u.retired && u.id !== draft.id && !draft.confusedWith.some((c) => c.id === u.id));
                if (first) setDraft({ ...draft, confusedWith: [...draft.confusedWith, { id: first.id, distinction: "" }] });
              }}
              className="self-start rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              + Add one
            </button>
          </fieldset>

          <EditField label="Signs to watch" hint="Observable, one per line — no measurement programme required.">
            <textarea rows={Math.max(2, draft.watchFor.length + 1)} className={fieldCls}
              value={draft.watchFor.join("\n")}
              onChange={(e) => setDraft({ ...draft, watchFor: e.target.value.split("\n") })} />
          </EditField>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-body text-[12px] font-semibold text-fg">Modules</legend>
            <div className="flex flex-wrap gap-1.5">
              {MODULES.map((m) => {
                const on = draft.modules.includes(m);
                return (
                  <button key={m} type="button" aria-pressed={on}
                    onClick={() => setDraft({ ...draft, modules: on ? draft.modules.filter((x) => x !== m) : [...draft.modules, m as Module] })}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                      on ? "border-sirius bg-accent-soft font-medium text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                    {on && <Check size={10} strokeWidth={3} />} {m}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-body text-[12px] font-semibold text-fg">Who usually owns it</legend>
            <div className="flex flex-wrap gap-1.5">
              {STAKEHOLDER_ROLES.map((role) => {
                const on = draft.stakeholderRoles.includes(role);
                return (
                  <button key={role} type="button" aria-pressed={on}
                    onClick={() => setDraft({ ...draft, stakeholderRoles: on ? draft.stakeholderRoles.filter((r) => r !== role) : [...draft.stakeholderRoles, role as StakeholderRole] })}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                      on ? "border-sirius bg-accent-soft font-medium text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                    {on && <Check size={10} strokeWidth={3} />} {ROLE_LABEL[role]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <EditField label="Source" hint="The Notion page, so the fuller material is one click away.">
            <input className={fieldCls} placeholder="https://notion.so/…" value={draft.sourceUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value || null })} />
          </EditField>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setEditing(false); setDraft(null); setError(null); }}
              className="rounded-lg border border-border px-3 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex max-w-[68ch] flex-col gap-6">
          {!entry ? (
            <div className="rounded-xl border border-dashed border-border px-5 py-8">
              <p className="font-body text-[13.5px] font-semibold text-fg">This use case still needs a definition</p>
              <p className="mt-1 font-body text-[13px] leading-relaxed text-fg-muted">
                Add the customer problem, intended outcome and success measures to make it usable across the team.
              </p>
              {canEdit && (
                <button onClick={() => { setDraft(blank(option.id)); setEditing(true); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white">
                  <Pencil size={12} /> Complete definition
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="font-body text-[12px] text-fg-subtle">{completenessLabel(entry)}</p>

              {entry.soundsLike.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <Head>You&rsquo;ll hear it as</Head>
                  <ul className="flex flex-col gap-1">
                    {entry.soundsLike.map((t, i) => (
                      <li key={i} className="font-body text-[13.5px] italic leading-relaxed text-fg-muted">&ldquo;{t}&rdquo;</li>
                    ))}
                  </ul>
                </section>
              )}

              <Bullets title="What we deliver" items={entry.delivers} />

              {entry.confusedWith.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <Head>Often confused with</Head>
                  <ul className="flex flex-col gap-1.5">
                    {entry.confusedWith.map((c) => {
                      const other = allEntries.find((u) => u.id === c.id);
                      if (!other) return null;
                      return (
                        <li key={c.id} className="font-body text-[13.5px] leading-relaxed text-fg-muted">
                          <Link href={`/use-cases/${c.id}`} className="font-semibold text-sirius underline decoration-dotted underline-offset-2">
                            {other.label}
                          </Link>
                          {c.distinction && <> — {c.distinction}</>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <Bullets title="Signs to watch" items={entry.watchFor} />

              {(entry.modules.length > 0 || entry.stakeholderRoles.length > 0 || entry.sourceUrl) && (
                <section className="flex flex-col gap-1 border-t border-border-subtle pt-4 font-body text-[12.5px] text-fg-subtle">
                  {entry.modules.length > 0 && <p>Runs on {entry.modules.join(" · ")}</p>}
                  {entry.stakeholderRoles.length > 0 && <p>Usually owned by {entry.stakeholderRoles.map((r) => ROLE_LABEL[r]).join(" · ")}</p>}
                  {entry.sourceUrl && (
                    <p><a href={entry.sourceUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sirius underline decoration-dotted underline-offset-2">
                      Full page in Notion <ExternalLink size={11} />
                    </a></p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      ))}

      {/* ── Accounts ───────────────────────────────────────────────── */}
      {tab === "accounts" && (
        accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <p className="font-body text-[13.5px] font-semibold text-fg">No accounts are recorded against this</p>
            <p className="mx-auto mt-1 max-w-md font-body text-[12.5px] text-fg-muted">
              Accounts appear here when a CSM confirms the use case on the client profile, or a deal declares it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 font-body text-[12.5px] leading-relaxed text-fg-muted">
              <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
              <span>
                <b className="font-semibold text-fg">Account ARR</b> is each account&rsquo;s full contract value, not revenue
                attributed to this use case. Implementation stage, objective and progress aren&rsquo;t tracked yet.
              </span>
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] border-collapse">
                <caption className="sr-only">Accounts recorded against this use case</caption>
                <thead>
                  <tr className="border-b border-border bg-bg-muted/40 text-left">
                    {["Account", "How it was recorded", "Owner", "Account ARR"].map((h) => (
                      <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmed.map((a) => (
                    <tr key={a.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-muted/40">
                      <td className="px-3 py-2.5"><Link href={`/clients/${a.id}`} dir="auto" className="font-body text-[13px] font-semibold text-fg hover:text-sirius">{a.name}</Link></td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">Confirmed by CS</td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{a.csm ?? "—"}</td>
                      <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg">{money(a.arr)}</td>
                    </tr>
                  ))}
                  {declaredOnly.map((a) => (
                    <tr key={a.id} className="border-b border-border-subtle last:border-0 hover:bg-bg-muted/40">
                      <td className="px-3 py-2.5"><Link href={`/clients/${a.id}`} dir="auto" className="font-body text-[13px] text-fg-muted hover:text-sirius">{a.name}</Link></td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-subtle">Declared on a deal, not confirmed</td>
                      <td className="px-3 py-2.5 font-body text-[12px] text-fg-muted">{a.csm ?? "—"}</td>
                      <td className="tabular px-3 py-2.5 font-body text-[12.5px] text-fg-muted">{money(a.arr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === "blueprint" && (
        <NotBuiltYet title="Delivery Blueprint"
          blurb="The reusable implementation framework — phases, activities, owners, inputs and outputs. Nothing in the repository models it yet, so it is declared here rather than faked." />
      )}
      {tab === "evidence" && (
        <NotBuiltYet title="Evidence & Resources"
          blurb="Client examples, case studies, templates and proposal language, each with a verification state. Attachments already exist per client; this needs its own store so a resource can belong to a use case rather than an account." />
      )}
    </div>
  );
}
