"use client";

/* Filling the library.

   COLUMN-WISE, NOT RECORD-WISE. The detail page edits one use case at a time,
   which is right for maintenance and wrong for the initial write-up: 26 use
   cases x 7 sections is 182 separate open-type-save trips, and you never see
   two definitions at once, so voice, length and specificity drift. The stated
   goal is defining use cases CONSISTENTLY, and consistency is a comparison
   problem — it needs the answers side by side.

   So this screen picks ONE field and shows it for the whole library, stacked.
   You write 26 customer problems in one sitting, in one mode of thinking, with
   the previous 25 visible above. Drift is obvious while you can still fix it.

   Only the fields that benefit from comparison are here — prose, phrasing and
   products. Audience and capabilities are structured multi-part records that
   would turn each row into a form; they stay on the detail page.

   Autosaves on blur, per row. No page reload, no Save button to forget: a
   long writing session must never lose a paragraph to a mis-click. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCTS, blankEntry, type UseCaseEntry, type Product } from "@/lib/use-case-library";
import type { ResolvedUseCase } from "@/lib/use-case-overlay";
import { saveUseCaseSectionAction, type SectionPatch } from "@/app/(app)/use-cases/actions";

type FieldKey =
  | "oneLiner" | "customerProblem" | "desiredOutcome"
  | "clientPhrases" | "successIndicators" | "products";

interface FieldDef {
  key: FieldKey;
  label: string;
  /** The question the writer is answering, in the second person. */
  prompt: string;
  kind: "line" | "para" | "lines" | "products";
  rows?: number;
  placeholder?: string;
}

const FIELDS: FieldDef[] = [
  { key: "customerProblem", label: "Customer problem", kind: "para", rows: 4,
    prompt: "What is wrong at the client, in one paragraph. Written before Lumofy is mentioned.",
    placeholder: "Organisations need to… but…" },
  { key: "desiredOutcome", label: "Desired outcome", kind: "para", rows: 3,
    prompt: "What “working” looks like once this is in place.",
    placeholder: "Get… so that…" },
  { key: "oneLiner", label: "One-line definition", kind: "line",
    prompt: "How the team says it out loud. Overrides the published summary.",
    placeholder: "Leave blank to keep the published summary" },
  { key: "clientPhrases", label: "How clients describe it", kind: "lines", rows: 3,
    prompt: "The client’s own words, one per line. Search reads these, so a CSM can match a call to a use case.",
    placeholder: "We need a certain number of certified staff…" },
  { key: "successIndicators", label: "Success indicators", kind: "lines", rows: 3,
    prompt: "What good looks like, one per line. Statements are fine — no data connection needed yet.",
    placeholder: "Pass rate ↑" },
  { key: "products", label: "Lumofy products", kind: "products",
    prompt: "Which products this use case runs on." },
];

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus:border-sirius focus:ring-2 focus:ring-sirius/15";

/** Is this field written on this entry? Drives the counters and "only blanks". */
function filled(e: UseCaseEntry, key: FieldKey): boolean {
  const v = e[key];
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" ? v.trim().length > 0 : !!v;
}

type RowState = "idle" | "saving" | "saved" | "error";

