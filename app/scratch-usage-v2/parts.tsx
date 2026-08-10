"use client";

/* =========================================================================
   Shared presentation pieces for both Usage-tab v2 prototypes.

   Prototype-only. Extracted here so A and B differ in HIERARCHY and DENSITY
   rather than in visual language — a fair comparison needs the same atoms.
   ========================================================================= */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, CircleAlert, Info, Minus, Plug, RefreshCw, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CHART_COMMENTARY, EVIDENCE_STATE, FRESHNESS_COPY, LICENCES, MONTHS,
  type EvidenceState, type Freshness, type MetricFact, type MonthPoint,
  type Observation, type ScenarioState, type UseCaseRow,
  PARENT_LABEL, parentState, parentReading, type ParentState,
} from "./fixtures";

/* ------------------------------------------------------------ primitives */

export const Section = ({ title, aside, children, dense }: {
  title: string; aside?: React.ReactNode; children: React.ReactNode; dense?: boolean;
}) => (
  <section className={cn("border-t border-border pt-3", dense ? "mt-3" : "mt-4")}>
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

export function Disclosure({ label, count, children, dense }: {
  label: string; count?: string; children: React.ReactNode; dense?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-lg border border-border-subtle", open && "bg-bg-muted/25")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={cn("flex w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-bg-muted", dense ? "px-2.5 py-1.5" : "px-3 py-2")}>
        <span className="font-body text-[12px] font-semibold text-fg">{label}</span>
        {count && <span className="font-body text-[11px] text-fg-subtle">{count}</span>}
        <ChevronRight size={12} className={cn("ml-auto text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open && <div className={cn("border-t border-border-subtle", dense ? "px-2.5 py-2" : "px-3 py-2.5")}>{children}</div>}
    </div>
  );
}

/** Definition popover. Opens on click AND keyboard — the brief requires a
 *  tooltip alternative, so this is a button with a real focusable panel, not a
 *  hover-only title attribute. */
export function DefinitionButton({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span className="relative inline-flex" ref={ref as never}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={`How ${name} is defined`}
        className="rounded text-fg-subtle transition-colors hover:text-sirius focus-visible:outline focus-visible:outline-2 focus-visible:outline-sirius">
        <Info size={12} aria-hidden />
      </button>
      {open && (
        <span role="dialog" aria-label={`${name} definition`}
          className="absolute left-0 top-5 z-30 w-[19rem] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block font-body text-[12px] font-bold text-fg">{name}</span>
              <span className="mt-1 block font-body text-[12px] leading-relaxed text-fg-muted">{text}</span>
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close definition" className="shrink-0 text-fg-subtle hover:text-fg">
              <X size={12} aria-hidden />
            </button>
          </span>
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------- trust and period bar */

const FRESH_STYLE: Record<Freshness, string> = {
  current: "bg-[#1F9D63]/12 text-[#1F9D63]",
  delayed: "bg-[#C99A14]/15 text-[#8A6D12]",
  stale: "bg-[#C2610E]/12 text-[#C2610E]",
  unavailable: "bg-bg-muted text-fg-muted",
};

export function TrustBar({ s, freshness, onPeriod, dense, compareBasis }: {
  s: ScenarioState; freshness: Freshness; onPeriod: (k: string) => void; dense?: boolean;
  /** Kept in the signature: the basis is still a fact the tab must state — it
   *  is just stated by the metric cells ("−16 vs Jun"), not repeated here. */
  compareBasis?: string | null;
}) {
  /* This bar had ten elements: six month chips, two labelled pills, a sync
     line, a comparison line and a button. Three cuts:

       · six chips became one select — period changes rarely and does not earn
         six permanent controls
       · "Compared with Jun 2026" is gone; every cell in the summary strip
         already reads "vs Jun", so the bar was repeating it
       · "Data Current" and "Last sync 6h ago" were one fact stated twice.
         Current MEANS synced within 24h, so they are now one unit

     What survives is what a CSM needs before trusting a number: which period,
     whether it has finished, and how old the data is. */
  const current = MONTHS.find((m) => m.key === s.selectedPeriod);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", dense ? "pb-2" : "pb-3")}>
      <label className="flex items-center gap-1.5">
        <span className="font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Period</span>
        <span className="relative inline-flex">
          <select value={s.selectedPeriod} onChange={(e) => onPeriod(e.target.value)}
            className="appearance-none rounded-lg border border-border bg-surface py-1 pl-2.5 pr-7 font-body text-[12.5px] font-semibold text-fg">
            {MONTHS.slice(-6).map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} 20{m.year}{m.status === "in_progress" ? " · month to date" : ""}
              </option>
            ))}
          </select>
          <ChevronRight size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-fg-subtle" aria-hidden />
        </span>
        <span className={cn("rounded-pill px-2 py-0.5 font-body text-[11px] font-medium",
          s.periodStatus === "complete" ? "bg-bg-muted text-fg-muted" : "bg-[#C99A14]/15 text-[#8A6D12]")}>
          {s.periodStatus === "complete" ? "Complete" : "In progress"}
        </span>
      </label>

      <span className="flex items-center gap-1.5">
        <span className="font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Data</span>
        <span className={cn("rounded-pill px-2 py-0.5 font-body text-[11px] font-semibold", FRESH_STYLE[freshness])}>
          {FRESHNESS_COPY[freshness].label}
          {s.syncHoursAgo != null && <span className="font-normal"> · synced {s.syncHoursAgo}h ago</span>}
        </span>
      </span>

      <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
        <RefreshCw size={11} aria-hidden /> Refresh
      </button>
    </div>
  );
}

export const Notice = ({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) => (
  <p className={cn("flex items-start gap-2 rounded-lg px-3 py-2 font-body text-[12px] leading-relaxed",
    tone === "warn" ? "bg-[#C2610E]/[0.07] text-fg" : "bg-bg-muted/60 text-fg-muted")}>
    {tone === "warn" ? <TriangleAlert size={13} className="mt-0.5 shrink-0 text-[#C2610E]" aria-hidden />
      : <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />}
    <span>{children}</span>
  </p>
);

/* ------------------------------------------------------------- metrics */

function Movement({ from, to, label }: { from: number; to: number; label: string }) {
  const d = to - from;
  const Icon = d === 0 ? Minus : d > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 font-body text-[11.5px] font-semibold tabular",
      d === 0 ? "text-fg-subtle" : d > 0 ? "text-[#1F9D63]" : "text-[#C2610E]")}>
      <Icon size={11} aria-hidden />{d > 0 ? "+" : ""}{d}
      <span className="font-normal text-fg-subtle">vs {label}</span>
    </span>
  );
}

/** Adaptive: two metrics fill the row now, four fit later. No placeholders
 *  (decision 7). */
export function MetricRow({ metrics, blocked, dense }: {
  metrics: MetricFact[]; blocked: string | null; dense?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", metrics.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {metrics.map((m) => (
        <div key={m.id} className={cn("rounded-lg bg-bg-muted/45", dense ? "px-3 py-2" : "px-3.5 py-3")}>
          <span className="flex items-center gap-1.5">
            <span className="font-body text-[11.5px] text-fg-muted">{m.name}</span>
            <DefinitionButton name={m.name} text={m.definition} />
          </span>
          <span className="mt-0.5 flex items-baseline gap-1.5">
            <span className={cn("tabular font-display font-bold text-fg", dense ? "text-[21px]" : "text-[25px]")}>{m.value}</span>
            {m.unit && <span className="font-body text-[11.5px] text-fg-subtle">{m.unit}</span>}
          </span>
          <span className="mt-0.5 block">
            {blocked ? <span className="font-body text-[11px] text-fg-subtle">Comparison unavailable</span>
              : m.change ? <Movement from={m.change.from} to={m.change.to} label={m.change.periodLabel} />
              : null}
          </span>
        </div>
      ))}
      {/* Licences sit beside the metrics as separate facts, never as a
          denominator for them (decision 1 and 7). */}
      <div className={cn("rounded-lg border border-border-subtle", dense ? "px-3 py-2" : "px-3.5 py-3",
        metrics.length <= 2 && "sm:col-span-2")}>
        <span className="font-body text-[11.5px] text-fg-muted">Licences, as of {LICENCES.asOf}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-4">
          <span className="flex items-baseline gap-1.5">
            <span className="tabular font-display text-[17px] font-bold text-fg">{LICENCES.used}</span>
            <span className="font-body text-[11.5px] text-fg-subtle">used</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="tabular font-display text-[17px] font-bold text-fg">{LICENCES.available}</span>
            <span className="font-body text-[11.5px] text-fg-subtle">available</span>
          </span>
        </span>
        <span className="mt-1 block max-w-[52ch] font-body text-[10.5px] leading-relaxed text-fg-subtle">{LICENCES.note}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- chart */

