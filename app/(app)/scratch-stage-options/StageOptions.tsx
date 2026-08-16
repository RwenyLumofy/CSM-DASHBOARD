"use client";

/* =========================================================================
   Prototype — six ways of showing and changing stage inside a record.

   All six are live. Click them. Each sits at the real width it would occupy
   in the record (the left column is ~600px), under a stand-in title, so the
   comparison is honest.
   ========================================================================= */

import { useState } from "react";
import { cn } from "@/lib/cn";
import { STAGES, STAGE_LABEL, type Stage } from "../scratch-expansion/data";

/** When each stage was entered, for the samples that show dates. */
const ENTERED: Partial<Record<Stage, string>> = {
  identified: "21 Jul",
  qualified: "24 Jul",
  proposed: "29 Jul",
};

const idx = (s: Stage) => STAGES.findIndex((x) => x.id === s);

/* ── 1 · Progress segments (what is built) ────────────────────────────────── */

function Segments({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const cur = idx(stage);
  return (
    <div>
      <div className="flex gap-1">
        {STAGES.map((s, i) => (
          <button key={s.id} onClick={() => set(s.id)} disabled={i === cur} className="group min-w-0 flex-1 text-left">
            <span className={cn("block h-1 rounded-full transition",
              i <= cur ? "bg-accent" : "bg-bg-muted", i !== cur && "group-hover:bg-accent/60")} />
            <span className={cn("mt-1.5 block truncate text-[11px]",
              i === cur ? "font-semibold text-fg" : "text-fg-subtle group-hover:text-fg-muted")}>{s.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10.5px] text-fg-subtle">Click a stage to move this opportunity</p>
    </div>
  );
}

/* ── 2 · Nodes and connectors, with dates ─────────────────────────────────── */

function Nodes({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const cur = idx(stage);
  return (
    <div className="flex items-start">
      {STAGES.map((s, i) => {
        const done = i < cur, active = i === cur;
        return (
          <div key={s.id} className={cn("min-w-0", i === STAGES.length - 1 ? "shrink-0" : "flex-1")}>
            <div className="flex items-center">
              <button onClick={() => set(s.id)} disabled={active}
                className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition",
                  active ? "border-accent bg-accent text-fg-on-accent ring-4 ring-accent/15"
                    : done ? "border-accent bg-accent/15 text-accent hover:bg-accent/25"
                      : "border-border-strong bg-surface text-fg-subtle hover:border-accent hover:text-accent")}>
                {done ? "✓" : i + 1}
              </button>
              {i < STAGES.length - 1 && (
                <span className={cn("h-px flex-1", i < cur ? "bg-accent" : "bg-border")} />
              )}
            </div>
            <div className={cn("mt-1.5 truncate text-[11px]", active ? "font-semibold text-fg" : done ? "text-fg-muted" : "text-fg-subtle")}>
              {s.label}
            </div>
            <div className="text-[10px] tabular-nums text-fg-subtle">{ENTERED[s.id] ?? "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── 3 · Chevron pipeline ─────────────────────────────────────────────────── */

function Chevrons({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const cur = idx(stage);
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {STAGES.map((s, i) => {
        const done = i < cur, active = i === cur;
        return (
          <button key={s.id} onClick={() => set(s.id)} disabled={active}
            className={cn("relative min-w-0 flex-1 px-3 py-2 text-left text-[12px] transition",
              active ? "bg-accent font-semibold text-fg-on-accent"
                : done ? "bg-accent-soft text-accent hover:bg-accent/15"
                  : "bg-surface text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted",
              i > 0 && "border-l border-border")}>
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── 4 · Advance button, the common case first ────────────────────────────── */

function Advance({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const cur = idx(stage);
  const next = STAGES[cur + 1];
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-fg-subtle">Stage</span>
      <span className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-[12px] font-semibold text-fg">
        {STAGE_LABEL[stage]}
      </span>
      {next ? (
        <button onClick={() => set(next.id)}
          className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-fg-on-accent hover:bg-accent-hover">
          Advance to {next.label} →
        </button>
      ) : (
        <span className="text-[12px] text-fg-subtle">Closed</span>
      )}
      <div className="relative">
        <button onClick={() => setOpen((v) => !v)} className="rounded-md px-2 py-1 text-[12px] text-fg-muted hover:bg-bg-subtle hover:text-fg">
          Change
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg">
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => { set(s.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-fg-muted hover:bg-bg-subtle">
                  <span className="flex-1">{s.label}</span>
                  {stage === s.id && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 5 · Pill group ───────────────────────────────────────────────────────── */

function Pills({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-bg-subtle p-0.5">
      {STAGES.map((s) => (
        <button key={s.id} onClick={() => set(s.id)}
          className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium transition",
            stage === s.id ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:text-fg")}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ── 6 · Path with days in stage ──────────────────────────────────────────── */

const LEG: Record<string, string> = { identified: "3d", qualified: "5d", proposed: "13d" };

function Path({ stage, set }: { stage: Stage; set: (s: Stage) => void }) {
  const cur = idx(stage);
  return (
    <div>
      <div className="flex items-center">
        {STAGES.map((s, i) => {
          const done = i < cur, active = i === cur;
          return (
            <div key={s.id} className={cn("flex items-center", i === STAGES.length - 1 ? "shrink-0" : "min-w-0 flex-1")}>
              <button onClick={() => set(s.id)} disabled={active}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] transition",
                  active ? "bg-accent font-semibold text-fg-on-accent"
                    : done ? "bg-accent-soft text-accent hover:bg-accent/15"
                      : "text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted")}>
                {s.label}
              </button>
              {i < STAGES.length - 1 && (
                <span className="flex min-w-0 flex-1 items-center gap-1 px-1">
                  <span className={cn("h-px flex-1", i < cur ? "bg-accent" : "bg-border")} />
                  {i < cur && <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">{LEG[s.id]}</span>}
                  <span className={cn("h-px flex-1", i < cur ? "bg-accent" : "bg-border")} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10.5px] text-fg-subtle">Time between stages shown on the connector</p>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

const SAMPLES: { n: string; title: string; note: string; C: (p: { stage: Stage; set: (s: Stage) => void }) => React.ReactElement }[] = [
  { n: "1", title: "Progress segments", C: Segments,
    note: "What is built. Reads as progress. The labels are small and the click target is the whole segment." },
  { n: "2", title: "Nodes and dates", C: Nodes,
    note: "Ticks for what is done, a ring on the current one, and the date each stage was entered. The most informative — and the tallest." },
  { n: "3", title: "Chevron pipeline", C: Chevrons,
    note: "Reads as a pipeline immediately, and every stage is an obvious button. Heavier — a filled bar across the record." },
  { n: "4", title: "Advance button", C: Advance,
    note: "Optimises for the common case: moving one stage forward. Everything else is behind Change. Shows no history." },
  { n: "5", title: "Pill group", C: Pills,
    note: "Familiar, compact, unambiguous. Reads as a filter or a tab set, not as progress — order carries no meaning." },
  { n: "6", title: "Path with time in stage", C: Path,
    note: "Same as 2 but the connector carries how long each leg took, which is where deals stall." },
];

export function StageOptions() {
  const [stages, setStages] = useState<Stage[]>(() => SAMPLES.map(() => "proposed"));

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <p className="border-b border-border bg-bg-subtle px-4 py-1 text-[11px] text-fg-subtle">
        Prototype — all six are live. Click them.
      </p>

      <div className="px-6 py-5">
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-fg">Stage movement</h1>
        <p className="mt-1 max-w-[80ch] text-[13px] text-fg-muted">
          Each shown at the width it occupies in the record, under a stand-in title. Currently all set to{" "}
          <strong className="text-fg">Proposed</strong>.
        </p>

        <div className="mt-6 grid gap-x-8 gap-y-7 xl:grid-cols-2">
          {SAMPLES.map(({ n, title, note, C }, i) => (
            <section key={n} className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded bg-cosmos text-[11px] font-semibold text-white">{n}</span>
                <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
                <span className="ml-auto text-[11px] tabular-nums text-fg-subtle">{STAGE_LABEL[stages[i]]}</span>
              </div>
              <p className="mt-1 min-h-[32px] text-[12px] leading-snug text-fg-subtle">{note}</p>

              <div className="mt-2 rounded-xl border border-border bg-surface px-5 py-4">
                <div className="text-[11px] text-fg-subtle">MEWA</div>
                <h3 className="mt-0.5 font-display text-[18px] font-semibold leading-tight tracking-tight text-fg">
                  Expand to 3,000 users across the Ministry
                </h3>
                <p className="mt-1 text-[12.5px] text-fg-muted">
                  Proposal sent; cybersecurity requirements under discussion.
                </p>
                <div className="mt-3.5">
                  <C stage={stages[i]} set={(s) => setStages((prev) => prev.map((p, j) => (j === i ? s : p)))} />
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 max-w-[80ch] rounded-lg border border-border bg-bg-subtle px-4 py-3.5">
          <h2 className="text-[13px] font-semibold text-fg">Read</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            <strong className="text-fg">6 is the one I would take.</strong> It shows where the opportunity is, what is
            already done, and <em>how long each leg took</em> — which is the only thing on this control that tells you
            something you did not already know. Thirteen days in Proposed is the reason to chase.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            <strong className="text-fg">4 is the pragmatic runner-up.</strong> Advancing one stage is by far the most
            common action, and it is the only sample that makes it a single obvious click. But it shows no history at
            all, so the record loses the journey.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            <strong className="text-fg">Avoid 5.</strong> A pill group reads as tabs — a set of equal choices you switch
            between. Stages are ordered and moving between them is a commitment, and pills say neither.
          </p>
        </div>
      </div>
    </div>
  );
}
