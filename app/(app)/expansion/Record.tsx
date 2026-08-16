"use client";

/* =========================================================================
   Expansion — the record.

   A wide overlay, not a side drawer. A narrow rail forces every field into a
   stacked list and the whole thing reads as a form; two columns let the work
   (next step, updates, activity) sit beside the facts (money, dates, account).
   The board stays visible behind it, so this is still a preview, not a page.

   Notes and the activity log are loaded HERE, on open, rather than shipped with
   every card on the board — a board of forty opportunities does not need forty
   histories in its payload to render four columns.
   ========================================================================= */

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { daysSince, dueState, isClosed, momentum, primaryStep } from "@/lib/expansion/attention";
import { fmt, fmtShort, moneyFull } from "@/lib/expansion/format";
import {
  CONFIDENCE_LABEL, OUTCOME_LABEL, STAGES,
  type ActivityEntry, type Confidence, type ExpansionAccount, type ExpansionPerson,
  type Opportunity, type OpportunityNote, type Stage,
} from "@/lib/expansion/types";
import {
  addNoteAction, deleteOpportunityAction, loadOpportunityDetailAction, setArrRecordedAction,
  updateOpportunityDetailsAction,
} from "./actions";
import { EditSheet } from "./dialogs";
import {
  Btn, DUE_TONE, Line, MOMENTUM_DOT, MOMENTUM_TEXT, OutcomeChip, OwnerPicker, TypeChip,
  field, type EditHandlers,
} from "./ui";

