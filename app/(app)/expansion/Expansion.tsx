"use client";

/* =========================================================================
   Expansion — a simple expansion CRM, Kanban first.

   Spec: docs/specs/revenue/expansion-opportunities-specification.md
   Built from the approved prototype at /scratch-expansion; appearance and
   interaction are that prototype's, data and permissions are real.

   The board carries the insight, so the card has to. Each card answers four
   questions without being opened —

     What are we expanding?   account, product
     What is it worth?        expected ARR
     What happens next?       the next step, as readable text
     Is it moving or stuck?   one attention state, from lib/expansion/attention

   Dragging a card moves it immediately and offers Undo. Only a drop on Closed
   asks a question, because only Closed is hard to reverse.

   Every mutation is optimistic and then reconciled: local state moves at once,
   the server action runs, and a refusal (a permission, a vanished row) rolls
   the board back and says why. Nothing here decides whether a write is allowed.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  attention, dueState, isClosed, needsAttention, primaryStep,
  ATTENTION_ORDER, type AttentionState,
} from "@/lib/expansion/attention";
import { firstNameOf, fmtShort, money, moneyFull } from "@/lib/expansion/format";
import {
  OUTCOME_LABEL, STAGES, STAGE_LABEL, TYPES, TYPE_LABEL,
  type Confidence, type ExpansionBoardData, type NewOpportunityInput,
  type Opportunity, type Stage,
} from "@/lib/expansion/types";
import {
  addNextStepAction, completeNextStepAction, createOpportunityAction, moveStageAction,
  setConfidenceAction, setOwnerAction, updateNextStepAction,
  type ExpansionActionResult,
} from "./actions";
import { CloseSheet, CreateForm } from "./dialogs";
import { OpportunityRecord } from "./Record";
import {
  Avatar, Btn, ConfidencePicker, DUE_TONE, OutcomeChip, OwnerPicker, PopLabel, PopRow,
  Popover, TONE_TEXT, TypeChip, type EditHandlers,
} from "./ui";

type Layout = "board" | "list";
type SortKey = "account" | "name" | "arr" | "owner" | "close" | "due" | "momentum";

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function Expansion({ data }: { data: ExpansionBoardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /* Server state is the truth; local state is what the user sees while a write
     is in flight. Re-seeding on every payload is what makes an optimistic edit
     settle into the real row (with its real ids) after the revalidation. */
  const [items, setItems] = useState<Opportunity[]>(data.opportunities);
  useEffect(() => { setItems(data.opportunities); }, [data.opportunities]);

  const { today, people, accounts, canWrite, canDelete, me } = data;

  const [layout, setLayout] = useState<Layout>("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("all");
  const [type, setType] = useState<"all" | (typeof TYPES)[number]>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });

  const [filterOpen, setFilterOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<Opportunity | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  /* One mutation path for the whole page: show the change, run the action, put
     it back if the server says no. A silent failure here is worse than a slow
     one — the board would keep claiming a move that never landed. */
  const pending = useRef(0);
  function mutate(
    optimistic: (prev: Opportunity[]) => Opportunity[],
    run: () => Promise<ExpansionActionResult>,
    onOk?: (res: ExpansionActionResult) => void,
  ) {
    const before = items;
    setItems(optimistic);
    pending.current += 1;
    startTransition(async () => {
      const res = await run();
      pending.current -= 1;
      if (!res.ok) {
        setItems(before);
        setError(res.error ?? "That didn't save.");
        return;
      }
      onOk?.(res);
      router.refresh();
    });
  }

  const patch = (id: string, p: Partial<Opportunity>) =>
    (prev: Opportunity[]) => prev.map((o) => (o.id === id ? { ...o, ...p, lastActivityAt: new Date().toISOString() } : o));

  /* ── Movement — instant, with Undo ── */
  function moveStage(o: Opportunity, to: Stage) {
    if (to === "closed") { setClosing(o); return; }
    const from = o.stage;
    const wasClosed = o.outcome !== null;
    const now = new Date().toISOString();
    mutate(
      patch(o.id, { stage: to, outcome: null, stageChangedAt: now }),
      () => moveStageAction(o.id, to),
      () => setToast({
        msg: `${o.accountName} → ${STAGE_LABEL[to]}`,
        // Undo is a move back, not a rollback: it is a real edit with its own
        // activity line, because pretending the first move never happened would
        // leave the log lying about what people did.
        undo: wasClosed ? undefined : () => {
          setToast(null);
          mutate(patch(o.id, { stage: from, stageChangedAt: o.stageChangedAt }), () => moveStageAction(o.id, from));
        },
      }),
    );
  }

  const edit = (o: Opportunity) => ({
    addStep: (text: string, dueDate: string) => {
      const temp = `pending-${Date.now()}`;
      mutate(
        patch(o.id, { nextSteps: [...o.nextSteps, { id: temp, text, dueDate }] }),
        () => addNextStepAction(o.id, text, dueDate),
        (res) => res.id && setItems((prev) => prev.map((x) => x.id === o.id
          ? { ...x, nextSteps: x.nextSteps.map((s) => (s.id === temp ? { ...s, id: res.id! } : s)) }
          : x)),
      );
    },
    updateStep: (stepId: string, text: string, dueDate: string) =>
      mutate(
        patch(o.id, { nextSteps: o.nextSteps.map((s) => (s.id === stepId ? { ...s, text, dueDate } : s)) }),
        () => updateNextStepAction(o.id, stepId, text, dueDate),
      ),
    completeStep: (stepId: string) =>
      mutate(
        patch(o.id, { nextSteps: o.nextSteps.filter((s) => s.id !== stepId) }),
        () => completeNextStepAction(o.id, stepId),
      ),
    setOwner: (email: string | null) =>
      mutate(
        patch(o.id, { ownerEmail: email, ownerName: email ? people.find((p) => p.email === email)?.name ?? email : null }),
        () => setOwnerAction(o.id, email),
      ),
    setConfidence: (c: Confidence | null) =>
      mutate(patch(o.id, { confidence: c }), () => setConfidenceAction(o.id, c)),
  });

  function create(draft: NewOpportunityInput) {
    setCreating(false);
    startTransition(async () => {
      const res = await createOpportunityAction(draft);
      if (!res.ok) { setError(res.error ?? "That didn't save."); return; }
      setToast({ msg: "Opportunity created" });
      router.refresh();
      if (res.id) setOpenId(res.id);
    });
  }

  /* ── Filters ── */
  const visible = useMemo(() => items.filter((o) => {
    if (owner !== "all" && (o.ownerEmail ?? "none") !== owner) return false;
    if (type !== "all" && o.expansionType !== type) return false;
    if (q && !`${o.accountName} ${o.name} ${o.product ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (attentionOnly && !needsAttention(o, today)) return false;
    return true;
  }), [items, owner, type, q, attentionOnly, today]);

  /* ── Portfolio summary — one line, three numbers ──
     Totals are per currency and never converted: there is no reporting rate in
     Signal, and a silently converted total is a wrong number that looks right
     (decision D-4). Every account is USD today, so the extra chips stay hidden. */
  const openItems = items.filter((o) => !isClosed(o));
  const sumBy = (rows: Opportunity[], value: (o: Opportunity) => number | null) => {
    const by = new Map<string, number>();
    for (const o of rows) by.set(o.currency, (by.get(o.currency) ?? 0) + (value(o) ?? 0));
    return [...by].filter(([, n]) => n > 0);
  };
  const openArr = sumBy(openItems, (o) => o.expectedArr);
  const wonArr = sumBy(items.filter((o) => o.outcome === "won"), (o) => o.finalArr);
  const attentionCount = openItems.filter((o) => needsAttention(o, today)).length;

  const record = items.find((o) => o.id === openId) ?? null;
  const filtersOn = owner !== "all" || type !== "all" || !!q;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Title bar — controls on row one, summary on row two */}
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
              <button onClick={() => setFilterOpen((v) => !v)}
                className={cn("rounded-md px-2 py-1 text-[12px] transition hover:bg-bg-subtle hover:text-fg",
                  filtersOn ? "bg-bg-muted text-fg" : "text-fg-muted")}>
                Filter{filtersOn && <span className="ml-1 text-accent">•</span>}
              </button>
              <Popover open={filterOpen} onClose={() => setFilterOpen(false)}>
                <div className="max-h-80 overflow-y-auto">
                  <PopLabel>Owner</PopLabel>
                  <PopRow label="Anyone" onClick={() => setOwner("all")} selected={owner === "all"} />
                  {me && <PopRow label="Mine" onClick={() => setOwner(me)} selected={owner === me} />}
                  {people.filter((p) => p.email !== me).map((p) => (
                    <PopRow key={p.email} label={p.name} onClick={() => setOwner(p.email)} selected={owner === p.email} />
                  ))}
                  <PopRow label="Unassigned" onClick={() => setOwner("none")} selected={owner === "none"} />
                  <PopLabel>Expansion type</PopLabel>
                  <PopRow label="Any" onClick={() => setType("all")} selected={type === "all"} />
                  {TYPES.map((t) => <PopRow key={t} label={TYPE_LABEL[t]} onClick={() => setType(t)} selected={type === t} />)}
                </div>
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
            {canWrite && <Btn primary className="ml-1" onClick={() => setCreating(true)}>+ New</Btn>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border-subtle bg-bg-subtle/60 px-4 py-2">
          <Stat n={String(openItems.length)} label="open" />
          <Stat n={openArr.length ? openArr.map(([c, n]) => money(n, c)).join(" + ") : "—"} label="open ARR" />
          <Stat n={wonArr.length ? wonArr.map(([c, n]) => money(n, c)).join(" + ") : "—"} label="won" tone="text-success-fg" />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {items.length === 0 ? (
          <Empty canWrite={canWrite} unavailable={data.unavailable} onCreate={() => setCreating(true)} />
        ) : layout === "board" ? (
          <Board
            items={visible} today={today} people={people} canWrite={canWrite}
            onOpen={setOpenId} onMove={moveStage} openId={openId} edit={edit}
            filtered={filtersOn || attentionOnly}
          />
        ) : (
          <ListView items={visible} today={today} sort={sort} setSort={setSort} onOpen={setOpenId} />
        )}
      </div>

      {creating && (
        <CreateForm accounts={accounts} people={people} me={me} today={today}
          onClose={() => setCreating(false)} onCreate={create} />
      )}

      {record && (
        <OpportunityRecord
          o={record} today={today} people={people} canWrite={canWrite} canDelete={canDelete}
          accounts={accounts}
          onClose={() => setOpenId(null)}
          onMove={(s) => moveStage(record, s)}
          onClosing={() => setClosing(record)}
          edit={edit(record)}
          onChanged={() => router.refresh()}
          onError={setError}
        />
      )}

      {closing && (
        <CloseSheet
          o={closing}
          onCancel={() => setClosing(null)}
          onDone={(msg) => {
            setClosing(null);
            setToast({ msg });
            router.refresh();
          }}
          onError={(e) => { setClosing(null); setError(e); }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-cosmos px-3.5 py-2 text-[12px] text-white shadow-xl">
            <span>{toast.msg}</span>
            {toast.undo && <button onClick={toast.undo} className="font-medium text-stellar hover:underline">Undo</button>}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center">
          <div className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger-bg px-3.5 py-2 text-[12px] text-danger-fg shadow-xl">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-medium hover:underline">Dismiss</button>
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

function Empty({ canWrite, unavailable, onCreate }: {
  canWrite: boolean; unavailable: boolean; onCreate: () => void;
}) {
  /* "Nothing here" and "we could not read" are the same empty array and must
     never be the same sentence. A board that says the pipeline is empty when
     the database is merely unreachable is the page telling the exact lie it
     exists to prevent. */
  if (unavailable) {
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="max-w-md text-center">
          <h2 className="font-display text-[18px] font-semibold text-fg">Expansion couldn&apos;t be loaded</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            The database didn&apos;t answer, so this board is showing nothing rather than
            claiming there is nothing. Reload in a moment.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="max-w-md text-center">
        <h2 className="font-display text-[18px] font-semibold text-fg">No expansion opportunities yet</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          An opportunity is one expansion motion inside one account — more licences, another
          module, a new department. Recording it is what keeps it from going quiet.
        </p>
        {canWrite && <Btn primary className="mt-4" onClick={onCreate}>+ New opportunity</Btn>}
      </div>
    </div>
  );
}

/* ── Board ────────────────────────────────────────────────────────────────── */

function Board({ items, today, people, canWrite, onOpen, onMove, filtered, openId, edit }: {
  items: Opportunity[];
  today: string;
  people: ExpansionBoardData["people"];
  canWrite: boolean;
  onOpen: (id: string) => void;
  onMove: (o: Opportunity, s: Stage) => void;
  filtered: boolean;
  openId: string | null;
  edit: (o: Opportunity) => EditHandlers;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  return (
    <div className="grid h-full grid-cols-4 gap-px overflow-hidden bg-border">
      {STAGES.map((col) => {
        const cards = items.filter((o) => o.stage === col.id);
        const isClosedCol = col.id === "closed";
        // Closed totals WON money only — a loss is not a total.
        const counted = isClosedCol ? cards.filter((o) => o.outcome === "won") : cards;
        const by = new Map<string, number>();
        for (const o of counted) {
          // A Won row falls back to its expected figure the same way its card
          // does, so the column total and the cards under it can never disagree.
          const v = (o.outcome === "won" ? o.finalArr ?? o.expectedArr : o.expectedArr) ?? 0;
          by.set(o.currency, (by.get(o.currency) ?? 0) + v);
        }
        const totals = [...by].filter(([, n]) => n > 0);

        return (
          <section
            key={col.id}
            onDragOver={canWrite ? (e) => { e.preventDefault(); setOver(col.id); } : undefined}
            onDragLeave={() => setOver((v) => (v === col.id ? null : v))}
            onDrop={canWrite ? (e) => {
              e.preventDefault(); setOver(null);
              const o = items.find((x) => x.id === (dragId ?? e.dataTransfer.getData("text/plain")));
              setDragId(null);
              if (o && o.stage !== col.id) onMove(o, col.id);
            } : undefined}
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
                  {totals.length ? moneyFull(totals[0][1], totals[0][0]) : moneyFull(0)}
                </span>
                {totals.slice(1).map(([c, n]) => (
                  <span key={c} className="text-[11px] tabular-nums text-fg-subtle">+ {money(n, c)}</span>
                ))}
                {isClosedCol && <span className="text-[11px] text-fg-subtle">won</span>}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {cards.map((o) => (
                <Card
                  key={o.id} o={o} today={today} people={people} canWrite={canWrite}
                  state={dragId === o.id ? "dragging" : openId === o.id ? "selected" : "default"}
                  onOpen={() => onOpen(o.id)}
                  onDragStart={canWrite ? (e) => {
                    setDragId(o.id);
                    e.dataTransfer.setData("text/plain", o.id);
                    e.dataTransfer.effectAllowed = "move";
                  } : undefined}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  edit={canWrite ? edit(o) : undefined}
                />
              ))}

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

/* ── The card ─────────────────────────────────────────────────────────────────
   One anatomy for every state. Nothing is added or removed because an
   opportunity is overdue, so the card never changes height when its status
   changes.

     1  account · product                              expected ARR
     2  opportunity name                     (up to two lines)
     3  next step                            (up to two lines)
     4  owner · one attention state · confidence

   Exactly one attention state per card, chosen by the precedence in
   lib/expansion/attention.ts. Never a second warning.

   THE NEXT STEP IS READ-ONLY HERE (owner's decision, /scratch-expansion-revised
   variant B). The card reports; the record edits. Two consequences worth keeping
   in mind rather than rediscovering:

     - With no step, line 3 is a quiet dash, NOT "No next step". The footer
       already carries that in amber, and a card that says the same sentence
       twice is louder without being clearer.
     - The dash still occupies the line, so the card is the same height whether
       a step exists or not — the whole point of one anatomy.

   Owner and confidence stay editable: they are single values, set from a
   picker in one click, with nothing to type. */

export function Card({ o, today, people, canWrite, onOpen, state = "default", onDragStart, onDragEnd, edit }: {
  o: Opportunity;
  today: string;
  people: ExpansionBoardData["people"];
  canWrite: boolean;
  onOpen?: () => void;
  state?: "default" | "selected" | "dragging";
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Only the one-click fields. Step editing lives in the record. */
  edit?: Pick<EditHandlers, "setOwner" | "setConfidence">;
}) {
  const closed = isClosed(o);
  const a = attention(o, today);
  const kind = o.product ?? TYPE_LABEL[o.expansionType];
  const amount = money(closed && o.outcome === "won" ? o.finalArr ?? o.expectedArr : o.expectedArr, o.currency);
  const step = primaryStep(o);
  const more = o.nextSteps.length - 1;

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
        state === "selected" && "border-accent ring-2 ring-accent/20",
        state === "dragging" && "rotate-[1deg] opacity-60 shadow-[0_8px_20px_rgba(12,12,12,0.16)]",
      )}
    >
      {/* 1 — account · product, and what it is worth */}
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          {o.accountName}{kind && <span className="text-fg-subtle/75"> · {kind}</span>}
        </span>
        <span className={cn("shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums",
          closed && o.outcome !== "won" ? "text-fg-subtle" : "text-fg")}>
          {amount}
          {/* A Lost card must never show a bare figure — unqualified, it reads
              as revenue won. */}
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
            {o.outcome !== "won" && o.closeReason ? ` · ${o.closeReason}` : ""}
          </span>
          {o.outcome === "won" && !o.arrRecorded && <span className="text-warning-fg">{" · ARR not recorded"}</span>}
        </p>
      ) : (
        <>
          {/* 3 — the next step. Read-only: the soonest-due one, and a count of
              the rest. Opening the card is how it gets written. */}
          {step ? (
            <div className="mt-1.5 flex items-start gap-1">
              <p title={step.text}
                className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug text-fg-muted">
                {step.text}
              </p>
              {more > 0 && (
                <span title={`${more} more step${more > 1 ? "s" : ""}`}
                  className="mt-0.5 shrink-0 rounded bg-bg-muted px-1 text-[10px] tabular-nums text-fg-muted">+{more}</span>
              )}
            </div>
          ) : (
            // Deliberately a dash, not "No next step" — the footer says that,
            // in amber, and once is enough. This holds the line so the card
            // keeps its height.
            <p aria-hidden className="mt-1.5 text-[12.5px] leading-snug text-fg-subtle/60">—</p>
          )}

          {/* 4 — owner, one attention state, confidence */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <OwnerPicker value={o.ownerEmail} name={o.ownerName} people={people}
              canWrite={!!edit && canWrite} onChange={(email) => edit?.setOwner(email)} />
            <span className={cn("min-w-0 truncate", TONE_TEXT[a.tone])}>{a.label}</span>
            <span className="ml-auto shrink-0">
              <ConfidencePicker value={o.confidence} canWrite={!!edit && canWrite}
                onChange={(c) => edit?.setConfidence(c)} />
            </span>
          </div>
        </>
      )}
    </article>
  );
}

/* ── List ─────────────────────────────────────────────────────────────────── */

function ListView({ items, today, sort, setSort, onOpen }: {
  items: Opportunity[];
  today: string;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  onOpen: (id: string) => void;
}) {
  const rank = (s: AttentionState) => ATTENTION_ORDER.indexOf(s);
  const val = (o: Opportunity): string | number => {
    switch (sort.key) {
      case "account": return o.accountName;
      case "name": return o.name;
      case "arr": return -(o.expectedArr ?? 0);
      case "owner": return o.ownerName ?? "zzz";
      case "close": return o.expectedCloseDate ?? "9999";
      case "momentum": return rank(attention(o, today).state);
      default: {
        const d = dueState(o, today);
        return d.state === "overdue" ? -1000 - d.days : d.state === "none" ? -500 : d.days;
      }
    }
  };
  // Closed always sinks, whatever the sort. A won deal is not "due" anything.
  const rows = [...items].sort((a, b) => {
    const ca = isClosed(a) ? 1 : 0, cb = isClosed(b) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const va = val(a), vb = val(b);
    if (va === vb) return a.accountName.localeCompare(b.accountName);
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
            const due = dueState(o, today), att = attention(o, today);
            const step = primaryStep(o);
            return (
              <tr key={o.id} onClick={() => onOpen(o.id)} className="cursor-pointer hover:bg-bg-subtle">
                <td className="py-2 pl-4 pr-3">
                  <div className="text-[11px] text-fg-subtle">{o.accountName}</div>
                  <div className="text-[13px] font-medium text-fg">{o.name}</div>
                </td>
                <td className="px-3"><TypeChip o={o} /></td>
                <td className="px-3">
                  {isClosed(o) ? <OutcomeChip outcome={o.outcome!} />
                    : <span className="text-[12px] text-fg-muted">{STAGE_LABEL[o.stage]}</span>}
                </td>
                <td className="px-3 text-[13px] font-medium tabular-nums text-fg">
                  {money(isClosed(o) ? o.finalArr ?? o.expectedArr : o.expectedArr, o.currency)}
                  {isClosed(o) && o.outcome !== "won" && <span className="ml-1 text-[10px] font-normal text-fg-subtle">potential</span>}
                </td>
                <td className="px-3">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                    <Avatar name={o.ownerName} size={16} />{firstNameOf(o.ownerName)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 text-[12px] tabular-nums text-fg-muted">
                  {o.expectedCloseDate ? fmtShort(o.expectedCloseDate) : "—"}
                </td>
                <td className="max-w-[220px] px-3 text-[12px] text-fg-muted">
                  {isClosed(o) ? <span className="text-fg-subtle">—</span>
                    : step ? <span className="line-clamp-1">{step.text}</span>
                      : <span className="text-warning-fg">Not set</span>}
                </td>
                <td className={cn("whitespace-nowrap px-3 text-[12px] tabular-nums", isClosed(o) ? "text-fg-subtle" : DUE_TONE[due.state])}>
                  {isClosed(o) ? fmtShort(o.outcomeDate) : due.label}
                </td>
                <td className="py-2 pr-4">
                  <span className={cn("text-[12px]", TONE_TEXT[att.tone])}>{att.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