export function UseCaseWriter({ options, entries, groups, canEdit, basePath = "/use-cases" }: {
  options: ResolvedUseCase[];
  entries: Record<string, UseCaseEntry>;
  groups: { id: string; label: string }[];
  canEdit: boolean;
  basePath?: string;
}) {
  const [fieldKey, setFieldKey] = useState<FieldKey>("customerProblem");
  const [onlyBlanks, setOnlyBlanks] = useState(false);

  /* Working copy. The server component that fed this page won't re-render
     between saves — deliberately, a refresh mid-session would move rows under
     the cursor — so the counters read from here. */
  const [values, setValues] = useState<Record<string, UseCaseEntry>>(() => {
    const out: Record<string, UseCaseEntry> = {};
    for (const o of options) out[o.id] = entries[o.id] ?? blankEntry(o.id);
    return out;
  });
  const [state, setState] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const field = FIELDS.find((f) => f.key === fieldKey)!;
  const live = useMemo(() => options.filter((o) => !o.retired), [options]);

  /* Counts persisted work, not typed work. The box keeps what you typed after
     a failed save so nothing is lost, but a row that didn't reach the server
     must not be counted as written — this screen's only job is saying what is
     still outstanding. */
  const countWritten = (key: FieldKey) =>
    live.filter((o) => filled(values[o.id], key) && state[o.id] !== "error").length;
  const written = countWritten(fieldKey);

  /* Frozen when the filter is toggled on: rows must not vanish from under the
     cursor the instant you finish typing in one. */
  const [frozen, setFrozen] = useState<Set<string> | null>(null);
  const rows = frozen ? live.filter((o) => frozen.has(o.id)) : live;

  function toggleBlanks() {
    if (onlyBlanks) { setFrozen(null); setOnlyBlanks(false); return; }
    setFrozen(new Set(live.filter((o) => !filled(values[o.id], fieldKey)).map((o) => o.id)));
    setOnlyBlanks(true);
  }
  function pickField(k: FieldKey) {
    // Row state is per-row, not per-field: carrying a failed save across a
    // field switch would wrongly mark the next field's row as unwritten.
    setFieldKey(k); setOnlyBlanks(false); setFrozen(null); setErrors({}); setState({});
  }

  function patchFor(id: string): SectionPatch {
    const v = values[id];
    switch (fieldKey) {
      case "oneLiner": return { oneLiner: v.oneLiner };
      case "customerProblem": return { customerProblem: v.customerProblem };
      case "desiredOutcome": return { desiredOutcome: v.desiredOutcome };
      case "clientPhrases": return { clientPhrases: v.clientPhrases };
      case "successIndicators": return { successIndicators: v.successIndicators };
      case "products": return { products: v.products };
    }
  }

  /** The write itself. Takes the patch explicitly rather than reading state,
   *  so a caller that has just computed a new value can't send a stale one. */
  async function push(id: string, patch: SectionPatch) {
    setDirty((d) => ({ ...d, [id]: false }));
    setState((s) => ({ ...s, [id]: "saving" }));
    const r = await saveUseCaseSectionAction(id, patch);
    if (!r.ok) {
      setState((s) => ({ ...s, [id]: "error" }));
      setErrors((e) => ({ ...e, [id]: r.error ?? "Couldn't save." }));
      setDirty((d) => ({ ...d, [id]: true }));   // still unsaved — keep it flagged
      return;
    }
    setErrors((e) => { const n = { ...e }; delete n[id]; return n; });
    setState((s) => ({ ...s, [id]: "saved" }));
    setTimeout(() => setState((s) => (s[id] === "saved" ? { ...s, [id]: "idle" } : s)), 1800);
  }

  /** Blur handler — the value in state is settled by the time focus leaves. */
  const commit = (id: string) => { if (dirty[id]) void push(id, patchFor(id)); };

  function set(id: string, next: Partial<UseCaseEntry>) {
    setValues((v) => ({ ...v, [id]: { ...v[id], ...next } }));
    setDirty((d) => ({ ...d, [id]: true }));
  }

  const groupLabel = (o: ResolvedUseCase) =>
    o.groups.map((g) => groups.find((x) => x.id === g)?.label).filter(Boolean).join(" · ");

  if (!canEdit) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 font-body text-[13px] text-fg-muted">
        Writing definitions is limited to admins.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={basePath}
        className="inline-flex w-fit items-center gap-1 font-body text-[12.5px] font-medium text-fg-muted transition-colors hover:text-sirius">
        <ChevronLeft size={13} /> Use Cases
      </Link>

      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-fg">
          Write definitions
        </h1>
        <p className="max-w-[70ch] font-body text-[13.5px] leading-relaxed text-fg-muted">
          One field at a time, down the whole library — so you can see the other answers
          while you write and keep them consistent. Every box saves on its own when you
          click away.
        </p>
      </header>

      {/* Field picker. Each carries its own count, so the shape of the work is
          visible before choosing where to spend an hour. */}
      <div className="flex flex-wrap gap-1.5">
        {FIELDS.map((f) => {
          const n = countWritten(f.key);
          const on = f.key === fieldKey;
          const done = n === live.length;
          return (
            <button key={f.key} onClick={() => pickField(f.key)} aria-pressed={on}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-body text-[12.5px] transition-colors",
                on ? "border-sirius bg-accent-soft font-semibold text-sirius"
                   : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
              {f.label}
              <span className={cn("tabular text-[11.5px]",
                on ? "text-sirius/70" : done ? "text-[#1F9D63]" : "text-fg-subtle")}>
                {n}/{live.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-b border-border-subtle pb-3">
        <p className="max-w-[75ch] font-body text-[13px] leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg">{field.label}.</span> {field.prompt}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-body text-[12px] text-fg-subtle">
            <span className="tabular font-semibold text-fg">{written}</span> of{" "}
            <span className="tabular">{live.length}</span> written
          </span>
          <button onClick={toggleBlanks}
            className={cn("rounded-full border px-2.5 py-1 font-body text-[12px] font-medium transition-colors",
              onlyBlanks ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
            {onlyBlanks ? `Showing ${rows.length} blank` : "Only blanks"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-center font-body text-[13px] text-fg-muted">
          Nothing blank — {field.label.toLowerCase()} is written for all {live.length}.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((o) => {
            const v = values[o.id];
            const st = state[o.id] ?? "idle";
            return (
              <li key={o.id}
                className="grid grid-cols-1 gap-2 border-b border-border-subtle py-4 last:border-0 md:grid-cols-[minmax(0,210px)_minmax(0,1fr)] md:gap-5">
                <div className="flex flex-col gap-0.5 md:pt-1.5">
                  <Link href={`${basePath}/${o.id}`}
                    className="font-body text-[13px] font-semibold leading-snug text-fg hover:text-sirius">
                    {o.label}
                  </Link>
                  <span className="font-body text-[11.5px] leading-snug text-fg-subtle">{groupLabel(o)}</span>
                  <span className="mt-0.5 h-4 font-body text-[11.5px]">
                    {st === "saving" && <span className="inline-flex items-center gap-1 text-fg-subtle"><Loader2 size={10} className="animate-spin" /> Saving</span>}
                    {st === "saved" && <span className="inline-flex items-center gap-1 text-[#1F9D63]"><Check size={10} strokeWidth={3} /> Saved</span>}
                    {st === "error" && <span className="inline-flex items-center gap-1 text-[#B23A57]"><AlertTriangle size={10} /> Not saved</span>}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  {field.kind === "para" && (
                    <textarea rows={field.rows ?? 3} className={inputCls} placeholder={field.placeholder}
                      value={fieldKey === "customerProblem" ? v.customerProblem : v.desiredOutcome}
                      onChange={(e) => set(o.id, fieldKey === "customerProblem"
                        ? { customerProblem: e.target.value } : { desiredOutcome: e.target.value })}
                      onBlur={() => void commit(o.id)} />
                  )}

                  {field.kind === "line" && (
                    <input className={inputCls} placeholder={field.placeholder}
                      value={v.oneLiner}
                      onChange={(e) => set(o.id, { oneLiner: e.target.value })}
                      onBlur={() => void commit(o.id)} />
                  )}

                  {field.kind === "lines" && (
                    <textarea rows={field.rows ?? 3} className={inputCls} placeholder={field.placeholder}
                      value={(fieldKey === "clientPhrases" ? v.clientPhrases : v.successIndicators).join("\n")}
                      onChange={(e) => {
                        const next = e.target.value.split("\n");
                        set(o.id, fieldKey === "clientPhrases" ? { clientPhrases: next } : { successIndicators: next });
                      }}
                      onBlur={() => void commit(o.id)} />
                  )}

                  {field.kind === "products" && (
                    <div className="flex flex-wrap gap-1.5">
                      {PRODUCTS.map((p) => {
                        const on = v.products.includes(p);
                        return (
                          <button key={p} type="button" aria-pressed={on}
                            onClick={() => {
                              // A chip has no blur to save on, so it writes
                              // immediately — with the value computed here, not
                              // read back out of state that hasn't re-rendered.
                              const next = on ? v.products.filter((x) => x !== p) : [...v.products, p as Product];
                              set(o.id, { products: next });
                              void push(o.id, { products: next });
                            }}
                            className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-[12px] transition-colors",
                              on ? "border-sirius bg-accent-soft font-medium text-sirius"
                                 : "border-border text-fg-muted hover:border-sirius hover:text-sirius")}>
                            {on && <Check size={10} strokeWidth={3} />} {p}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {errors[o.id] && (
                    <p role="alert" className="font-body text-[11.5px] text-[#B23A57]">{errors[o.id]}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
