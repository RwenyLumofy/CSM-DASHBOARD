"use client";

/* =========================================================================
   Prototype — two changes to Expansion, for a decision.

   1. The board card stops being editable. No inline next-step composer, no
      click-to-edit, no "+". The card reports; the record edits.
   2. The stage rail inside the record becomes a dropdown.

   Shown beside what is live today, at real size, with real tokens. Nothing
   here reads or writes the database and nothing here is wired to the real
   page — this is a sample to choose from.
   ========================================================================= */

import { useState } from "react";
import { cn } from "@/lib/cn";

type Stage = "identified" | "qualified" | "proposed" | "closed";
const STAGES: { id: Stage; label: string }[] = [
  { id: "identified", label: "Identified" },
  { id: "qualified", label: "Qualified" },
  { id: "proposed", label: "Proposed" },
  { id: "closed", label: "Closed" },
];

/* Two opportunities, because the interesting difference is the card WITHOUT a
   next step — that is the state the "+ Add" affordance was carrying. */
const WITH_STEP = {
  account: "Ministry of Environment, Water and Agriculture MEWA",
  kind: "Develop",
  amount: "$117K",
  name: "Expand to 3,000 users across the Ministry",
  step: "Chase the cybersecurity sign-off with procurement",
  more: 1,
  owner: "AA",
  attention: "Due 20 Aug",
  tone: "text-fg-muted",
  confidence: "High",
};

const WITHOUT_STEP = {
  account: "Arla Foods",
  kind: "Use case",
  amount: "—",
  name: "POKA integration",
  step: null as string | null,
  more: 0,
  owner: null as string | null,
  attention: "No next step",
  tone: "text-warning-fg font-medium",
  confidence: "Low",
};

type Card = typeof WITH_STEP;

/* ── Shared card chrome, so the three variants differ only where they differ ── */

function Shell({ o, warn, children }: { o: Card; warn?: boolean; children: React.ReactNode }) {
  return (
    <article className={cn(
      "w-[268px] rounded-lg border bg-surface px-3 py-2.5",
      warn ? "border-warning/40" : "border-border",
    )}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
          {o.account}<span className="text-fg-subtle/75"> · {o.kind}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums text-fg">{o.amount}</span>
      </div>
      <h3 className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-fg">{o.name}</h3>
      {children}
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        {o.owner
          ? <span className="grid size-4 shrink-0 place-items-center rounded-full bg-bg-muted text-[8px] font-semibold text-fg-muted">{o.owner}</span>
          : <span className="grid size-4 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-[8px] text-fg-subtle">?</span>}
        <span className={cn("min-w-0 truncate", o.tone)}>{o.attention}</span>
        <span className="ml-auto shrink-0 text-fg-subtle">{o.confidence}</span>
      </div>
    </article>
  );
}

/** TODAY — the next step is a control: click to edit, "+" to add another. */
function CardNow({ o }: { o: Card }) {
  return (
    <Shell o={o} warn={!o.step}>
      {o.step ? (
        <div className="mt-1.5 flex items-start gap-1">
          <p className="line-clamp-2 min-w-0 flex-1 cursor-text rounded text-[12.5px] leading-snug text-fg-muted hover:bg-bg-subtle">
            {o.step}
          </p>
          {o.more > 0 && (
            <span className="mt-0.5 shrink-0 rounded bg-bg-muted px-1 text-[10px] tabular-nums text-fg-muted">+{o.more}</span>
          )}
          <button className="mt-0.5 shrink-0 rounded px-1 text-[13px] leading-none text-fg-subtle hover:bg-bg-subtle hover:text-fg">+</button>
        </div>
      ) : (
        <p className="mt-1.5 cursor-text rounded text-[12.5px] leading-snug text-warning-fg hover:bg-bg-subtle">
          + Add a next step
        </p>
      )}
    </Shell>
  );
}

