"use client";

/* =========================================================================
   Prototype — Expansion. A simple expansion CRM, Kanban first.

   Spec: docs/specs/revenue/expansion-opportunities-specification.md

   Account → Opportunity. Four stages, three closed outcomes. Nothing else:
   no probabilities, no weighting, no approvals, no second pipeline.

   The board carries the insight, so the card has to. Each card answers four
   questions without being opened —

     What are we expanding?   account, name, type chip
     What is it worth?        expected ARR
     What happens next?       the next step, as readable text
     Is it moving or stuck?   due state + momentum, kept separate

   Two read-outs, both defined once in ./data.ts:
     dueState(o)  — timing of the next step
     momentum(o)  — whether the deal itself is moving

   Dragging a card moves it immediately and shows an Undo. Only Closed asks a
   question, because only Closed is hard to reverse.

   Reads nothing, writes nothing. State is React state over sample data.
   ========================================================================= */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  OPPORTUNITIES, STAGES, STAGE_LABEL, OUTCOME_LABEL, TYPE_LABEL, TYPES,
  LOSS_REASONS, DROP_REASONS, PEOPLE, ME, TODAY, ACCOUNTS, HEALTH_LABEL,
  CONFIDENCE_LABEL, ROLE_LABEL, PEOPLE_LIST, roleOf, primaryStep,
  ATTENTION_ORDER, attention, dueState, momentum, needsAttention, isClosed, daysSince,
  name, firstName, initials, money, moneyFull, fmt, fmtShort,
  type Opportunity, type Stage, type Outcome, type AgreementType,
  type ExpansionType, type AccountContext, type MomentumState, type DueState, type Confidence,
  type NextStep, type Role,
  type Tone, type AttentionState,
} from "./data";

type Layout = "board" | "list";
type SortKey = "account" | "name" | "arr" | "owner" | "close" | "due" | "momentum";

/* ── Tokens for the two read-outs ─────────────────────────────────────────── */

const DUE_TONE: Record<DueState, string> = {
  overdue: "text-danger-fg font-medium",
  none: "text-warning-fg font-medium",
  today: "text-warning-fg font-medium",
  tomorrow: "text-warning-fg",
  soon: "text-fg-muted",
  later: "text-fg-subtle",
};

const MOMENTUM_DOT: Record<MomentumState, string> = {
  progressed: "bg-border-strong",
  stalled: "bg-warning",
  waiting: "bg-info",
  moving: "bg-border-strong",
};

const MOMENTUM_TEXT: Record<MomentumState, string> = {
  progressed: "text-fg-subtle",
  stalled: "text-warning-fg",
  waiting: "text-info-fg",
  moving: "text-fg-subtle",
};

/* ── Pickers ──────────────────────────────────────────────────────────────── */