export function OpportunityRecord({
  o, today, people, canWrite, canDelete, accounts, onClose, onMove, onClosing, edit, onChanged, onError,
}: {
  o: Opportunity;
  today: string;
  people: ExpansionPerson[];
  canWrite: boolean;
  canDelete: boolean;
  accounts: ExpansionAccount[];
  onClose: () => void;
  onMove: (s: Stage) => void;
  onClosing: () => void;
  edit: EditHandlers;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const acc = accounts.find((a) => a.id === o.clientId) ?? null;
  const due = dueState(o, today), mo = momentum(o, today);
  const closed = isClosed(o);
  const [, startTransition] = useTransition();

  const [history, setHistory] = useState<{ notes: OpportunityNote[]; history: ActivityEntry[] } | null>(null);
  const [addingStep, setAddingStep] = useState(false);
  const [stepText, setStepText] = useState("");
  const [stepDue, setStepDue] = useState("");
  const [note, setNote] = useState("");
  const [justPosted, setJustPosted] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptDue, setPromptDue] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      const detail = await loadOpportunityDetailAction(o.id);
      if (detail) setHistory({ notes: detail.notes, history: detail.history });
    });
  }, [o.id]);

  /* Reload on `lastActivityAt`, not just on open: every mutation stamps it, so
     this is the one value that changes whenever there is a new line to show.
     Without it the timeline silently describes the opportunity as it was when
     the overlay opened, while the fields above it are already updated. */
  useEffect(() => { load(); }, [load, o.lastActivityAt]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { onError(res.error ?? "That didn't save."); return; }
      after?.();
      load();
      onChanged();
    });

  const latestNote = history?.notes[0] ?? o.latestNote;
  const steps = [...o.nextSteps].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-cosmos/35 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[960px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">

        {/* Header — what it is, what it is worth, where it stands */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-fg-subtle">{o.accountName}</div>
              <h2 className="mt-0.5 font-display text-[20px] font-semibold leading-tight tracking-tight text-fg">{o.name}</h2>
              {o.description && <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-fg-muted">{o.description}</p>}
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-tight text-fg">
                {moneyFull(closed && o.outcome === "won" ? o.finalArr : o.expectedArr, o.currency)}
              </div>
              <div className="mt-1.5 text-[11px] text-fg-subtle">
                {closed && o.outcome === "won" ? "Final ARR" : closed ? "Potential ARR" : "ARR"}
              </div>
            </div>
            {canWrite && (
              <button onClick={() => setEditing(true)} title="Edit the details"
                className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-fg-muted transition hover:bg-bg-subtle hover:text-fg">
                Edit
              </button>
            )}
            <button onClick={onClose} className="-mr-1 shrink-0 rounded-md px-1.5 py-0.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg" aria-label="Close">✕</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <TypeChip o={o} />
            {closed && o.outcome && <OutcomeChip outcome={o.outcome} />}
            {!closed && mo.label && (
              <span className={cn("inline-flex items-center gap-1.5 rounded border border-border-subtle px-1.5 py-0.5 text-[10px]", MOMENTUM_TEXT[mo.state])}>
                <span className={cn("size-1.5 rounded-full", MOMENTUM_DOT[mo.state])} />{mo.label}
              </span>
            )}
          </div>

          <StageStepper o={o} canWrite={canWrite} onMove={onMove} onClosing={onClosing} />
        </div>

        {/* Body — work on the left, facts on the right */}
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] overflow-hidden">
          <div className="min-h-0 overflow-y-auto px-6 py-4">
            {!closed && (
              <div className={cn("rounded-lg border px-3 py-2.5",
                due.state === "overdue" ? "border-danger/30 bg-danger-bg"
                  : due.state === "none" ? "border-warning/30 bg-warning-bg"
                    : "border-border bg-bg-subtle")}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                    Next step{steps.length > 1 ? ` · ${steps.length}` : ""}
                  </span>
                  <span className={cn("ml-auto text-[11px] tabular-nums", DUE_TONE[due.state])}>{due.label}</span>
                </div>

                <ul className="mt-2 space-y-2">
                  {steps.map((st, i) => (
                    <li key={st.id} className="flex items-start gap-2">
                      <button
                        disabled={!canWrite}
                        onClick={() => edit.completeStep(st.id)}
                        title="Mark done"
                        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-border-strong text-[9px] text-transparent transition hover:border-success hover:bg-success hover:text-white disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:bg-transparent">
                        ✓
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block leading-snug", i === 0 ? "text-[14px] text-fg" : "text-[13px] text-fg-muted")}>{st.text}</span>
                        <span className="text-[11px] tabular-nums text-fg-subtle">{fmt(st.dueDate)}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {canWrite && (addingStep ? (
                  <div className="mt-2 space-y-1.5">
                    <input autoFocus value={stepText} onChange={(e) => setStepText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") setAddingStep(false); }}
                      placeholder="What happens next" className={field} />
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)} className={cn(field, "w-[150px]")} />
                      <Btn primary disabled={!stepText.trim() || !stepDue}
                        onClick={() => {
                          edit.addStep(stepText.trim(), stepDue);
                          setStepText(""); setStepDue(""); setAddingStep(false);
                        }}>Add</Btn>
                      <Btn onClick={() => setAddingStep(false)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingStep(true)}
                    className="mt-2 rounded-md px-1 py-0.5 text-[12px] font-medium text-accent hover:bg-surface">
                    + Add {steps.length ? "another step" : "a next step"}
                  </button>
                ))}
              </div>
            )}

            {o.outcome === "won" && (
              <div className="rounded-lg border border-success/25 bg-success-bg/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <OutcomeChip outcome="won" />
                  {o.agreementType && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] capitalize text-fg-muted">{o.agreementType}</span>
                  )}
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px]",
                    o.arrRecorded ? "border-border text-fg-muted" : "border-warning/40 bg-warning-bg text-warning-fg")}>
                    {o.arrRecorded ? "ARR recorded" : "ARR not recorded"}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-fg-muted">
                  Confirmed by {o.confirmedBy ?? "—"} on {fmt(o.outcomeDate)}.
                </p>
                {/* The ledger is the source of truth for recorded ARR; this only
                    says the two have been reconciled. Nothing here writes to it. */}
                {canWrite && !o.arrRecorded && (
                  <Btn primary className="mt-2.5" onClick={() => run(() => setArrRecordedAction(o.id, true))}>
                    Mark ARR as recorded
                  </Btn>
                )}
                {canWrite && o.arrRecorded && (
                  <button onClick={() => run(() => setArrRecordedAction(o.id, false))}
                    className="mt-2.5 block text-[11px] text-fg-subtle hover:underline">
                    Not actually recorded
                  </button>
                )}
              </div>
            )}
            {(o.outcome === "lost" || o.outcome === "dropped") && (
              <div className="rounded-lg border border-border bg-bg-subtle px-4 py-3">
                <OutcomeChip outcome={o.outcome} />
                <p className="mt-2 text-[14px] text-fg">{o.closeReason}</p>
                {o.closeNote && <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{o.closeNote}</p>}
                <p className="mt-0.5 text-[12px] text-fg-subtle">Closed {fmt(o.outcomeDate)}</p>
              </div>
            )}

            <div className="mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Notes</div>

              {canWrite && !closed && !justPosted && (
                <div className="mt-2 flex items-start gap-1.5">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note"
                    className={cn(field, "resize-none")} />
                  <Btn primary disabled={!note.trim()}
                    onClick={() => run(() => addNoteAction(o.id, note.trim()), () => {
                      setNote(""); setJustPosted(true); setPromptText(""); setPromptDue("");
                    })}>
                    Add
                  </Btn>
                </div>
              )}

              {/* Writing down what happened is the moment you know what happens next. */}
              {canWrite && !closed && justPosted && (
                <div className="mt-2 rounded-lg border border-accent/40 bg-accent-soft/50 px-3 py-2.5">
                  <div className="text-[12px] font-medium text-fg">Note added. What happens next?</div>
                  {primaryStep(o) && (
                    <p className="mt-1 text-[11.5px] text-fg-muted">
                      Currently: {primaryStep(o)!.text} · {dueState(o, today).label.toLowerCase()}
                    </p>
                  )}
                  <input autoFocus value={promptText} onChange={(e) => setPromptText(e.target.value)}
                    placeholder={primaryStep(o) ? "Add another step" : "What happens next"}
                    className={cn(field, "mt-2")} />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input type="date" value={promptDue} onChange={(e) => setPromptDue(e.target.value)} className={cn(field, "w-[150px]")} />
                    <Btn primary disabled={!promptText.trim() || !promptDue}
                      onClick={() => { edit.addStep(promptText.trim(), promptDue); setJustPosted(false); }}>
                      Set next step
                    </Btn>
                    <Btn onClick={() => setJustPosted(false)}>{primaryStep(o) ? "Keep current" : "Skip"}</Btn>
                  </div>
                  {!primaryStep(o) && (
                    <p className="mt-1.5 text-[11px] text-warning-fg">Skipping leaves this flagged as needing attention.</p>
                  )}
                </div>
              )}

              {latestNote ? (
                <div className="mt-2 rounded-lg border border-border px-3.5 py-2.5">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{latestNote.body}</p>
                  <p className="mt-1.5 text-[11px] text-fg-subtle">{latestNote.authorName} · {fmt(latestNote.createdAt)}</p>
                </div>
              ) : <p className="mt-2 text-[12px] text-fg-subtle">No notes yet.</p>}

              {history && history.notes.length > 1 && (
                <ul className="mt-2 space-y-2">
                  {history.notes.slice(1).map((n) => (
                    <li key={n.id} className="rounded-lg border border-border-subtle px-3.5 py-2">
                      <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">{n.body}</p>
                      <p className="mt-1 text-[11px] text-fg-subtle">{n.authorName} · {fmt(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 pb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Activity</div>
              {history ? (
                <ol className="relative mt-2.5 space-y-2.5 pl-4">
                  <span className="absolute bottom-2 left-[3px] top-2 w-px bg-border" aria-hidden />
                  {history.history.map((h) => (
                    <li key={h.id} className="relative flex items-baseline gap-2">
                      <span className="absolute -left-4 top-1.5 size-[7px] rounded-full border-2 border-surface bg-border-strong" aria-hidden />
                      <span className="flex-1 text-[12.5px] text-fg-muted">
                        {h.what}
                        <span className="text-fg-subtle"> · {h.actorName}</span>
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{fmtShort(h.at)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-[12px] text-fg-subtle">Loading…</p>
              )}
            </div>
          </div>

          {/* Right rail — the account, then the facts */}
          <aside className="min-h-0 overflow-y-auto border-l border-border bg-bg-subtle/50 px-4 py-4">
            {acc && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Account</div>
                <div className="mt-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{acc.name}</span>
                    {acc.healthTier && (
                      <span
                        className="ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium"
                        style={acc.healthColor
                          ? { borderColor: `${acc.healthColor}59`, color: acc.healthColor, backgroundColor: `${acc.healthColor}14` }
                          : undefined}
                      >
                        {acc.healthTier}{acc.healthScore != null && ` ${Math.round(acc.healthScore)}`}
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 space-y-1 text-[12px]">
                    <Line k="Current ARR" v={moneyFull(acc.arr, acc.currency)} />
                    {acc.plan && <Line k="Plan" v={acc.plan} />}
                    {acc.since && <Line k="Client since" v={String(new Date(acc.since).getUTCFullYear())} />}
                  </dl>
                  <Link href={`/clients/${acc.id}`} className="mt-2 inline-block text-[11px] text-accent hover:underline">
                    Open client profile →
                  </Link>
                </div>
              </>
            )}

            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Details</div>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <Line k="Owner" v={
                  <span className="inline-flex items-center gap-1.5">
                    <OwnerPicker value={o.ownerEmail} name={o.ownerName} people={people}
                      canWrite={canWrite} onChange={edit.setOwner} />
                    <span className={o.ownerEmail ? "" : "text-warning-fg"}>{o.ownerName ?? "Unassigned"}</span>
                  </span>
                } />
                <Line k="Confidence" v={
                  canWrite ? (
                    <span className="flex gap-1">
                      {(["high", "medium", "low"] as Confidence[]).map((c) => (
                        <button key={c}
                          onClick={() => edit.setConfidence(o.confidence === c ? null : c)}
                          className={cn("rounded border px-1.5 py-0.5 text-[11px] transition",
                            o.confidence === c ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-subtle hover:bg-bg-subtle")}>
                          {CONFIDENCE_LABEL[c]}
                        </button>
                      ))}
                    </span>
                  ) : (o.confidence ? CONFIDENCE_LABEL[o.confidence] : "Not set")
                } />
                <Line k="Expected close" v={o.expectedCloseDate ? fmt(o.expectedCloseDate) : <span className="text-warning-fg">Not set</span>} />
                {o.proposalDate && <Line k="Proposal sent" v={fmt(o.proposalDate)} />}
                <Line k="Last activity" v={`${fmtShort(o.lastActivityAt)} · ${daysSince(o.lastActivityAt, today)}d ago`} />
                <Line k="Created" v={fmt(o.createdAt)} />
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {editing && (
        <EditSheet
          o={o}
          canDelete={canDelete}
          onCancel={() => setEditing(false)}
          onSave={(patch) => run(() => updateOpportunityDetailsAction(o.id, patch), () => setEditing(false))}
          /* Closes the whole record, not just the sheet: the thing it was
             showing no longer exists. */
          onDelete={() => run(() => deleteOpportunityAction(o.id), () => { setEditing(false); onClose(); })}
        />
      )}
    </div>
  );
}

/**
 * Where the opportunity is, and the way to move it.
 *
 * A DROPDOWN, chosen by the owner over the six controls prototyped at
 * /scratch-stage-options and the progress rail that preceded it
 * (/scratch-expansion-revised). The rail drew a four-segment picture of
 * progression that the board already draws better — the stage IS the column —
 * so it was spending two lines of the record header restating what the reader
 * could see behind the overlay.
 *
 * Closed is in the list but never moves anything on its own: it opens the
 * outcome dialog, because closing has to ask which outcome, and a silent close
 * from a dropdown is exactly the accident that gate exists to prevent.
 *
 * Still ONE component, so the next reversal is a single replacement.
 */
function StageStepper({ o, canWrite, onMove, onClosing }: {
  o: Opportunity; canWrite: boolean; onMove: (s: Stage) => void; onClosing: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = STAGES.find((s) => s.id === o.stage);

  const choose = (s: Stage) => {
    setOpen(false);
    if (s === o.stage) return;
    if (s === "closed") onClosing();
    else onMove(s);
  };

  return (
    <div className="mt-3.5 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Stage</span>

      {canWrite ? (
        <div className="relative">
          <button onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium text-fg transition hover:border-border-strong hover:bg-bg-subtle">
            {current?.label}
            <span className="text-[9px] text-fg-subtle" aria-hidden>▼</span>
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
                {STAGES.map((s) => (
                  <button key={s.id} onClick={() => choose(s.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                    <span className="flex-1">{s.label}</span>
                    {s.id === o.stage && <span className="text-accent">✓</span>}
                    {/* Says out loud that this one is not a plain move. */}
                    {s.id === "closed" && s.id !== o.stage && <span className="text-[10px] text-fg-subtle">asks</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-[13px] font-medium text-fg-muted">
          {current?.label}
        </span>
      )}

      {o.outcome && (
        <span className="text-[10.5px] text-fg-subtle">
          {OUTCOME_LABEL[o.outcome]}{canWrite && " · choose a stage to reopen"}
        </span>
      )}
    </div>
  );
}
