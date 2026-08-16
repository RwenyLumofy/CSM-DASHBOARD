"use client";

/* =========================================================================
   Prototype — the card refinement, reviewed.

   Baseline (what the board had before) against the revised card, then the
   anatomy, all ten states, and the interaction states. The revised cards here
   are the real component from ../scratch-expansion, not a copy — if the board
   changes, this page changes with it.
   ========================================================================= */

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Card } from "../scratch-expansion/Expansion";
import {
  OPPORTUNITIES, TYPE_LABEL, OUTCOME_LABEL,
  attention, dueState, momentum, isClosed, primaryStep,
  name, initials, money, fmtShort,
  type Opportunity,
} from "../scratch-expansion/data";

const base = OPPORTUNITIES.find((o) => o.id === "p1")!;   // MEWA, Proposed
const v = (patch: Partial<Opportunity>): Opportunity => ({ ...base, ...patch });

/* ── Baseline, kept only so the change is legible ─────────────────────────── */

function BaselineCard({ o }: { o: Opportunity }) {
  const due = dueState(o), mo = momentum(o);
  const overdue = due.state === "overdue";
  return (
    <article className={cn("overflow-hidden rounded-lg border border-l-2 border-border bg-surface",
      overdue ? "border-l-danger" : "border-l-warning")}>
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-fg-subtle">{o.account}</div>
          <div className="mt-0.5 truncate text-[13.5px] font-medium text-fg">{o.name}</div>
        </div>
        <div className="shrink-0 text-[13.5px] font-semibold tabular-nums text-fg">{money(o.expectedArr, o.currency)}</div>
      </div>
      <div className="flex items-center gap-1.5 px-3 pt-1.5">
        <span className="inline-flex items-center rounded border border-border-subtle bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
          {o.product} · {TYPE_LABEL[o.expansionType]}
        </span>
      </div>
      <div className="mx-3 mt-2.5 rounded-md bg-bg-subtle px-2.5 py-2">
        <p className="line-clamp-2 text-[12.5px] leading-snug text-fg">{primaryStep(o)?.text ?? "No next step set"}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-bg-muted text-[8px] font-semibold text-fg-muted">
            {initials(o.ownerEmail)}
          </span>
          <span className="truncate text-[11px] text-fg-muted">{name(o.ownerEmail).split(" ")[0]}</span>
          <span className={cn("ml-auto text-[11px]", overdue ? "font-medium text-danger-fg" : "text-fg-subtle")}>{due.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <span className="size-1 shrink-0 rounded-full bg-info/60" />
        <span className="truncate text-[11px] text-fg-subtle">{o.trigger}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-border-subtle px-3 py-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-info-fg">
          <span className="size-1.5 rounded-full bg-info" />{mo.label || "On track"}
        </span>
        <span className="ml-auto tabular-nums text-fg-subtle">{o.expectedCloseDate ? fmtShort(o.expectedCloseDate) : "—"}</span>
      </div>
    </article>
  );
}

/* ── The ten states ───────────────────────────────────────────────────────── */

const STATES: { n: number; label: string; o: Opportunity; reads: string }[] = [
  { n: 1, label: "Normal", reads: "Due 20 Sep · Close 15 Sep",
    o: v({ stage: "qualified", nextSteps: [{ id: "s1", text: "Send Faisal the two-entity scope", dueDate: "2026-09-20" }], lastActivityAt: "2026-08-10", stageChangedAt: "2026-07-01" }) },
  { n: 2, label: "Due soon", reads: "Due in 2 days",
    o: v({ stage: "qualified", nextSteps: [{ id: "s1", text: "Walk the dean through the quote", dueDate: "2026-08-13" }], lastActivityAt: "2026-08-10", stageChangedAt: "2026-07-01" }) },
  { n: 3, label: "Overdue", reads: "5 days overdue · waiting 8d",
    o: v({}) },
  { n: 4, label: "Missing next step", reads: "No next step · waiting 8d",
    o: v({ nextSteps: [] }) },
  { n: 5, label: "Waiting on client", reads: "Waiting on client 8d · due 20 Aug",
    o: v({ nextSteps: [{ id: "s1", text: "Chase Noura on the 120-seat quote", dueDate: "2026-08-20" }] }) },
  { n: 6, label: "Stalled", reads: "Stalled 22d · due 26 Aug",
    o: v({ stage: "qualified", nextSteps: [{ id: "s1", text: "Send Faisal the two-entity scope", dueDate: "2026-08-26" }], lastActivityAt: "2026-07-20", stageChangedAt: "2026-07-20" }) },
  { n: 7, label: "Recently progressed", reads: "Due 20 Sep · moved 2d ago",
    o: v({ nextSteps: [{ id: "s1", text: "Chase Noura on the 120-seat quote", dueDate: "2026-09-20" }], lastActivityAt: "2026-08-10", stageChangedAt: "2026-08-09" }) },
  /* Nothing in the imported pipeline is closed yet, so these three are constructed. */
  { n: 8, label: "Closed Won", reads: "Won 5 Aug · ARR recorded",
    o: v({ stage: "closed", outcome: "won", outcomeDate: "2026-08-05", finalArr: 116550, arrRecorded: true, nextSteps: [] }) },
  { n: 9, label: "Closed Lost", reads: "Lost 22 Jul · $117K potential",
    o: v({ stage: "closed", outcome: "lost", outcomeDate: "2026-07-22", closeReason: "No budget", nextSteps: [] }) },
  { n: 10, label: "Closed Dropped", reads: "Dropped 15 Jul · $117K potential",
    o: v({ stage: "closed", outcome: "dropped", outcomeDate: "2026-07-15", closeReason: "Account at risk — wrong time", nextSteps: [] }) },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function CardReview() {
  const [dragDemo, setDragDemo] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <p className="border-b border-border bg-bg-subtle px-4 py-1 text-[11px] text-fg-subtle">
        Prototype — the revised cards below are the live component from the board.
      </p>

      <div className="px-6 py-5">
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-fg">Card refinement</h1>
        <p className="mt-1 max-w-[80ch] text-[13px] text-fg-muted">
          Option 2 refined. Same direction, same density, five changes.
        </p>

        {/* 1 — before / after */}
        <Section title="Baseline against revised">
          <div className="flex flex-wrap gap-8">
            <Column label="Baseline" sub="What the board had">
              <BaselineCard o={base} />
            </Column>
            <Column label="Revised" sub="Live component">
              <Card o={base} />
            </Column>
            <div className="min-w-[280px] max-w-[420px] flex-1">
              <ol className="space-y-2.5 text-[12.5px] leading-snug text-fg-muted">
                <Change n="1" what="Product moved into the account line">
                  <code>Bank of Bahrain &amp; Kuwait · Develop</code>. The bordered chip was a container carrying one word.
                </Change>
                <Change n="2" what="Next step is no longer in a tinted box">
                  A box inside a box read as a nested card. It is the third line of text now, and still the longest run of
                  dark text on the card.
                </Change>
                <Change n="3" what="One primary attention state, not two">
                  Baseline showed <em>5 days overdue</em> in the middle and <em>Waiting 8 days</em> in the footer, competing.
                  Now: <strong className="text-fg">5 days overdue</strong> · <span className="text-fg-subtle">waiting 8d</span> —
                  one fact with an explanation.
                </Change>
                <Change n="4" what="The close date is labelled">
                  Baseline showed two unexplained dates. The far right now always reads <code>Close 15 Sep</code>.
                </Change>
                <Change n="5" what="The signal line is readable">
                  Moved up a contrast step, and the decorative dot is gone.
                </Change>
              </ol>
              <p className="mt-3 text-[12px] text-fg-subtle">
                Both cards are the same opportunity. Revised is ~14px shorter and has three fewer containers.
              </p>
            </div>
          </div>
        </Section>

        {/* 2 — anatomy */}
        <Section title="Anatomy">
          <div className="flex flex-wrap gap-8">
            <Column label="" sub="">
              <Card o={base} />
            </Column>
            <ol className="min-w-[300px] max-w-[520px] flex-1 space-y-1.5 text-[12.5px] text-fg-muted">
              <Anat n="1" k="Account · product">Secondary, readable. No account ARR — it would compete with the expansion figure and raise “which ARR, which period”.</Anat>
              <Anat n="2" k="Opportunity · expected ARR">The textual identity and the value, weighted the same. Neither is the headline.</Anat>
              <Anat n="3" k="Next step">Two lines maximum, full text on hover. <code>No next step</code> is an attention state, not blank space.</Anat>
              <Anat n="4" k="Owner · attention · Close">One primary state by precedence; anything else true is quieter after a middot. Far right is always labelled.</Anat>
              <Anat n="5" k="Signal">One line of evidence. Omitted entirely when there is none — no reserved space.</Anat>
            </ol>
          </div>
        </Section>

        {/* 3 — ten states */}
        <Section title="States" note="Same anatomy throughout. The card does not change height or gain badges because something is wrong.">
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {STATES.map(({ n, label, o, reads }) => (
              <div key={n} className="min-w-0">
                <div className="mb-1.5 flex items-baseline gap-1.5">
                  <span className="text-[11px] tabular-nums text-fg-subtle">{n}</span>
                  <span className="text-[12px] font-medium text-fg">{label}</span>
                </div>
                <div className="w-[300px] max-w-full rounded-lg bg-bg-subtle/60 p-2">
                  <Card o={o} />
                </div>
                <p className="mt-1.5 text-[11px] text-fg-subtle">{reads}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 4 — interaction */}
        <Section title="Interaction" note="Resting, pointer, open, and in motion. The drop target shows where the card will land.">
          <div className="flex flex-wrap items-start gap-6">
            {(["default", "hover", "selected", "dragging"] as const).map((st) => (
              <div key={st}>
                <div className="mb-1.5 text-[12px] font-medium capitalize text-fg">{st === "selected" ? "Selected / open" : st}</div>
                <div className="w-[300px] rounded-lg bg-bg-subtle/60 p-2"><Card o={base} state={st} /></div>
              </div>
            ))}

            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg">Drop target</div>
              <div
                onMouseEnter={() => setDragDemo(true)}
                onMouseLeave={() => setDragDemo(false)}
                className={cn("w-[300px] rounded-lg border p-2 transition",
                  dragDemo ? "border-accent bg-accent-soft" : "border-transparent bg-bg-subtle/60")}
              >
                <div className="mb-2 flex items-baseline gap-2 px-1">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-fg-muted">Qualified</span>
                  <span className="rounded-full bg-bg-muted px-1.5 text-[11px] tabular-nums text-fg-muted">3</span>
                </div>
                <Card o={OPPORTUNITIES.find((o) => o.id === "p3")!} />
                {dragDemo && (
                  <div className="mt-2 rounded-lg border-2 border-dashed border-accent/50 bg-accent-soft/60 px-3 py-4 text-center text-[11px] font-medium text-accent">
                    Move to Qualified
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-fg-subtle">Hover the block to see the column and placement indicator.</p>
            </div>
          </div>
        </Section>

        {/* 5 — decisions */}
        <Section title="Decisions">
          <div className="grid max-w-[1100px] gap-4 lg:grid-cols-3">
            <Decisions title="Preserved" tone="border-border" items={[
              "Four columns — Identified, Qualified, Proposed, Closed",
              "Stage headers with count and total expected ARR",
              "The compact portfolio summary line",
              "Search, Filter, Needs attention, New opportunity",
              "Drag between active stages with no form, and Undo",
              "Dragging into Closed asks Won / Lost / Dropped",
              "One line of Signal evidence on the card",
              "Card density — five lines, ~96px",
            ]} />
            <Decisions title="Changed" tone="border-accent/40" items={[
              "Product moved into the account line; the chip is gone",
              "Next step is plain text, not a tinted nested box",
              "One primary attention state by precedence, secondary context quieter",
              "The close date is labelled Close, always far right",
              "Closed cards lead with the outcome; Lost and Dropped amounts read “potential”",
              "Board / List is an explicit selector, not a Display menu",
              "Only Account and Opportunity are required to create",
              "Expansion type and product are separate fields",
              "Dates echo back readable — 15 Sep 2026",
            ]} />
            <Decisions title="Rejected" tone="border-border" items={[
              "Account current ARR on every card — raises which ARR, which period, which currency",
              "ARR as the headline above the opportunity (option 6)",
              "Next step as the headline (option 5) — that is a Today view, not a portfolio",
              "Labelled field rows (option 3) — repeats five labels on every card",
              "Stage progress bar (option 4) — restates the column the card sits in",
              "Multiple warning badges on one card",
              "Different card layouts per status",
            ]} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-border pt-5">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      {note && <p className="mt-1 max-w-[80ch] text-[12.5px] text-fg-subtle">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Column({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="mb-1.5">
          <div className="text-[12px] font-medium text-fg">{label}</div>
          <div className="text-[11px] text-fg-subtle">{sub}</div>
        </div>
      )}
      <div className="w-[300px] rounded-lg bg-bg-subtle/60 p-2">{children}</div>
    </div>
  );
}

function Change({ n, what, children }: { n: string; what: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-bg-muted text-[10px] font-semibold text-fg-muted">{n}</span>
      <span><strong className="font-medium text-fg">{what}.</strong> {children}</span>
    </li>
  );
}

function Anat({ n, k, children }: { n: string; k: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-bg-muted text-[10px] font-semibold text-fg-muted">{n}</span>
      <span><strong className="font-medium text-fg">{k}</strong> — {children}</span>
    </li>
  );
}

function Decisions({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className={cn("rounded-lg border bg-bg-subtle/50 px-4 py-3", tone)}>
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex gap-1.5 text-[12px] leading-snug text-fg-muted">
            <span className="text-fg-subtle">·</span>{t}
          </li>
        ))}
      </ul>
    </div>
  );
}