/** A — read-only. With no step, the line says so, and the footer says it too. */
function CardA({ o }: { o: Card }) {
  return (
    <Shell o={o} warn={!o.step}>
      {o.step ? (
        <div className="mt-1.5 flex items-start gap-1">
          <p title={o.step} className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug text-fg-muted">{o.step}</p>
          {o.more > 0 && (
            <span className="mt-0.5 shrink-0 rounded bg-bg-muted px-1 text-[10px] tabular-nums text-fg-muted">+{o.more}</span>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug text-warning-fg">No next step</p>
      )}
    </Shell>
  );
}

/** B — read-only, and the empty line stays empty. The footer already carries
 *  "No next step", so B says it once instead of twice. Same height either way. */
function CardB({ o }: { o: Card }) {
  return (
    <Shell o={o} warn={!o.step}>
      {o.step ? (
        <div className="mt-1.5 flex items-start gap-1">
          <p title={o.step} className="line-clamp-2 min-w-0 flex-1 text-[12.5px] leading-snug text-fg-muted">{o.step}</p>
          {o.more > 0 && (
            <span className="mt-0.5 shrink-0 rounded bg-bg-muted px-1 text-[10px] tabular-nums text-fg-muted">+{o.more}</span>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-[12.5px] leading-snug text-fg-subtle/60">—</p>
      )}
    </Shell>
  );
}

/* ── The stage control inside the record ──────────────────────────────────── */

/** TODAY — four progress segments, click one to move. */
function RailNow({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const current = STAGES.findIndex((s) => s.id === stage);
  return (
    <div>
      <div className="flex gap-1">
        {STAGES.map((s, i) => {
          const done = i < current, active = i === current;
          const tone = active && s.id === "closed" ? "bg-fg-muted" : active || done ? "bg-accent" : "bg-bg-muted";
          return (
            <button key={s.id} onClick={() => !active && set(s.id)} disabled={active}
              className="group min-w-0 flex-1 text-left">
              <span className={cn("block h-1 rounded-full transition", tone, !active && "group-hover:bg-accent/60")} />
              <span className={cn("mt-1.5 block truncate text-[11px] transition",
                active ? "font-semibold text-fg" : "text-fg-subtle group-hover:text-fg-muted")}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10.5px] text-fg-subtle">Click a stage to move this opportunity</p>
    </div>
  );
}

/** PROPOSED — a dropdown. One control, one line, no rail.
 *  Closed is in the list but routes to the close dialog, because closing still
 *  has to ask which outcome. */
function StageDropdown({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const [open, setOpen] = useState(false);
  const label = STAGES.find((s) => s.id === stage)?.label ?? "";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Stage</span>
      <div className="relative">
        <button onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px] font-medium text-fg transition hover:border-border-strong hover:bg-bg-subtle">
          {label}
          <span className="text-[9px] text-fg-subtle">▼</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg">
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => { set(s.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                  <span className="flex-1">{s.label}</span>
                  {s.id === stage && <span className="text-accent">✓</span>}
                  {s.id === "closed" && s.id !== stage && <span className="text-[10px] text-fg-subtle">asks</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

function Panel({ title, note, children, recommended }: {
  title: string; note: string; children: React.ReactNode; recommended?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border bg-surface p-4", recommended ? "border-accent/50" : "border-border")}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {recommended && (
          <span className="rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">
            suggested
          </span>
        )}
      </div>
      <p className="mt-1 max-w-[42ch] text-[11.5px] leading-relaxed text-fg-subtle">{note}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function Revised() {
  const [a, setA] = useState<Stage>("proposed");
  const [b, setB] = useState<Stage>("proposed");

  return (
    <div className="min-h-full bg-canvas">
      <p className="border-b border-border bg-bg-subtle px-4 py-1 text-[11px] text-fg-subtle">
        Sample — not wired to the real page. Nothing here saves.
      </p>

      <div className="mx-auto max-w-[1120px] px-6 py-6">
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-fg">Two changes, for a decision</h1>
        <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">
          The card stops being editable, and the stage rail in the record becomes a dropdown.
          Both are shown beside what is live today.
        </p>

        {/* 1 — the card */}
        <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">1 · The board card</h2>
        <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed text-fg-muted">
          Each pair shows an opportunity that has a next step, and one that does not — the empty
          state is where the difference actually bites, because that is the state the
          <span className="text-fg"> + Add a next step</span> affordance was carrying.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Panel title="Today" note="The next step is a control. Click the text to edit it, + to add another, and an opportunity with none invites you to write one.">
            <div className="space-y-2">
              <CardNow o={WITH_STEP} />
              <CardNow o={WITHOUT_STEP as Card} />
            </div>
          </Panel>

          <Panel title="A · says it twice" note="Read-only. With no step the line reads “No next step” — and so does the footer, so the card carries the same sentence in two places.">
            <div className="space-y-2">
              <CardA o={WITH_STEP} />
              <CardA o={WITHOUT_STEP as Card} />
            </div>
          </Panel>

          <Panel recommended title="B · says it once" note="Read-only, and the empty line stays a quiet dash. The footer already carries “No next step” in amber, which is the warning. Same height in every state.">
            <div className="space-y-2">
              <CardB o={WITH_STEP} />
              <CardB o={WITHOUT_STEP as Card} />
            </div>
          </Panel>
        </div>

        {/* 2 — the stage control */}
        <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">2 · The stage control, inside the record</h2>
        <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed text-fg-muted">
          Both are live — click them. Dragging on the board still works either way; this is only
          about what the opened record shows.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Panel title="Today · progress segments" note="Four segments and four labels. Shows how far along the opportunity is, and costs two lines of the record header.">
            <div className="rounded-lg border border-border-subtle bg-bg-subtle/40 p-4">
              <RailNow stage={a} set={setA} />
            </div>
          </Panel>

          <Panel recommended title="Proposed · dropdown" note="One control, one line. Loses the sense of progression, gains the header space back — and Closed still opens the outcome dialog rather than moving silently.">
            <div className="rounded-lg border border-border-subtle bg-bg-subtle/40 p-4">
              <StageDropdown stage={b} set={setB} />
              <p className="mt-3 text-[10.5px] text-fg-subtle">Currently {STAGES.find((s) => s.id === b)?.label}</p>
            </div>
          </Panel>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-[13px] font-semibold text-fg">What each change costs</h3>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-fg-muted">
            <li>
              <span className="text-fg">Read-only card.</span> Setting a next step becomes: open the
              record, type, save. Seven of seven imported opportunities currently have no next step,
              so that is the path everyone takes on day one.
            </li>
            <li>
              <span className="text-fg">Dropdown.</span> A board already shows the stage — it is the
              column. So the rail inside the record was saying something the reader could already see,
              and the dropdown gives the header back two lines.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