export function ActivityChart({ highlight, blocked, height = 150 }: {
  highlight: string[]; blocked: string | null; height?: number;
}) {
  const set = new Set(highlight);
  const pts = MONTHS.filter((m) => m.activeUsers != null);
  const max = Math.max(...pts.map((m) => m.activeUsers!)) * 1.12;
  const w = 100;
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {pts.map((m) => {
          const h = ((m.activeUsers! / max) * 100).toFixed(1);
          const hot = set.has(m.key);
          const mtd = m.status === "in_progress";
          return (
            <div key={m.key} className="flex min-w-0 flex-1 flex-col justify-end" style={{ height: "100%" }}>
              <span className={cn("tabular mb-1 block text-center font-body text-[10px]", hot ? "font-bold text-sirius" : "text-fg-subtle")}>
                {m.activeUsers}
              </span>
              <span
                className={cn("block w-full rounded-t-sm transition-colors",
                  mtd ? "bg-sirius/25" : hot ? "bg-sirius" : "bg-sirius/55")}
                style={{ height: `${h}%` }}
                aria-label={`${m.label} ${m.year}: ${m.activeUsers} active users${mtd ? ", month to date" : ""}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {pts.map((m) => (
          <span key={m.key} className={cn("min-w-0 flex-1 text-center font-body text-[10px]",
            set.has(m.key) ? "font-bold text-sirius" : "text-fg-subtle")}>
            {m.label}
          </span>
        ))}
      </div>
      <p className="mt-2 max-w-[86ch] font-body text-[11.5px] leading-relaxed text-fg-subtle">
        Active users per month, absolute counts. {CHART_COMMENTARY}
      </p>
      {blocked && <div className="mt-2"><Notice tone="info">{blocked}</Notice></div>}
    </div>
  );
}

/* -------------------------------------------------------- observations */

export function Observations({ items, focused, onFocus, onTask, dense }: {
  items: Observation[]; focused: string | null;
  onFocus: (o: Observation) => void; onTask: (title: string) => void; dense?: boolean;
}) {
  if (!items.length) {
    return <p className="font-body text-[12px] text-fg-subtle">Nothing in this period meets an observation rule.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((o) => (
        <li key={o.id}
          className={cn("rounded-lg border transition-colors",
            focused === o.id ? "border-sirius/50 bg-accent-soft/40" : "border-border-subtle hover:bg-bg-muted/40",
            dense ? "px-2.5 py-2" : "px-3 py-2.5")}>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <button onClick={() => onFocus(o)} className="min-w-0 flex-1 text-left">
              <span className="block font-body text-[13px] font-semibold leading-snug text-fg">{o.headline}</span>
              <span className="mt-0.5 block max-w-[88ch] font-body text-[12px] leading-relaxed text-fg-muted">{o.evidence}</span>
            </button>
            {o.action && (
              <button onClick={() => onTask(o.headline)}
                className="shrink-0 rounded-lg border border-border px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                {o.action.label}
              </button>
            )}
          </div>
          <p className="mt-1 font-body text-[10.5px] text-fg-subtle">
            {focused === o.id ? "Highlighted in the chart above" : `Click to highlight ${o.periods.length} month${o.periods.length === 1 ? "" : "s"} in the chart`}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------- use-case evidence */

const TONE: Record<string, string> = {
  ok: "bg-[#1F9D63]/12 text-[#1F9D63]",
  warn: "bg-[#C2610E]/12 text-[#C2610E]",
  blocked: "bg-bg-muted text-fg-muted",
  unknown: "bg-[#C99A14]/15 text-[#8A6D12]",
};

export const StatePill = ({ s }: { s: EvidenceState }) => (
  <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]", TONE[EVIDENCE_STATE[s].tone])}>
    {EVIDENCE_STATE[s].label}
  </span>
);

export function StateAction({ s, onTask }: { s: EvidenceState; onTask: (t: string) => void }) {
  const a = EVIDENCE_STATE[s].action;
  if (!a) return <span className="font-body text-[11px] text-fg-subtle">No action needed</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button onClick={() => onTask(a.label)}
        className="rounded-lg border border-border px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
        {a.label}
      </button>
      {!a.implemented && (
        <span className="rounded bg-[#C99A14]/15 px-1 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.04em] text-[#8A6D12]"
          title="No destination exists yet — requires implementation">
          needs build
        </span>
      )}
    </span>
  );
}

/** NESTED presentation — one row per use case, products beneath. */
export function UseCasesNested({ rows, onTask, dense }: {
  rows: UseCaseRow[]; onTask: (t: string) => void; dense?: boolean;
}) {
  const [open, setOpen] = useState<string[]>(["uc2"]);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {rows.map((r) => {
        const multi = r.products.length > 1;
        const isOpen = open.includes(r.id) || !multi;
        return (
          <li key={r.id} className={dense ? "py-1.5" : "py-2"}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {multi ? (
                <button onClick={() => toggle(r.id)} aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <ChevronRight size={12} className={cn("shrink-0 text-fg-subtle transition-transform", isOpen && "rotate-90")} aria-hidden />
                  <span className="min-w-0 font-body text-[13px] leading-snug text-fg">{r.name}</span>
                  <span className="shrink-0 font-body text-[10.5px] text-fg-subtle">{r.products.length} products</span>
                </button>
              ) : (
                /* No truncation: a use-case name a CSM cannot read defeats the
                   section. It wraps, and in a narrow column the reading drops
                   to its own line rather than squeezing the name. */
                <span className="min-w-[10rem] flex-1 pl-[18px] font-body text-[13px] leading-snug text-fg">{r.name}</span>
              )}
              {!multi && <StatePill s={r.products[0].state} />}
              {!multi && <span className="order-last w-full font-body text-[11.5px] text-fg-muted pl-[18px] xl:order-none xl:w-[17rem] xl:pl-0">{r.products[0].reading}</span>}
              {!multi && <span className="shrink-0"><StateAction s={r.products[0].state} onTask={onTask} /></span>}
            </div>
            {multi && isOpen && (
              <ul className="mt-1 flex flex-col gap-1 pl-[26px]">
                {r.products.map((p) => (
                  <li key={p.product} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="w-[4.5rem] shrink-0 font-body text-[11.5px] font-semibold text-fg-muted">{p.product}</span>
                    <StatePill s={p.state} />
                    <span className="min-w-0 flex-1 font-body text-[11.5px] text-fg-muted">{p.reading}</span>
                    <StateAction s={p.state} onTask={onTask} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** FLAT presentation — one row per product, the use case repeated. Built only
 *  so the two can be compared honestly; see the recommendation. */
export function UseCasesFlat({ rows, onTask }: { rows: UseCaseRow[]; onTask: (t: string) => void }) {
  const flat = rows.flatMap((r) => r.products.map((p) => ({ ...p, useCase: r.name, dup: r.products.length > 1 })));
  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {flat.map((p, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5">
          <span className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg">
            {p.useCase}
            {p.dup && <span className="ml-1.5 rounded bg-bg-muted px-1 py-0.5 font-body text-[9px] font-bold uppercase text-fg-subtle">repeated</span>}
          </span>
          <span className="w-[4.5rem] shrink-0 font-body text-[11.5px] text-fg-subtle">{p.product}</span>
          <StatePill s={p.state} />
          <span className="w-full font-body text-[11.5px] text-fg-muted sm:w-[17rem]">{p.reading}</span>
          <StateAction s={p.state} onTask={onTask} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------ task draft */

export function TaskDraft({ open, title, evidence, onClose }: {
  open: boolean; title: string; evidence: string[]; onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 p-6 pt-[12vh]">
      <div role="dialog" aria-label="Task draft" className="w-full max-w-lg rounded-xl border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-start gap-2">
          <h4 className="min-w-0 flex-1 font-display text-[15px] font-semibold text-fg">New task</h4>
          <button onClick={onClose} aria-label="Close" className="text-fg-subtle hover:text-fg"><X size={14} aria-hidden /></button>
        </div>
        <label className="mt-3 block">
          <span className="block font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Title — editable</span>
          <input value={value} onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body text-[13px] text-fg" />
        </label>
        <div className="mt-3 rounded-lg bg-bg-muted/50 px-3 py-2.5">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Evidence carried with the task</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {evidence.map((e) => <li key={e} className="font-body text-[12px] text-fg-muted">· {e}</li>)}
          </ul>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white">Create task</button>
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted">Cancel</button>
          <span className="ml-auto rounded bg-[#C99A14]/15 px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.04em] text-[#8A6D12]">
            fixture — not persisted
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- non-happy full states */

export function NoEnvironment() {
  return (
    <div className="flex gap-3 rounded-lg border border-border-subtle bg-bg-muted/40 px-4 py-3.5">
      <Plug size={16} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
      <div>
        <p className="font-body text-[13px] font-semibold text-fg">No Lumofy environment is linked to this account</p>
        <p className="mt-1 max-w-[68ch] font-body text-[12px] leading-relaxed text-fg-muted">
          Usage is read from the product database by environment. Nothing is broken and no activity is
          missing &mdash; there is simply nothing to read. Health treats this as absent rather than zero,
          so the account is not penalised for it.
        </p>
        <button className="mt-2.5 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
          Link environment
        </button>
      </div>
    </div>
  );
}

export const InsufficientHistory = () => (
  <Notice tone="info">
    <span className="font-semibold text-fg">Insufficient history.</span> Two complete months on record.
    No-activity observations need three, so none are raised &mdash; an absence over two months is not yet
    evidence of anything.
  </Notice>
);

export const SmallPopulation = () => (
  <Notice tone="info">
    <span className="font-semibold text-fg">Fewer than 20 monthly active users.</span> Ratios are
    suppressed at this population &mdash; one person joining or leaving moves the figure by more than five
    points. Absolute counts are still shown. This does not make the page Partial.
  </Notice>
);

export const TrendFallback = () => (
  <Notice tone="warn">
    <span className="font-semibold text-fg">Daily and weekly resolution unavailable.</span> The live trend
    query did not return. The chart is the durable monthly series, which is complete. Nothing shown is
    estimated.
  </Notice>
);

export const StaleBanner = ({ note }: { note: string }) => (
  <Notice tone="warn">
    <span className="font-semibold text-fg">Last successful sync was over 48 hours ago.</span> {note}{" "}
    Comparisons are disabled while stale.
  </Notice>
);

export const KnownLimitation = () => (
  <p className="flex items-start gap-1.5 font-body text-[10.5px] leading-relaxed text-fg-subtle">
    <CircleAlert size={11} className="mt-0.5 shrink-0" aria-hidden />
    <span>
      Known limitation: the health score divides active users by the CURRENT licence count and falls back
      to used licences when available licences are absent. This tab deliberately does not, so the two can
      differ for the same account. Health is unchanged and outside this release.
    </span>
  </p>
);

/* ==================================================== hybrid additions */

/** Compact summary strip — four facts on one line, ~62px tall. Replaces the
 *  oversized metric cards. Licences are PEERS of the metrics here, not a
 *  footnote beneath them, because they are facts of the same standing; they are
 *  simply as-of-today rather than for the period. */
export function SummaryStrip({ blocked }: { blocked: string | null }) {
  const cells = [
    { k: "Active users", v: "317", u: "people", d: blocked ? null : { txt: "↘ −16 vs Jun", tone: "dn" }, def: METRIC_DEFS.m1 },
    { k: "Weekly-to-monthly ratio", v: "35", u: "%", d: blocked ? null : { txt: "— no change vs Jun", tone: "fl" }, def: METRIC_DEFS.m2 },
    { k: "Used licences", v: String(LICENCES.used), u: null, d: { txt: `as of ${LICENCES.asOf}`, tone: "n" }, def: LICENCES.note },
    { k: "Available licences", v: String(LICENCES.available), u: null, d: { txt: `as of ${LICENCES.asOf}`, tone: "n" }, def: LICENCES.note },
  ];
  return (
    <div>
      <div className="mt-3 flex flex-wrap overflow-hidden rounded-lg border border-border-subtle">
        {cells.map((c, i) => (
          <div key={c.k} className={cn("min-w-[10rem] flex-1 px-3.5 py-2", i > 0 && "border-l border-border-subtle")}>
            <span className="flex items-center gap-1.5 font-body text-[11px] text-fg-muted">
              {c.k}<DefinitionButton name={c.k} text={c.def} />
            </span>
            <span className="mt-0.5 flex items-baseline gap-1">
              <span className="tabular font-display text-[20px] font-bold leading-tight text-fg">{c.v}</span>
              {c.u && <span className="font-body text-[11px] text-fg-subtle">{c.u}</span>}
            </span>
            <span className={cn("tabular block font-body text-[11px]",
              c.d?.tone === "dn" ? "font-semibold text-[#C2610E]" : c.d?.tone === "fl" ? "text-fg-subtle" : "text-fg-subtle")}>
              {c.d ? c.d.txt : "Comparison unavailable"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 font-body text-[10.5px] leading-relaxed text-fg-subtle">
        Licence figures are current-snapshot facts with no stored history. Neither is a contracted seat
        count, and active users are never expressed as a percentage of them.
      </p>
    </div>
  );
}

const METRIC_DEFS = {
  m1: "Distinct users with at least one recorded product action in the selected period. Not logins. Deduplicated across modules. Shown as an absolute count — no percentage of licences, because the licence count for a past period is not stored.",
  m2: "Weekly actives divided by monthly actives within the selected period. Both sides come from the same window, so no historical seat count is involved.",
};

/** Use-case evidence at FULL width, with a rolled-up parent state that
 *  describes the evidence rather than the outcome. */
export function UseCaseEvidence({ rows, onTask }: { rows: UseCaseRow[]; onTask: (t: string) => void }) {
  const [open, setOpen] = useState<string[]>(["uc2"]);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const TONE: Record<ParentState, string> = {
    supporting: "bg-[#1F9D63]/12 text-[#1F9D63]",
    partial: "bg-[#C99A14]/15 text-[#8A6D12]",
    none: "bg-[#C2610E]/12 text-[#C2610E]",
    cannot: "bg-bg-muted text-fg-muted",
  };
  return (
    <div>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {rows.map((r) => {
          const multi = r.products.length > 1;
          const ps = parentState(r.products);
          const isOpen = open.includes(r.id);
          const only = r.products[0];
          return (
            <li key={r.id}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                {multi ? (
                  <button onClick={() => toggle(r.id)} aria-expanded={isOpen}
                    className="flex min-w-[13rem] flex-1 items-center gap-1.5 text-left">
                    <ChevronRight size={12} className={cn("shrink-0 text-fg-subtle transition-transform", isOpen && "rotate-90")} aria-hidden />
                    <span className="font-body text-[13px] text-fg">{r.name}</span>
                  </button>
                ) : (
                  <span className="min-w-[13rem] flex-1 pl-[18px] font-body text-[13px] text-fg">{r.name}</span>
                )}
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]", TONE[ps])}>
                  {PARENT_LABEL[ps]}
                </span>
                <span className="w-[20rem] font-body text-[11.5px] text-fg-muted">{parentReading(r)}</span>
                {!multi && only.state !== "activity_present" && (
                  <button onClick={() => onTask(EVIDENCE_STATE[only.state].action?.label ?? "Create task")}
                    className="shrink-0 rounded-lg border border-border px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    {EVIDENCE_STATE[only.state].action?.label}
                  </button>
                )}
              </div>
              {multi && isOpen && (
                <ul className="flex flex-col gap-1.5 pb-2 pl-[26px]">
                  {r.products.map((pr) => (
                    <li key={pr.product} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-[5rem] shrink-0 font-body text-[11.5px] font-semibold text-fg-muted">{pr.product}</span>
                      <StatePill s={pr.state} />
                      <span className="min-w-[12rem] flex-1 font-body text-[11.5px] text-fg-muted">{pr.reading}</span>
                      {pr.state !== "activity_present" && (
                        <button onClick={() => onTask(EVIDENCE_STATE[pr.state].action?.label ?? "Create task")}
                          className="shrink-0 rounded-lg border border-border px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                          {EVIDENCE_STATE[pr.state].action?.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 max-w-[92ch] font-body text-[11px] leading-relaxed text-fg-subtle">
        Parent states describe the evidence, not the outcome. Signal can show what product-usage evidence
        is available for a use case; it cannot say whether the use case is succeeding.
      </p>
    </div>
  );
}
