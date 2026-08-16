"use client";

/* =========================================================================
   Expansion — the two dialogs that ask a question.

   CREATING requires an account and a name, and nothing else. Every other field
   is encouraged and flagged on the card when absent, because blocking creation
   is how opportunities stop being recorded at all — and an unrecorded motion is
   invisible, which is the one thing this page exists to prevent.

   CLOSING is the only move that asks anything, because it is the only one that
   is hard to reverse. One sheet: choosing the outcome expands its fields in
   place rather than swapping to a second dialog — closing a deal is one
   decision, not two.
   ========================================================================= */

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { moneyFull } from "@/lib/expansion/format";
import {
  CONFIDENCE_LABEL, DROP_REASONS, LOSS_REASONS, OUTCOME_LABEL, STAGE_LABEL, TYPES, TYPE_LABEL,
  type AgreementType, type Confidence, type EditOpportunityInput, type ExpansionAccount,
  type ExpansionPerson, type ExpansionType, type NewOpportunityInput, type Opportunity, type Outcome,
} from "@/lib/expansion/types";
import { closeOpportunityAction } from "./actions";
import { Btn, DateField, Fld, Row, field } from "./ui";

/* ── Create ───────────────────────────────────────────────────────────────── */

/** Searchable, over real accounts only. Expansion is by definition into an
 *  existing client, so there is no free-text account anywhere in this feature. */