/** Owner. Grouped by permission tier; guests are absent because they cannot write. */
function OwnerPicker({ value, onChange, size = 16 }: {
  value: string | null; onChange: (email: string | null) => void; size?: number;
}) {
  const [open, setOpen] = useState(false);
  const groups: Role[] = ["operator", "admin", "super_admin"];
  return (
    <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)} title={value ? name(value) : "Assign an owner"}
        className="rounded-full transition hover:ring-2 hover:ring-accent/30">
        <Avatar email={value} size={size} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-surface p-1 shadow-lg">
            {groups.map((r) => {
              const people = PEOPLE_LIST.filter((x) => x.role === r);
              if (!people.length) return null;
              return (
                <div key={r}>
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
                    {ROLE_LABEL[r]}
                  </div>
                  {people.map((x) => (
                    <button key={x.email} onClick={() => { onChange(x.email); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                      <Avatar email={x.email} size={16} />
                      <span className="min-w-0 flex-1 truncate">{x.name}</span>
                      {value === x.email && <span className="text-accent">✓</span>}
                    </button>
                  ))}
                </div>
              );
            })}
            <div className="mt-1 border-t border-border pt-1">
              <button onClick={() => { onChange(null); setOpen(false); }}
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-fg-subtle hover:bg-bg-subtle">
                Unassigned
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "text-fg-muted",
  medium: "text-fg-subtle",
  low: "text-fg-subtle/70",
};

function ConfidencePicker({ value, onChange }: { value: Confidence | null; onChange: (c: Confidence | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((v) => !v)}
        className={cn("rounded px-1 py-0.5 text-[11px] transition hover:bg-bg-subtle",
          value ? CONFIDENCE_TONE[value] : "text-fg-subtle/60")}>
        {value ? CONFIDENCE_LABEL[value] : "Confidence"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border bg-surface p-1 shadow-lg">
            {(["high", "medium", "low"] as Confidence[]).map((c) => (
              <button key={c} onClick={() => { onChange(c); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                <span className="flex-1">{CONFIDENCE_LABEL[c]}</span>
                {value === c && <span className="text-accent">✓</span>}
              </button>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <button onClick={() => { onChange(null); setOpen(false); }}
                className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-fg-subtle hover:bg-bg-subtle">Clear</button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Avatar({ email, size = 18 }: { email: string | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size <= 18 ? 8 : 10 };
  if (!email) {
    return (
      <span title="Unassigned" style={style}
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-fg-subtle">?</span>
    );
  }
  return (
    <span title={name(email)} style={style}
      className="grid shrink-0 place-items-center rounded-full bg-bg-muted font-semibold text-fg-muted">
      {initials(email)}
    </span>
  );
}

function TypeChip({ o }: { o: Opportunity }) {
  return (
    <span className="inline-flex items-center rounded border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
      {o.product ? `${o.product} · ${TYPE_LABEL[o.expansionType]}` : TYPE_LABEL[o.expansionType]}
    </span>
  );
}

function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const tone: Record<Outcome, string> = {
    won: "border-success/30 bg-success-bg text-success-fg",
    lost: "border-danger/30 bg-danger-bg text-danger-fg",
    dropped: "border-border bg-bg-muted text-fg-subtle",
  };
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium", tone[outcome])}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

function Btn({ primary, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button {...p} className={cn(
      "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
      primary ? "bg-accent text-fg-on-accent hover:bg-accent-hover" : "border border-border text-fg-muted hover:bg-bg-subtle hover:text-fg",
      className,
    )} />
  );
}

const field =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent";

function Popover({ open, onClose, children, align = "right", width = "w-56" }: {
  open: boolean; onClose: () => void; children: React.ReactNode; align?: "left" | "right"; width?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div className={cn("absolute top-full z-30 mt-1 rounded-lg border border-border bg-surface p-1 shadow-lg",
        width, align === "right" ? "right-0" : "left-0")}>
        {children}
      </div>
    </>
  );
}

function PopRow({ label, onClick, selected }: { label: string; onClick: () => void; selected?: boolean }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
      <span className="flex-1">{label}</span>
      {selected && <span className="text-accent">✓</span>}
    </button>
  );
}

function PopLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{children}</div>;
}

function Sheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-cosmos/25 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mt-[12vh] w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <div className="border-b border-border px-4 py-2.5 text-[12px] font-medium text-fg-muted">{title}</div>
        <div className="space-y-3 px-4 py-3.5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">{footer}</div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function Expansion() {
  const [items, setItems] = useState<Opportunity[]>(OPPORTUNITIES);
  const [layout, setLayout] = useState<Layout>("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [type, setType] = useState<"all" | ExpansionType>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });

  const [filterOpen, setFilterOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Stage | null>(null);
  const [closing, setClosing] = useState<Opportunity | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (id: string, p: Partial<Opportunity>, entry?: string) =>
    setItems((prev) => prev.map((o) => o.id === id ? {
      ...o, ...p, lastActivityAt: TODAY,
      history: entry ? [...o.history, { at: TODAY, actor: name(ME), what: entry }] : o.history,
    } : o));

  const visible = useMemo(() => items.filter((o) => {
    if (owner !== "all" && o.ownerEmail !== (owner === "none" ? null : owner)) return false;
    if (type !== "all" && o.expansionType !== type) return false;
    if (q && !`${o.account} ${o.name} ${o.product ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (attentionOnly && !needsAttention(o)) return false;
    return true;
  }), [items, owner, type, q, attentionOnly]);

  /* ── Portfolio summary — one line, four numbers ── */
  const openItems = items.filter((o) => !isClosed(o));
  const potentialUsd = openItems.filter((o) => o.currency === "USD").reduce((s, o) => s + (o.expectedArr ?? 0), 0);
  const potentialOther = openItems.filter((o) => o.currency !== "USD");
  const wonUsd = items.filter((o) => o.outcome === "won" && o.currency === "USD").reduce((s, o) => s + (o.finalArr ?? 0), 0);
  const attentionCount = openItems.filter((o) => needsAttention(o)).length;

  const open = items.find((o) => o.id === openId) ?? null;

  /* ── Movement — instant, with Undo ── */
  function moveStage(o: Opportunity, to: Stage) {
    if (to === "closed") { setClosing(o); return; }
    const snapshot = { stage: o.stage, stageChangedAt: o.stageChangedAt, lastActivityAt: o.lastActivityAt, history: o.history, outcome: o.outcome };
    setItems((prev) => prev.map((x) => x.id === o.id ? {
      ...x, stage: to, outcome: null, stageChangedAt: TODAY, lastActivityAt: TODAY,
      proposalDate: to === "proposed" ? (x.proposalDate ?? TODAY) : x.proposalDate,
      history: [...x.history, { at: TODAY, actor: name(ME), what: `Moved to ${STAGE_LABEL[to]}` }],
    } : x));
    setToast({
      msg: `${o.account} → ${STAGE_LABEL[to]}`,
      undo: () => { setItems((prev) => prev.map((x) => x.id === o.id ? { ...x, ...snapshot } : x)); setToast(null); },
    });
  }

  function create(draft: NewOpportunity) {
    const id = `o-new-${items.length + 1}`;
    const plus60 = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);
    setItems((prev) => [{
      id, account: draft.account, name: draft.name, description: "",
      stage: draft.stage, outcome: null,
      expectedArr: draft.arr ? Number(draft.arr) : null,
      currency: ACCOUNTS[draft.account]?.currency ?? "USD",
      expansionType: draft.expansionType || "module", product: draft.product || null,
      ownerEmail: draft.ownerEmail, expectedCloseDate: draft.expectedCloseDate || plus60,
      confidence: draft.confidence,
      nextSteps: draft.nextStep && draft.nextStepDue ? [{ id: "s1", text: draft.nextStep, dueDate: draft.nextStepDue }] : [],
      lastActivityAt: TODAY, stageChangedAt: TODAY,
      latestNote: null, trigger: null,
      createdAt: TODAY, proposalDate: null,
      outcomeDate: null, finalArr: null, agreementType: null, confirmedBy: null, arrRecorded: false, closeReason: null,
      history: [{ at: TODAY, actor: name(ME), what: "Opportunity created" }],
    }, ...prev]);
    setCreating(null);
  }

  const filtersOn = owner !== "all" || type !== "all" || !!q;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <p className="shrink-0 border-b border-border bg-bg-subtle px-4 py-1 text-[11px] text-fg-subtle">
        Prototype — sample data. Figures are invented.
      </p>

      {/* Title bar — controls on row one, summary on row two (header option 3) */}
      <header className="shrink-0 border-b border-border-subtle">
        <div className="flex h-12 items-center gap-3 px-4">
          <h1 className="text-[14px] font-semibold text-fg">Expansion</h1>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setAttentionOnly((v) => !v)}
              className={cn("rounded-md border px-2 py-1 text-[12px] transition",
                attentionOnly ? "border-danger/40 bg-danger-bg text-danger-fg"
                  : "border-transparent text-fg-muted hover:bg-bg-subtle hover:text-fg")}
            >
              Needs attention{" "}
              <span className={cn("tabular-nums", attentionCount && !attentionOnly ? "text-danger-fg" : "")}>
                {attentionCount}
              </span>
            </button>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
              className="w-36 rounded-md bg-transparent px-2 py-1 text-[12px] text-fg outline-none placeholder:text-fg-subtle focus:bg-bg-subtle" />
            <div className="relative">
              <button onClick={() => { setFilterOpen((v) => !v); setDisplayOpen(false); }}
                className={cn("rounded-md px-2 py-1 text-[12px] transition hover:bg-bg-subtle hover:text-fg",
                  filtersOn ? "bg-bg-muted text-fg" : "text-fg-muted")}>
                Filter{filtersOn && <span className="ml-1 text-accent">•</span>}
              </button>
              <Popover open={filterOpen} onClose={() => setFilterOpen(false)}>
                <PopLabel>Owner</PopLabel>
                <PopRow label="Anyone" onClick={() => setOwner("all")} selected={owner === "all"} />
                {Object.entries(PEOPLE).map(([id, l]) => <PopRow key={id} label={l} onClick={() => setOwner(id)} selected={owner === id} />)}
                <PopRow label="Unassigned" onClick={() => setOwner("none")} selected={owner === "none"} />
                <PopLabel>Expansion type</PopLabel>
                <PopRow label="Any" onClick={() => setType("all")} selected={type === "all"} />
                {TYPES.map((t) => <PopRow key={t} label={TYPE_LABEL[t]} onClick={() => setType(t)} selected={type === t} />)}
              </Popover>
            </div>
            <div className="ml-1 inline-flex rounded-md border border-border bg-bg-subtle p-0.5">
              {(["board", "list"] as Layout[]).map((v) => (
                <button key={v} onClick={() => setLayout(v)}
                  className={cn("rounded px-2.5 py-1 text-[12px] font-medium capitalize transition",
                    layout === v ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg")}>
                  {v}
                </button>
              ))}
            </div>
            <Btn primary className="ml-1" onClick={() => setCreating("identified")}>+ New</Btn>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border-subtle bg-bg-subtle/60 px-4 py-2">
          <Stat n={String(openItems.length)} label="open" />
          <Stat n={money(potentialUsd)} label="open ARR" />
          <Stat n={money(wonUsd)} label="won" tone="text-success-fg" />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {layout === "board" ? (
          <Board
            items={visible} onOpen={setOpenId} onMove={moveStage} openId={openId}
            edit={(o) => ({
              addStep: (text, dueDate) =>
                patch(o.id, { nextSteps: [...o.nextSteps, { id: `s${o.nextSteps.length + 1}-${dueDate}`, text, dueDate }] },
                  `Next step added · due ${fmtShort(dueDate)}`),
              updateStep: (id, text, dueDate) =>
                patch(o.id, { nextSteps: o.nextSteps.map((x) => (x.id === id ? { ...x, text, dueDate } : x)) },
                  `Next step updated · due ${fmtShort(dueDate)}`),
              removeStep: (id) =>
                patch(o.id, { nextSteps: o.nextSteps.filter((x) => x.id !== id) }, "Next step completed"),
              setOwner: (email) => patch(o.id, { ownerEmail: email }, email ? `Owner → ${name(email)}` : "Owner cleared"),
              setConfidence: (c) => patch(o.id, { confidence: c }, c ? `Confidence → ${CONFIDENCE_LABEL[c]}` : "Confidence cleared"),
            })}
            filtered={filtersOn || attentionOnly}
          />
        ) : (
          <ListView items={visible} sort={sort} setSort={setSort} onOpen={setOpenId} />
        )}
      </div>

      {creating && <CreateForm stage={creating} onClose={() => setCreating(null)} onCreate={create} />}

      {open && (
        <Record
          o={open} onClose={() => setOpenId(null)}
          onPatch={(p, e) => patch(open.id, p, e)}
          onMove={(s) => moveStage(open, s)}
        />
      )}

      {closing && (
        <CloseSheet
          o={closing}
          onCancel={() => setClosing(null)}
          onConfirm={(p, entry) => {
            patch(closing.id, { ...p, stage: "closed", stageChangedAt: TODAY, nextSteps: [] }, entry);
            setClosing(null);
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-cosmos px-3.5 py-2 text-[12px] text-white shadow-xl">
            <span>{toast.msg}</span>
            <button onClick={toast.undo} className="font-medium text-stellar hover:underline">Undo</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: string; label: string; tone?: string }) {
  return (
    <span className="whitespace-nowrap text-[12px]">
      <span className={cn("font-semibold tabular-nums", tone ?? "text-fg")}>{n}</span>{" "}
      <span className="text-fg-subtle">{label}</span>
    </span>
  );
}

/* ── Board ────────────────────────────────────────────────────────────────── */

function Board({ items, onOpen, onMove, filtered, openId, edit }: {
  items: Opportunity[];
  onOpen: (id: string) => void;
  onMove: (o: Opportunity, s: Stage) => void;
  filtered: boolean;
  openId: string | null;
  edit: (o: Opportunity) => {
    addStep: (text: string, dueDate: string) => void;
    updateStep: (id: string, text: string, dueDate: string) => void;
    removeStep: (id: string) => void;
    setOwner: (email: string | null) => void;
    setConfidence: (c: Confidence | null) => void;
  };
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  return (
    <div className="grid h-full grid-cols-4 gap-px overflow-hidden bg-border">
      {STAGES.map((col) => {
        const cards = items.filter((o) => o.stage === col.id);
        const isClosedCol = col.id === "closed";
        // Closed totals won money only — a loss is not a total.
        const counted = isClosedCol ? cards.filter((o) => o.outcome === "won") : cards;
        const usd = counted.filter((o) => o.currency === "USD")
          .reduce((s, o) => s + ((o.outcome === "won" ? o.finalArr : o.expectedArr) ?? 0), 0);
        const other = counted.filter((o) => o.currency !== "USD");

        return (
          <section
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
            onDragLeave={() => setOver((v) => (v === col.id ? null : v))}
            onDrop={(e) => {
              e.preventDefault(); setOver(null);
              const o = items.find((x) => x.id === (dragId ?? e.dataTransfer.getData("text/plain")));
              setDragId(null);
              if (o && o.stage !== col.id) onMove(o, col.id);
            }}
            className={cn("flex min-h-0 flex-col transition-colors",
              isClosedCol ? "bg-bg-subtle/60" : "bg-surface",
              over === col.id && "bg-accent-soft")}
          >
            <div className="shrink-0 px-3 pb-2 pt-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-muted">{col.label}</h2>
                <span className="rounded-full bg-bg-muted px-1.5 text-[11px] tabular-nums text-fg-muted">{cards.length}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-[18px] font-semibold leading-none tabular-nums tracking-tight text-fg">
                  {moneyFull(usd)}
                </span>
                {other.length > 0 && (
                  <span className="text-[11px] tabular-nums text-fg-subtle">
                    + {other.map((o) => money(o.expectedArr, o.currency)).join(", ")}
                  </span>
                )}
                {isClosedCol && <span className="text-[11px] text-fg-subtle">won</span>}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {cards.map((o) => (
                <Card
                  key={o.id} o={o}
                  state={dragId === o.id ? "dragging" : openId === o.id ? "selected" : "default"}
                  onOpen={() => onOpen(o.id)}
                  onDragStart={(e) => { setDragId(o.id); e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  edit={edit(o)}
                />
              ))}

              {/* Placement indicator — where the card will land */}
              {over === col.id && dragId && !cards.some((c) => c.id === dragId) && (
                <div className="rounded-lg border-2 border-dashed border-accent/50 bg-accent-soft/60 px-3 py-4 text-center text-[11px] font-medium text-accent">
                  {isClosedCol ? "Drop to close" : `Move to ${col.label}`}
                </div>
              )}

              {!cards.length && (
                <p className="px-2 py-8 text-center text-[12px] text-fg-subtle">
                  {filtered ? "Nothing matches" : "Nothing here yet"}
                </p>
              )}

            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── Create ───────────────────────────────────────────────────────────────────
   Only Account and Opportunity are required. Everything else is encouraged and
   defaulted where a sensible default exists, because a recorded-but-thin
   opportunity beats one that never got recorded. Missing fields are flagged on
   the card afterwards, not enforced here. */

export interface NewOpportunity {
  account: string;
  name: string;
  stage: Stage;
  arr: string;
  expansionType: ExpansionType | "";
  product: string;
  ownerEmail: string;
  expectedCloseDate: string;
  nextStep: string;
  nextStepDue: string;
  confidence: Confidence | null;
}

/** Searchable, over real accounts only. Expansion is by definition into an existing client. */
function AccountPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = Object.keys(ACCOUNTS).filter((a) => a.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  if (value) {
    const acc = ACCOUNTS[value];
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{value}</span>
        {acc && <span className="shrink-0 text-[11px] text-fg-subtle">{acc.plan}</span>}
        <button onClick={() => { onChange(""); setQ(""); }} className="shrink-0 text-[11px] text-accent hover:underline">change</button>
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
            <button key={a} onClick={() => { onChange(a); setOpen(false); }}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] text-fg-muted hover:bg-bg-subtle">
              <span className="min-w-0 flex-1 truncate">{a}</span>
              <span className="shrink-0 text-[10px] text-fg-subtle">{ACCOUNTS[a].plan}</span>
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

/** Native picker for usability, with the value echoed back in readable form. */
function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "w-[150px] py-2")} />
      <span className="text-[12px] tabular-nums text-fg-subtle">{value ? fmt(value) : "not set"}</span>
    </div>
  );
}

function CreateForm({ stage, onClose, onCreate }: {
  stage: Stage; onClose: () => void; onCreate: (d: NewOpportunity) => void;
}) {
  const plus60 = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 60 * 86_400_000).toISOString().slice(0, 10);

  const [account, setAccount] = useState("");
  const [oppName, setOppName] = useState("");
  const [arr, setArr] = useState("");
  const [expansionType, setExpansionType] = useState<ExpansionType | "">("");
  const [product, setProduct] = useState("");
  const [ownerEmail, setOwnerEmail] = useState(ME);
  const [expectedCloseDate, setExpectedCloseDate] = useState(plus60);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");
  const [touched, setTouched] = useState(false);

  const missingAccount = touched && !account;
  const missingName = touched && !oppName.trim();
  const ready = !!account && !!oppName.trim();
  const ccy = ACCOUNTS[account]?.currency ?? "USD";

  const submit = () => {
    setTouched(true);
    if (!ready) return;
    onCreate({
      account, name: oppName.trim(), stage, arr, expansionType, product: product.trim(),
      ownerEmail, expectedCloseDate, confidence, nextStep: nextStep.trim(), nextStepDue,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-cosmos/25 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="mt-[9vh] flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <h2 className="text-[14px] font-semibold text-fg">New opportunity</h2>
          <span className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-muted">{STAGE_LABEL[stage]}</span>
          <button onClick={onClose} className="ml-auto rounded-md px-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg" aria-label="Close">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
          <Fld label="Client account" required error={missingAccount ? "Choose a client" : undefined}>
            <AccountPicker value={account} onChange={setAccount} />
          </Fld>

          <Fld label="Opportunity" required hint="What is being sold — “Perform module”, not “Upsell”"
            error={missingName ? "Give it a name" : undefined}>
            <input value={oppName} onChange={(e) => setOppName(e.target.value)}
              placeholder="Seat expansion — 120 licences" className={cn(field, "py-2 text-[14px]")} />
          </Fld>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expected ARR">
              <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 focus-within:border-accent">
                <span className="text-[13px] text-fg-subtle">{ccy}</span>
                <input value={arr} onChange={(e) => setArr(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                  placeholder="0" className="w-full min-w-0 bg-transparent text-[14px] tabular-nums text-fg outline-none placeholder:text-fg-subtle" />
              </div>
            </Fld>
            <Fld label="Owner">
              <select value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={cn(field, "py-2")}>
                {Object.entries(PEOPLE).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
              </select>
            </Fld>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Fld label="Expansion type" hint="The shape of the expansion">
              <select value={expansionType} onChange={(e) => setExpansionType(e.target.value as ExpansionType | "")} className={cn(field, "py-2")}>
                <option value="">Not set</option>
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
            <Btn primary onClick={submit}>Create</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fld({ label, hint, required, error, children }: {
  label: string; hint?: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</span>
        {required && <span className="text-[11px] text-danger-fg">Required</span>}
      </span>
      {children}
      {error
        ? <span className="mt-1 block text-[11px] text-danger-fg">{error}</span>
        : hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </label>
  );
}


/* ── The card ─────────────────────────────────────────────────────────────────
   Option 2 refined. One anatomy for every state — nothing is added or removed
   because an opportunity is overdue, so the card never changes height when its
   status changes.

     1  account · product                              expected ARR
     2  opportunity name                     (up to two lines)
     3  next step                            (up to two lines, full text on hover)
     4  owner · primary attention state

   Four lines. The expansion signal, the expected close date and the secondary
   attention context all moved to the record — they are read when you open an
   opportunity, not every time you scan the board. Exactly one attention state
   per card, chosen by the precedence in data.ts. */

const TONE_TEXT: Record<Tone, string> = {
  danger: "text-danger-fg font-medium",
  warning: "text-warning-fg font-medium",
  info: "text-info-fg",
  muted: "text-fg-muted",
  subtle: "text-fg-subtle",
};

export type CardState = "default" | "hover" | "selected" | "dragging";

export function Card({ o, onOpen, state = "default", onDragStart, onDragEnd, edit }: {
  o: Opportunity;
  onOpen?: () => void;
  state?: CardState;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Present on the board — lets the card be edited without opening the record. */
  edit?: {
    addStep: (text: string, dueDate: string) => void;
    updateStep: (id: string, text: string, dueDate: string) => void;
    removeStep: (id: string) => void;
    setOwner: (email: string | null) => void;
    setConfidence: (c: Confidence | null) => void;
  };
}) {
  const closed = isClosed(o);
  const a = attention(o);
  const kind = o.product ?? TYPE_LABEL[o.expansionType];
  const amount = money(closed && o.outcome === "won" ? o.finalArr ?? o.expectedArr : o.expectedArr, o.currency);
  const step = primaryStep(o);
  const more = o.nextSteps.length - 1;

  /** null = closed · "new" = adding · a step id = editing that step. */
  const [composing, setComposing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [due, setDue] = useState("");

  const openNew = () => { setDraft(""); setDue(""); setComposing("new"); };
  const openEdit = (st: NextStep) => { setDraft(st.text); setDue(st.dueDate); setComposing(st.id); };
  const save = () => {
    if (!draft.trim() || !due) return;
    if (composing === "new") edit?.addStep(draft.trim(), due);
    else if (composing) edit?.updateStep(composing, draft.trim(), due);
    setComposing(null);
  };

  return (
    <article
      draggable={!!onDragStart} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={cn(
        "group rounded-lg border bg-surface px-3 py-2.5 transition",
        onOpen && "cursor-pointer",
        !closed && a.tone === "danger" ? "border-danger/40"
          : !closed && a.state === "no_next_step" ? "border-warning/40"
            : "border-border",
        state === "default" && "hover:border-border-strong hover:shadow-[0_1px_6px_rgba(12,12,12,0.07)]",
        state === "hover" && "border-border-strong shadow-[0_1px_6px_rgba(12,12,12,0.07)]",
        state === "selected" && "border-accent ring-2 ring-accent/20",
        state === "dragging" && "rotate-[1deg] opacity-60 shadow-[0_8px_20px_rgba(12,12,12,0.16)]",
      )}
    >
      {/* 1 — account · product, and what it is worth */}
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          {o.account}{kind && <span className="text-fg-subtle/75"> · {kind}</span>}
        </span>
        <span className={cn("shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums",
          closed && o.outcome !== "won" ? "text-fg-subtle" : "text-fg")}>
          {amount}
          {closed && o.outcome !== "won" && <span className="ml-1 text-[10px] font-normal">potential</span>}
        </span>
      </div>

      {/* 2 — the opportunity */}
      <h3 className={cn("mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug", closed ? "text-fg-muted" : "text-fg")}>
        {o.name}
      </h3>

      {closed ? (
        <p className="mt-1.5 truncate text-[11.5px]">
          <span className={o.outcome === "won" ? "font-medium text-success-fg" : "font-medium text-fg-muted"}>
            {OUTCOME_LABEL[o.outcome!]} {fmtShort(o.outcomeDate)}
          </span>
          {o.outcome === "won" && !o.arrRecorded && <span className="text-warning-fg">{" · ARR not recorded"}</span>}
        </p>
      ) : (
        <>
          {/* 3 — the next step queue. Soonest due shows; click it to edit, + to add. */}
          {composing ? (
            <div onClick={(e) => e.stopPropagation()} className="mt-1.5 space-y-1.5">
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setComposing(null); if (e.key === "Enter") save(); }}
                placeholder="What happens next"
                className="w-full rounded-md border border-accent bg-surface px-2 py-1 text-[12.5px] text-fg outline-none" />
              <div className="flex items-center gap-1.5">
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
                  className="rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] text-fg outline-none focus:border-accent" />
                <button disabled={!draft.trim() || !due} onClick={save}
                  className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-fg-on-accent disabled:opacity-40">Save</button>
                <button onClick={() => setComposing(null)} className="rounded-md px-1.5 py-1 text-[11px] text-fg-muted hover:bg-bg-subtle">Cancel</button>
                {composing !== "new" && (
                  <button onClick={() => { edit?.removeStep(composing); setComposing(null); }}
                    className="ml-auto rounded-md px-1.5 py-1 text-[11px] text-fg-subtle hover:bg-bg-subtle hover:text-danger-fg">Done</button>
                )}
              </div>
            </div>
          ) : step ? (
            <div className="mt-1.5 flex items-start gap-1">
              <p
                title={edit ? "Click to edit" : step.text}
                onClick={edit ? (e) => { e.stopPropagation(); openEdit(step); } : undefined}
                className={cn("line-clamp-2 min-w-0 flex-1 rounded text-[12.5px] leading-snug text-fg-muted",
                  edit && "cursor-text hover:bg-bg-subtle")}
              >
                {step.text}
              </p>
              {more > 0 && (
                <span title={`${more} more step${more > 1 ? "s" : ""}`}
                  className="mt-0.5 shrink-0 rounded bg-bg-muted px-1 text-[10px] tabular-nums text-fg-muted">+{more}</span>
              )}
              {edit && (
                <button onClick={(e) => { e.stopPropagation(); openNew(); }} title="Add another step"
                  className="mt-0.5 shrink-0 rounded px-1 text-[13px] leading-none text-fg-subtle transition hover:bg-bg-subtle hover:text-fg">
                  +
                </button>
              )}
            </div>
          ) : (
            <p onClick={edit ? (e) => { e.stopPropagation(); openNew(); } : undefined}
              className={cn("mt-1.5 text-[12.5px] leading-snug text-warning-fg", edit && "cursor-text rounded hover:bg-bg-subtle")}>
              + Add a next step
            </p>
          )}

          {/* 4 — owner, one attention state, confidence */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {edit
              ? <OwnerPicker value={o.ownerEmail} onChange={edit.setOwner} />
              : <Avatar email={o.ownerEmail} size={16} />}
            <span className={cn("min-w-0 truncate", TONE_TEXT[a.tone])}>{a.label}</span>
            <span className="ml-auto shrink-0">
              {edit
                ? <ConfidencePicker value={o.confidence} onChange={edit.setConfidence} />
                : o.confidence && <span className={CONFIDENCE_TONE[o.confidence]}>{CONFIDENCE_LABEL[o.confidence]}</span>}
            </span>
          </div>
        </>
      )}
    </article>
  );
}

/* ── List ─────────────────────────────────────────────────────────────────── */

function ListView({ items, sort, setSort, onOpen }: {
  items: Opportunity[];
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  onOpen: (id: string) => void;
}) {
  const ATT_RANK = (o: Opportunity) => ATTENTION_ORDER.indexOf(attention(o).state);
  const val = (o: Opportunity): string | number => {
    switch (sort.key) {
      case "account": return o.account;
      case "name": return o.name;
      case "arr": return -(o.expectedArr ?? 0);
      case "owner": return name(o.ownerEmail);
      case "close": return o.expectedCloseDate ?? "9999";
      case "momentum": return ATT_RANK(o);
      default: {
        const d = dueState(o);
        return d.state === "overdue" ? -1000 + -d.days : d.state === "none" ? -500 : d.days;
      }
    }
  };
  // Closed always sinks, whatever the sort. A won deal is not "due" anything.
  const rows = [...items].sort((a, b) => {
    const ca = isClosed(a) ? 1 : 0, cb = isClosed(b) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const va = val(a), vb = val(b);
    if (va === vb) return a.account.localeCompare(b.account);
    return (va < vb ? -1 : 1) * sort.dir;
  });

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-3 py-2 text-left font-medium", className)}>
      <button onClick={() => setSort({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : 1 })}
        className="inline-flex items-center gap-1 hover:text-fg">
        {children}
        {sort.key === k && <span className="text-[9px]">{sort.dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1000px] border-collapse">
        <thead className="sticky top-0 z-10 bg-bg-subtle">
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
            <Th k="account" className="pl-4">Account · Opportunity</Th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Stage</th>
            <Th k="arr">ARR</Th>
            <Th k="owner">Owner</Th>
            <Th k="close">Close</Th>
            <th className="px-3 py-2 text-left font-medium">Next step</th>
            <Th k="due">Due</Th>
            <Th k="momentum" className="pr-4">Attention</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((o) => {
            const due = dueState(o), att = attention(o);
            return (
              <tr key={o.id} onClick={() => onOpen(o.id)} className="cursor-pointer hover:bg-bg-subtle">
                <td className="py-2 pl-4 pr-3">
                  <div className="text-[11px] text-fg-subtle">{o.account}</div>
                  <div className="text-[13px] font-medium text-fg">{o.name}</div>
                </td>
                <td className="px-3"><TypeChip o={o} /></td>
                <td className="px-3">
                  {isClosed(o) ? <OutcomeChip outcome={o.outcome!} />
                    : <span className="text-[12px] text-fg-muted">{STAGE_LABEL[o.stage]}</span>}
                </td>
                <td className="px-3 text-[13px] font-medium tabular-nums text-fg">
                  {money(isClosed(o) ? o.finalArr ?? o.expectedArr : o.expectedArr, o.currency)}
                </td>
                <td className="px-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                    <Avatar email={o.ownerEmail} size={16} />{firstName(o.ownerEmail)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 text-[12px] tabular-nums text-fg-muted">{o.expectedCloseDate ? fmtShort(o.expectedCloseDate) : "—"}</td>
                <td className="max-w-[220px] px-3 text-[12px] text-fg-muted">
                  {isClosed(o) ? <span className="text-fg-subtle">—</span>
                    : primaryStep(o) ? <span className="line-clamp-1">{primaryStep(o)!.text}</span>
                      : <span className="text-warning-fg">Not set</span>}
                </td>
                <td className={cn("whitespace-nowrap px-3 text-[12px] tabular-nums", isClosed(o) ? "text-fg-subtle" : DUE_TONE[due.state])}>
                  {isClosed(o) ? fmtShort(o.outcomeDate) : due.label}
                </td>
                <td className="py-2 pr-4">
                  {isClosed(o) ? <span className="text-[12px] text-fg-subtle">Closed</span> : (
                    <span className={cn("text-[12px]", TONE_TEXT[att.tone])}>{att.label}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Record ───────────────────────────────────────────────────────────────────
   A wide overlay, not a side drawer. A narrow rail forces every field into a
   stacked list and the whole thing reads as a form; two columns let the work
   (next step, updates, activity) sit beside the facts (money, dates, account).
   The board stays visible behind it, so this is still a preview, not a page. */

const HEALTH_TONE: Record<NonNullable<AccountContext["health"]>, string> = {
  healthy: "border-success/30 bg-success-bg text-success-fg",
  watch: "border-warning/30 bg-warning-bg text-warning-fg",
  at_risk: "border-danger/30 bg-danger-bg text-danger-fg",
};

function Record({ o, onClose, onPatch, onMove }: {
  o: Opportunity;
  onClose: () => void;
  onPatch: (p: Partial<Opportunity>, entry?: string) => void;
  onMove: (s: Stage) => void;
}) {
  const acc = ACCOUNTS[o.account];
  const due = dueState(o), mo = momentum(o);
  const closed = isClosed(o);
  const [addingStep, setAddingStep] = useState(false);
  const [stepText, setStepText] = useState("");
  const [stepDue, setStepDue] = useState("");
  const [note, setNote] = useState("");
  const [justPosted, setJustPosted] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptDue, setPromptDue] = useState("");

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-cosmos/35 p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86vh] w-full max-w-[960px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">

        {/* Header — what it is, what it is worth, where it stands */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-fg-subtle">{o.account}</div>
              <h2 className="mt-0.5 font-display text-[20px] font-semibold leading-tight tracking-tight text-fg">{o.name}</h2>
              {o.description && <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-fg-muted">{o.description}</p>}
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-[24px] font-semibold leading-none tabular-nums tracking-tight text-fg">
                {moneyFull(closed && o.outcome === "won" ? o.finalArr : o.expectedArr, o.currency)}
              </div>
              <div className="mt-1.5 text-[11px] text-fg-subtle">
                {closed && o.outcome === "won" ? "Final ARR" : "ARR"}
              </div>
            </div>
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

          {/* Where it is, and how to move it — one control, not a chip plus a bar */}
          <StageStepper o={o} onMove={onMove} />
        </div>

        {/* Body — work on the left, facts on the right */}
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px] overflow-hidden">

          <div className="min-h-0 overflow-y-auto px-6 py-4">
          {!closed && (
            <div className={cn("mt-4 rounded-lg border px-3 py-2.5",
              due.state === "overdue" ? "border-danger/30 bg-danger-bg"
                : due.state === "none" ? "border-warning/30 bg-warning-bg"
                  : "border-border bg-bg-subtle")}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
                  Next step{o.nextSteps.length > 1 ? ` · ${o.nextSteps.length}` : ""}
                </span>
                <span className={cn("ml-auto text-[11px] tabular-nums", DUE_TONE[due.state])}>{due.label}</span>
              </div>

              <ul className="mt-2 space-y-2">
                {[...o.nextSteps].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).map((st, i) => (
                  <li key={st.id} className="flex items-start gap-2">
                    <button
                      onClick={() => onPatch({ nextSteps: o.nextSteps.filter((x) => x.id !== st.id) }, "Next step completed")}
                      title="Mark done"
                      className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-border-strong text-[9px] text-transparent transition hover:border-success hover:bg-success hover:text-white">
                      ✓
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block leading-snug", i === 0 ? "text-[14px] text-fg" : "text-[13px] text-fg-muted")}>{st.text}</span>
                      <span className="text-[11px] tabular-nums text-fg-subtle">{fmt(st.dueDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {addingStep ? (
                <div className="mt-2 space-y-1.5">
                  <input autoFocus value={stepText} onChange={(e) => setStepText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setAddingStep(false); }}
                    placeholder="What happens next" className={field} />
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)} className={cn(field, "w-[150px]")} />
                    <Btn primary disabled={!stepText.trim() || !stepDue}
                      onClick={() => {
                        onPatch({ nextSteps: [...o.nextSteps, { id: `s${o.nextSteps.length + 1}-${stepDue}`, text: stepText.trim(), dueDate: stepDue }] },
                          `Next step added · due ${fmtShort(stepDue)}`);
                        setStepText(""); setStepDue(""); setAddingStep(false);
                      }}>Add</Btn>
                    <Btn onClick={() => setAddingStep(false)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingStep(true)}
                  className="mt-2 rounded-md px-1 py-0.5 text-[12px] font-medium text-accent hover:bg-surface">
                  + Add {o.nextSteps.length ? "another step" : "a next step"}
                </button>
              )}
            </div>
          )}

            {o.outcome === "won" && (
              <div className="rounded-lg border border-success/25 bg-success-bg/60 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <OutcomeChip outcome="won" />
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] capitalize text-fg-muted">{o.agreementType}</span>
                  <span className={cn("rounded border px-1.5 py-0.5 text-[10px]",
                    o.arrRecorded ? "border-border text-fg-muted" : "border-warning/40 bg-warning-bg text-warning-fg")}>
                    {o.arrRecorded ? "ARR recorded" : "ARR not recorded"}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-fg-muted">Confirmed by {o.confirmedBy} on {fmt(o.outcomeDate)}.</p>
                {!o.arrRecorded && (
                  <Btn primary className="mt-2.5" onClick={() => onPatch({ arrRecorded: true }, "ARR recorded against the ledger")}>
                    Mark ARR as recorded
                  </Btn>
                )}
              </div>
            )}
            {(o.outcome === "lost" || o.outcome === "dropped") && (
              <div className="rounded-lg border border-border bg-bg-subtle px-4 py-3">
                <OutcomeChip outcome={o.outcome} />
                <p className="mt-2 text-[14px] text-fg">{o.closeReason}</p>
                <p className="mt-0.5 text-[12px] text-fg-subtle">Closed {fmt(o.outcomeDate)}</p>
              </div>
            )}

            <div className="mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Notes</div>

              {!closed && !justPosted && (
                <div className="mt-2 flex items-start gap-1.5">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note"
                    className={cn(field, "resize-none")} />
                  <Btn primary disabled={!note.trim()}
                    onClick={() => {
                      onPatch({ latestNote: { body: note.trim(), at: TODAY, author: name(ME) } }, "Note added");
                      setNote("");
                      setJustPosted(true);
                      setPromptText("");
                      setPromptDue("");
                    }}>
                    Add
                  </Btn>
                </div>
              )}

              {/* Writing down what happened is the moment you know what happens next. */}
              {!closed && justPosted && (
                <div className="mt-2 rounded-lg border border-accent/40 bg-accent-soft/50 px-3 py-2.5">
                  <div className="text-[12px] font-medium text-fg">Note added. What happens next?</div>
                  {primaryStep(o) && (
                    <p className="mt-1 text-[11.5px] text-fg-muted">
                      Currently: {primaryStep(o)!.text} · {dueState(o).label.toLowerCase()}
                    </p>
                  )}
                  <input autoFocus value={promptText} onChange={(e) => setPromptText(e.target.value)}
                    placeholder={primaryStep(o) ? "Add another step" : "What happens next"}
                    className={cn(field, "mt-2")} />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input type="date" value={promptDue} onChange={(e) => setPromptDue(e.target.value)} className={cn(field, "w-[150px]")} />
                    <Btn primary disabled={!promptText.trim() || !promptDue}
                      onClick={() => {
                        onPatch({ nextSteps: [...o.nextSteps, { id: `s${o.nextSteps.length + 1}-${promptDue}`, text: promptText.trim(), dueDate: promptDue }] },
                          `Next step added · due ${fmtShort(promptDue)}`);
                        setJustPosted(false);
                      }}>
                      Set next step
                    </Btn>
                    <Btn onClick={() => setJustPosted(false)}>{primaryStep(o) ? "Keep current" : "Skip"}</Btn>
                  </div>
                  {!primaryStep(o) && (
                    <p className="mt-1.5 text-[11px] text-warning-fg">Skipping leaves this flagged as needing attention.</p>
                  )}
                </div>
              )}

              {o.latestNote ? (
                <div className="mt-2 rounded-lg border border-border px-3.5 py-2.5">
                  <p className="text-[13px] leading-relaxed text-fg">{o.latestNote.body}</p>
                  <p className="mt-1.5 text-[11px] text-fg-subtle">{o.latestNote.author} · {fmt(o.latestNote.at)}</p>
                </div>
              ) : <p className="mt-2 text-[12px] text-fg-subtle">No notes yet.</p>}
            </div>

            <div className="mt-5 pb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Activity</div>
              <ol className="relative mt-2.5 space-y-2.5 pl-4">
                <span className="absolute bottom-2 left-[3px] top-2 w-px bg-border" aria-hidden />
                {[...o.history].reverse().map((h, i) => (
                  <li key={i} className="relative flex items-baseline gap-2">
                    <span className="absolute -left-4 top-1.5 size-[7px] rounded-full border-2 border-surface bg-border-strong" aria-hidden />
                    <span className="flex-1 text-[12.5px] text-fg-muted">{h.what}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{fmtShort(h.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Right rail — the account, then the facts */}
          <aside className="min-h-0 overflow-y-auto border-l border-border bg-bg-subtle/50 px-4 py-4">
            {acc && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Account</div>
                <div className="mt-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{o.account}</span>
                    {acc.health && (
                      <span className={cn("ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium", HEALTH_TONE[acc.health])}>
                        {HEALTH_LABEL[acc.health]}{acc.healthScore != null && ` ${acc.healthScore}`}
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 space-y-1 text-[12px]">
                    {acc.arr != null && <Line k="Current ARR" v={moneyFull(acc.arr, acc.currency ?? "USD")} />}
                    {acc.plan && <Line k="Plan" v={acc.plan} />}
                    {acc.since && <Line k="Client since" v={String(new Date(`${acc.since}T00:00:00Z`).getUTCFullYear())} />}
                  </dl>
                  {!acc.arr && !acc.health && (
                    <p className="mt-1 text-[11px] leading-snug text-fg-subtle">
                      Health and current ARR are not in the imported pipeline.
                    </p>
                  )}
                  <button className="mt-2 text-[11px] text-accent hover:underline">Open client profile →</button>
                </div>
              </>
            )}

            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">Details</div>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <Line k="Owner" v={
                  <span className="inline-flex items-center gap-1.5">
                    <OwnerPicker value={o.ownerEmail} onChange={(email) => onPatch({ ownerEmail: email }, email ? `Owner → ${name(email)}` : "Owner cleared")} />
                    <span className={o.ownerEmail ? "" : "text-warning-fg"}>{name(o.ownerEmail)}</span>
                  </span>
                } />
                <Line k="Confidence" v={
                  <span className="flex gap-1">
                    {(["high", "medium", "low"] as Confidence[]).map((c) => (
                      <button key={c}
                        onClick={() => onPatch({ confidence: o.confidence === c ? null : c }, o.confidence === c ? "Confidence cleared" : `Confidence → ${CONFIDENCE_LABEL[c]}`)}
                        className={cn("rounded border px-1.5 py-0.5 text-[11px] transition",
                          o.confidence === c ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-subtle hover:bg-bg-subtle")}>
                        {CONFIDENCE_LABEL[c]}
                      </button>
                    ))}
                  </span>
                } />
                <Line k="Expected close" v={o.expectedCloseDate ? fmt(o.expectedCloseDate) : <span className="text-warning-fg">Not set</span>} />
                {o.proposalDate && <Line k="Proposal sent" v={fmt(o.proposalDate)} />}
                <Line k="Last activity" v={`${fmtShort(o.lastActivityAt)} · ${daysSince(o.lastActivityAt)}d ago`} />
              </dl>
            </div>
          </aside>
        </div>

      </div>
    </div>
  );
}

/** Where the opportunity is, and the way to move it. Click any stage. */
function StageStepper({ o, onMove }: { o: Opportunity; onMove: (s: Stage) => void }) {
  const current = STAGES.findIndex((s) => s.id === o.stage);
  return (
    <div className="mt-3.5">
      <div className="flex gap-1">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const isClosedStage = s.id === "closed";
          const tone = active && isClosedStage && o.outcome === "won" ? "bg-success"
            : active && isClosedStage ? "bg-fg-muted"
              : active || done ? "bg-accent" : "bg-bg-muted";
          return (
            <button key={s.id} onClick={() => !active && onMove(s.id)} disabled={active}
              title={active ? `Currently ${s.label}` : `Move to ${s.label}`}
              className="group min-w-0 flex-1 text-left">
              <span className={cn("block h-1 rounded-full transition", tone,
                !active && "group-hover:bg-accent/60")} />
              <span className={cn("mt-1.5 block truncate text-[11px] transition",
                active ? "font-semibold text-fg" : "text-fg-subtle group-hover:text-fg-muted")}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10.5px] text-fg-subtle">
        {o.outcome ? `Closed ${OUTCOME_LABEL[o.outcome]} · click a stage to reopen` : "Click a stage to move this opportunity"}
      </p>
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-[86px] shrink-0 text-fg-subtle">{k}</dt>
      <dd className="min-w-0 flex-1 text-fg">{v}</dd>
    </div>
  );
}


/* ── Outcome sheets ───────────────────────────────────────────────────────── */

/* ── Closing ──────────────────────────────────────────────────────────────────
   One sheet. Choosing the outcome expands its fields in place rather than
   swapping to a second dialog — closing a deal is one decision, not two. */

function CloseSheet({ o, onCancel, onConfirm }: {
  o: Opportunity;
  onCancel: () => void;
  onConfirm: (patch: Partial<Opportunity>, entry: string) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const [finalArr, setFinalArr] = useState(String(o.expectedArr ?? ""));
  const [agreementType, setAgreementType] = useState<AgreementType>("written");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [arrRecorded, setArrRecorded] = useState(false);
  const [reason, setReason] = useState("");

  const ready = outcome === "won"
    ? !!finalArr && !!confirmedBy.trim()
    : outcome ? !!reason : false;

  const submit = () => {
    if (outcome === "won") {
      onConfirm({
        outcome: "won", outcomeDate: TODAY, finalArr: Number(finalArr),
        agreementType, confirmedBy: confirmedBy.trim(), arrRecorded,
      }, `Closed Won · ${agreementType} · ${moneyFull(Number(finalArr), o.currency)}`);
    } else if (outcome) {
      onConfirm({ outcome, outcomeDate: TODAY, closeReason: reason },
        `Closed ${OUTCOME_LABEL[outcome]} · ${reason}`);
    }
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
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">{o.account} · {o.name}</p>
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
            </div>
          )}

          {(outcome === "lost" || outcome === "dropped") && (
            <div className="space-y-2.5 border-t border-border pt-3.5">
              <p className="text-[12px] text-fg-subtle">
                {outcome === "lost" ? "Why did it not land?" : "Why did we stop?"} Nothing is written to the ARR ledger.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(outcome === "lost" ? LOSS_REASONS : DROP_REASONS).map((r) => (
                  <button key={r} onClick={() => setReason(r)}
                    className={cn("rounded-md border px-2.5 py-1 text-[12px] transition",
                      reason === r ? "border-accent bg-accent-soft text-accent" : "border-border text-fg-muted hover:bg-bg-subtle")}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn primary disabled={!ready} onClick={submit}>
            {outcome ? `Mark ${OUTCOME_LABEL[outcome]}` : "Choose an outcome"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[92px] shrink-0 text-[12px] text-fg-subtle">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