function AccountPicker({ accounts, value, onChange }: {
  accounts: ExpansionAccount[]; value: ExpansionAccount | null; onChange: (a: ExpansionAccount | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = q
    ? accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{value.name}</span>
        {value.plan && <span className="shrink-0 text-[11px] text-fg-subtle">{value.plan}</span>}
        <button onClick={() => { onChange(null); setQ(""); }} className="shrink-0 text-[11px] text-accent hover:underline">change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input autoFocus value={q} placeholder="Search clients"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        className={cn(field, "py-2 text-[14px]")} />
      {open && q && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {hits.length ? hits.map((a) => (
            <button key={a.id} onClick={() => { onChange(a); setOpen(false); }}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-fg-muted hover:bg-bg-subtle">
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-[10px] text-fg-subtle">{a.plan ?? moneyFull(a.arr, a.currency)}</span>
            </button>
          )) : (
            <p className="px-2.5 py-2.5 text-[12px] text-fg-subtle">
              No client called &ldquo;{q}&rdquo;. Expansion is always into an existing account.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CreateForm({ accounts, people, me, today, onClose, onCreate }: {
  accounts: ExpansionAccount[];
  people: ExpansionPerson[];
  me: string | null;
  today: string;
  onClose: () => void;
  onCreate: (draft: NewOpportunityInput) => void;
}) {
  const plus60 = new Date(Date.parse(`${today}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);

  const [account, setAccount] = useState<ExpansionAccount | null>(null);
  const [oppName, setOppName] = useState("");
  const [arr, setArr] = useState("");
  const [expansionType, setExpansionType] = useState<ExpansionType>("module");
  const [product, setProduct] = useState("");
  // Defaults to the signed-in user when they can own one; an unowned
  // opportunity is legal but immediately flagged.
  const [ownerEmail, setOwnerEmail] = useState(people.some((p) => p.email === me) ? me ?? "" : "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(plus60);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");
  const [touched, setTouched] = useState(false);

  const missingAccount = touched && !account;
  const missingName = touched && !oppName.trim();
  const ready = !!account && !!oppName.trim();
  const ccy = account?.currency ?? "USD";

  const submit = () => {
    setTouched(true);
    if (!account || !oppName.trim()) return;
    onCreate({
      clientId: account.id,
      name: oppName.trim(),
      expectedArr: arr ? Number(arr) : null,
      expansionType,
      product: product.trim() || null,
      ownerEmail: ownerEmail || null,
      expectedCloseDate: expectedCloseDate || null,
      confidence,
      nextStep: nextStep.trim() && nextStepDue ? { text: nextStep.trim(), dueDate: nextStepDue } : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-cosmos/25 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="mt-[9vh] flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-fg">New opportunity</h2>
          {/* Always Identified: qualification means a client conversation happened. */}
          <span className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-muted">{STAGE_LABEL.identified}</span>
          <button onClick={onClose} className="ml-auto rounded-md px-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <Fld label="Client account" required error={missingAccount ? "Choose a client" : undefined}>
            <AccountPicker accounts={accounts} value={account} onChange={setAccount} />
          </Fld>

          <Fld label="Opportunity" required hint="What is being sold — “Perform module”, not “Upsell”"
            error={missingName ? "Give it a name" : undefined}>
            <input value={oppName} onChange={(e) => setOppName(e.target.value)}
              placeholder="Seat expansion — 120 licences" className={cn(field, "py-2 text-[14px]")} />
          </Fld>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expected ARR">
              <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 focus-within:border-accent">
                {/* Currency follows the account, and is never editable here. */}
                <span className="text-[13px] text-fg-subtle">{ccy}</span>
                <input value={arr} onChange={(e) => setArr(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                  placeholder="0" className="w-full min-w-0 bg-transparent text-[14px] tabular-nums text-fg outline-none placeholder:text-fg-subtle" />
              </div>
            </Fld>
            <Fld label="Owner">
              <select value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={cn(field, "py-2")}>
                <option value="">Unassigned</option>
                {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
              </select>
            </Fld>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* No "Not set" option: every opportunity HAS a type in the
                database (the column is not-null), so offering "Not set" and
                then storing Module would put a word on the card that nobody
                chose. The default is visible and one click from correct. */}
            <Fld label="Expansion type" hint="The shape of the expansion">
              <select value={expansionType} onChange={(e) => setExpansionType(e.target.value as ExpansionType)} className={cn(field, "py-2")}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Fld>
            <Fld label="Product or module" hint="Perform, Develop, Engage, custom content…">
              <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Develop" className={cn(field, "py-2")} />
            </Fld>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expected close"><DateField value={expectedCloseDate} onChange={setExpectedCloseDate} /></Fld>
            <Fld label="Confidence" hint="Your judgement. Leave unset if you do not have one">
              <div className="flex gap-1.5">
                {(["high", "medium", "low"] as Confidence[]).map((c) => (
                  <button key={c} type="button" onClick={() => setConfidence(confidence === c ? null : c)}
                    className={cn("flex-1 rounded-md border px-2 py-1.5 text-[12px] transition",
                      confidence === c ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-bg-subtle")}>
                    {CONFIDENCE_LABEL[c]}
                  </button>
                ))}
              </div>
            </Fld>
          </div>

          <Fld label="Next step" hint="Shown on the card. Left blank, the opportunity is flagged until one is set">
            <input value={nextStep} onChange={(e) => setNextStep(e.target.value)}
              placeholder="Chase Noura on the quote" className={cn(field, "py-2")} />
          </Fld>
          {nextStep.trim() && (
            <Fld label="Next step due"><DateField value={nextStepDue} onChange={setNextStepDue} /></Fld>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          <span className="text-[11px] text-fg-subtle">Client and opportunity are required</span>
          <div className="ml-auto flex items-center gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn primary disabled={!ready && touched} onClick={submit}>Create</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Editing ──────────────────────────────────────────────────────────────── */

/**
 * Correct the details that creation froze.
 *
 * A sheet rather than six inline editors, deliberately. The record is a place
 * to read an opportunity and act on it — next step, note, stage, owner — and
 * scattering six more click-to-edit affordances through it turns it back into
 * the form the wide overlay exists to avoid. Correcting a mistyped ARR is an
 * occasional, deliberate act; it can afford a dialog.
 *
 * ARR and expected close are disabled once closed: the recorded value of a won
 * deal is a commercial fact, and a close date means nothing after the close.
 * The server refuses them too — this only explains why.
 */
export function EditSheet({ o, canDelete, onCancel, onSave, onDelete, saving }: {
  o: Opportunity;
  canDelete: boolean;
  onCancel: () => void;
  onSave: (patch: EditOpportunityInput) => void;
  onDelete: () => void;
  saving?: boolean;
}) {
  const closed = o.outcome !== null;
  const [name, setName] = useState(o.name);
  const [description, setDescription] = useState(o.description ?? "");
  const [arr, setArr] = useState(o.expectedArr == null ? "" : String(o.expectedArr));
  const [expansionType, setExpansionType] = useState<ExpansionType>(o.expansionType);
  const [product, setProduct] = useState(o.product ?? "");
  const [closeDate, setCloseDate] = useState(o.expectedCloseDate ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /* Only what actually CHANGED goes to the server.
     Sending the whole form would be simpler, but the activity log names the
     fields it was given — so a one-word fix to the name would be recorded as
     "Details edited · name, description, product, type, ARR, expected close"
     and the log would stop being usable as a record of what happened. */
  const submit = () => {
    if (!name.trim()) return;
    const patch: EditOpportunityInput = {};
    const nextName = name.trim();
    const nextDesc = description.trim() || null;
    const nextProduct = product.trim() || null;

    if (nextName !== o.name) patch.name = nextName;
    if (nextDesc !== (o.description ?? null)) patch.description = nextDesc;
    if (nextProduct !== (o.product ?? null)) patch.product = nextProduct;
    if (expansionType !== o.expansionType) patch.expansionType = expansionType;

    // Omitted entirely when closed, so the action never has to refuse them.
    if (!closed) {
      const nextArr = arr === "" ? null : Number(arr);
      if (nextArr !== (o.expectedArr ?? null)) patch.expectedArr = nextArr;
      const nextClose = closeDate || null;
      if (nextClose !== (o.expectedCloseDate ?? null)) patch.expectedCloseDate = nextClose;
    }

    onSave(patch);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-cosmos/25 p-6" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="mt-[9vh] flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-fg">Edit opportunity</h2>
          <button onClick={onCancel} className="ml-auto rounded-md px-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <Fld label="Opportunity" required error={!name.trim() ? "A name is required" : undefined}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={cn(field, "py-2 text-[14px]")} />
          </Fld>

          <Fld label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className={cn(field, "resize-none py-2")} />
          </Fld>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expected ARR"
              hint={closed ? "Locked — a closed opportunity's value is a record" : undefined}>
              <div className={cn("flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 focus-within:border-accent",
                closed && "opacity-50")}>
                <span className="text-[13px] text-fg-subtle">{o.currency}</span>
                <input value={arr} disabled={closed} onChange={(e) => setArr(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric" placeholder="0"
                  className="w-full min-w-0 bg-transparent text-[14px] tabular-nums text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed" />
              </div>
            </Fld>
            <Fld label="Expected close" hint={closed ? "Locked — it already closed" : undefined}>
              {closed
                ? <div className={cn(field, "py-2 opacity-50")}>{o.expectedCloseDate ?? "—"}</div>
                : <DateField value={closeDate} onChange={setCloseDate} />}
            </Fld>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expansion type">
              <select value={expansionType} onChange={(e) => setExpansionType(e.target.value as ExpansionType)}
                className={cn(field, "py-2")}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </Fld>
            <Fld label="Product or module">
              <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Develop"
                className={cn(field, "py-2")} />
            </Fld>
          </div>

          {/* Delete lives here, at the bottom, behind a confirm, and only for the
              tiers allowed it. The copy names the alternative, because deleting
              a real motion that was lost destroys the loss data. */}
          {canDelete && (
            <div className="mt-2 border-t border-border pt-3.5">
              {confirmingDelete ? (
                <div className="rounded-lg border border-danger/40 bg-danger-bg px-3 py-2.5">
                  <p className="text-[12px] font-medium text-danger-fg">
                    Delete this opportunity and its whole history?
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
                    Permanent, and it takes the next steps, notes and activity with it. If this was a
                    real motion you stopped pursuing, close it as <span className="text-fg">Dropped</span>{" "}
                    instead — that stays countable.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <button onClick={onDelete} disabled={saving}
                      className="rounded-md bg-danger px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-40">
                      Delete permanently
                    </button>
                    <Btn onClick={() => setConfirmingDelete(false)}>Keep it</Btn>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmingDelete(true)}
                  className="text-[11.5px] text-fg-subtle transition hover:text-danger-fg hover:underline">
                  Delete this opportunity
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn primary disabled={!name.trim() || saving} onClick={submit}>Save changes</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Closing ──────────────────────────────────────────────────────────────── */

export function CloseSheet({ o, onCancel, onDone, onError }: {
  o: Opportunity;
  onCancel: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [finalArr, setFinalArr] = useState(String(o.expectedArr ?? ""));
  const [agreementType, setAgreementType] = useState<AgreementType>("written");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [arrRecorded, setArrRecorded] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, startTransition] = useTransition();

  const ready = outcome === "won"
    ? !!finalArr && !!confirmedBy.trim()
    : outcome ? !!reason : false;

  const submit = () => {
    if (!outcome) return;
    startTransition(async () => {
      const res = await closeOpportunityAction(o.id, outcome === "won"
        ? { outcome, finalArr: Number(finalArr), agreementType, confirmedBy: confirmedBy.trim(), arrRecorded }
        : { outcome, closeReason: reason, closeNote: note.trim() || null });
      if (!res.ok) { onError(res.error ?? "That didn't save."); return; }
      onDone(`${o.accountName} · ${OUTCOME_LABEL[outcome]}`);
    });
  };

  const OUTCOMES: { id: Outcome; label: string; blurb: string }[] = [
    { id: "won", label: "Won", blurb: "The client agreed" },
    { id: "lost", label: "Lost", blurb: "They declined" },
    { id: "dropped", label: "Dropped", blurb: "We stopped" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-cosmos/25 p-6" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="mt-[10vh] flex max-h-[80vh] w-full max-w-[460px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-fg">Close opportunity</h2>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{o.accountName} · {o.name}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((x) => (
              <button key={x.id} onClick={() => setOutcome(x.id)}
                className={cn("rounded-lg border px-2 py-2.5 text-left transition",
                  outcome === x.id
                    ? x.id === "won" ? "border-success bg-success-bg" : "border-accent bg-accent-soft"
                    : "border-border hover:border-border-strong hover:bg-bg-subtle")}>
                <div className={cn("text-[13px] font-semibold",
                  outcome === x.id && x.id === "won" ? "text-success-fg" : "text-fg")}>{x.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{x.blurb}</div>
              </button>
            ))}
          </div>

          {outcome === "won" && (
            <div className="space-y-3 border-t border-border pt-3.5">
              {/* The rule most easily got wrong. Invoices are raised for accounts
                  that never activate and for ones that later withdraw. */}
              <p className="text-[12px] leading-relaxed text-warning-fg">
                An invoice isn&apos;t an acceptance. Mark Won only once the client has agreed.
              </p>
              <Row label="Final ARR">
                <span className="inline-flex w-40 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[13px] focus-within:border-accent">
                  <span className="text-fg-subtle">{o.currency}</span>
                  <input autoFocus value={finalArr} onChange={(e) => setFinalArr(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                    className="w-full min-w-0 bg-transparent tabular-nums outline-none" />
                </span>
              </Row>
              <Row label="Agreement">
                <div className="flex gap-1.5">
                  {(["verbal", "written"] as AgreementType[]).map((t) => (
                    <button key={t} onClick={() => setAgreementType(t)}
                      className={cn("rounded-md border px-2.5 py-1 text-[12px] capitalize transition",
                        agreementType === t ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-bg-subtle")}>
                      {t}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Confirmed by">
                <input value={confirmedBy} onChange={(e) => setConfirmedBy(e.target.value)} placeholder="Name · role" className={field} />
              </Row>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-fg-muted">
                <input type="checkbox" checked={arrRecorded} onChange={(e) => setArrRecorded(e.target.checked)} />
                Already recorded in the ARR ledger
              </label>
              <p className="text-[11px] leading-relaxed text-fg-subtle">
                Closing writes nothing to the ARR ledger. This marker only records whether the two have been reconciled.
              </p>
            </div>
          )}

          {(outcome === "lost" || outcome === "dropped") && (
            <div className="space-y-2.5 border-t border-border pt-3.5">
              <p className="text-[12px] text-fg-subtle">
                {outcome === "lost" ? "Why did it not land?" : "Why did we stop?"} Nothing is written to the ARR ledger.
              </p>
              {/* A fixed list, because free text cannot be counted — and "why do
                  we lose expansion" is the first question asked of this data. */}
              <div className="flex flex-wrap gap-1.5">
                {(outcome === "lost" ? LOSS_REASONS : DROP_REASONS).map((r) => (
                  <button key={r} onClick={() => setReason(r)}
                    className={cn("rounded-md border px-2.5 py-1 text-[12px] transition",
                      reason === r ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-bg-subtle")}>
                    {r}
                  </button>
                ))}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="Anything worth remembering (optional)"
                className={cn(field, "resize-none")} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn primary disabled={!ready || saving} onClick={submit}>
            {outcome ? `Mark ${OUTCOME_LABEL[outcome]}` : "Choose an outcome"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
