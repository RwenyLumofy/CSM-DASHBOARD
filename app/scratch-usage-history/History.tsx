"use client";

/* =========================================================================
   Usage history and patterns.

   THE RECORD is the account's own numbers, month by month, visible — not
   summarised into a score. A CSM walking into a QBR needs to be able to say
   "you were at 46% in February", and no verdict card lets them do that.

   THE PATTERNS are what recurs in that record. Every one names the months it
   was drawn from, so it can be checked against the row above rather than
   trusted. A pattern nobody can audit is a claim.

   NINE MONTHS IS THE WHOLE RECORD. client_usage_monthly starts Nov 2025. That
   is not long enough to claim a season — "usage always dips in December" needs
   two Decembers, and there has been one. The panel says so rather than
   implying a yearly rhythm it cannot see.
   ========================================================================= */

import { useState } from "react";
import { cn } from "@/lib/cn";

/* Bank of Bahrain & Kuwait. MAU/WAU/seats are the real monthly series shape;
   the enrolment and completion rows are illustrative — the monthly table holds
   MAU and WAU only, which the footnote says out loud. */
const MONTHS = [
  { m: "Nov", y: "25", mau: 288, wau: 96, seats: 757, enrol: 980, done: 610 },
  { m: "Dec", y: "25", mau: 241, wau: 74, seats: 757, enrol: 604, done: 402 },
  { m: "Jan", y: "26", mau: 334, wau: 118, seats: 757, enrol: 1620, done: 1105 },
  { m: "Feb", y: "26", mau: 348, wau: 127, seats: 757, enrol: 1712, done: 1289 },
  { m: "Mar", y: "26", mau: 302, wau: 104, seats: 757, enrol: 1244, done: 902 },
  { m: "Apr", y: "26", mau: 341, wau: 121, seats: 757, enrol: 1508, done: 1176 },
  { m: "May", y: "26", mau: 356, wau: 129, seats: 757, enrol: 1602, done: 1240 },
  { m: "Jun", y: "26", mau: 333, wau: 117, seats: 757, enrol: 1390, done: 1044 },
  { m: "Jul", y: "26", mau: 317, wau: 112, seats: 757, enrol: 1204, done: 959 },
];

const act = (r: typeof MONTHS[number]) => (r.mau / r.seats) * 100;
const depth = (r: typeof MONTHS[number]) => (r.wau / r.mau) * 100;

/* ---------------------------------------------------------- the record */

function Sparkbar({ v, max, tone = "accent" }: { v: number; max: number; tone?: "accent" | "muted" }) {
  return (
    <span className="block h-1 w-full overflow-hidden rounded-pill bg-bg-muted">
      <span className={cn("block h-full rounded-pill", tone === "accent" ? "bg-sirius" : "bg-fg-subtle/50")}
        style={{ width: `${Math.max(4, (v / max) * 100)}%` }} />
    </span>
  );
}

function Record({ highlight }: { highlight: Set<string> }) {
  const maxMau = Math.max(...MONTHS.map((r) => r.mau));
  const maxEnrol = Math.max(...MONTHS.map((r) => r.enrol));

  const ROWS: { key: string; label: string; note?: string; cell: (r: typeof MONTHS[number]) => React.ReactNode }[] = [
    {
      key: "mau", label: "Monthly actives",
      cell: (r) => (
        <>
          <span className="tabular block font-body text-[13px] font-semibold text-fg">{r.mau}</span>
          <Sparkbar v={r.mau} max={maxMau} />
        </>
      ),
    },
    {
      key: "act", label: "Activation", note: "of 757 seats",
      cell: (r) => <span className="tabular block font-body text-[12px] text-fg-muted">{act(r).toFixed(1)}%</span>,
    },
    {
      key: "wau", label: "Weekly actives",
      cell: (r) => <span className="tabular block font-body text-[12px] text-fg-muted">{r.wau}</span>,
    },
    {
      key: "depth", label: "WAU ÷ MAU", note: "how often they return",
      cell: (r) => <span className="tabular block font-body text-[12px] text-fg-muted">{depth(r).toFixed(0)}%</span>,
    },
    {
      key: "enrol", label: "Enrolments",
      cell: (r) => (
        <>
          <span className="tabular block font-body text-[12px] text-fg-muted">{r.enrol.toLocaleString()}</span>
          <Sparkbar v={r.enrol} max={maxEnrol} tone="muted" />
        </>
      ),
    },
    {
      key: "done", label: "Completions", note: "and completion rate",
      cell: (r) => (
        <span className="tabular block font-body text-[12px] text-fg-muted">
          {r.done.toLocaleString()} <span className="text-fg-subtle">· {Math.round((r.done / r.enrol) * 100)}%</span>
        </span>
      ),
    },
    {
      key: "perform", label: "Perform cycles", note: "zero every month on record",
      cell: () => <span className="tabular block font-body text-[12px] text-[#C2610E]">0</span>,
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface pb-2 pr-3 text-left align-bottom">
              <span className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">The record</span>
            </th>
            {MONTHS.map((r) => (
              <th key={r.m + r.y} className={cn("pb-2 text-center align-bottom", highlight.has(r.m + r.y) && "bg-sirius/[0.07]")}>
                <span className="block font-body text-[12px] font-semibold text-fg">{r.m}</span>
                <span className="block font-body text-[10px] text-fg-subtle">&rsquo;{r.y}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={row.key} className={cn(i % 2 === 1 && "bg-bg-muted/30")}>
              <th scope="row" className={cn("sticky left-0 z-10 py-2 pr-4 text-left align-middle",
                i % 2 === 1 ? "bg-[color-mix(in_srgb,var(--color-bg-muted)_30%,var(--color-surface))]" : "bg-surface")}>
                <span className="block whitespace-nowrap font-body text-[12.5px] font-medium text-fg">{row.label}</span>
                {row.note && <span className="block whitespace-nowrap font-body text-[10.5px] text-fg-subtle">{row.note}</span>}
              </th>
              {MONTHS.map((r) => (
                <td key={r.m + r.y} className={cn("px-2.5 py-2 text-center align-middle",
                  highlight.has(r.m + r.y) && "bg-sirius/[0.07]")}>
                  {row.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------- the patterns */

type Pattern = {
  id: string;
  kind: "streak" | "recurring" | "flat" | "peak" | "absent";
  headline: string;
  evidence: string;
  months: string[];
  confidence: "clear" | "needs more history";
};

const PATTERNS: Pattern[] = [
  {
    id: "decline",
    kind: "streak",
    headline: "Two consecutive months of decline — the longest run on record",
    evidence: "356 in May, 333 in June, 317 in July. Every earlier fall lasted a single month: Nov→Dec 2025 and Feb→Mar 2026 both recovered the month after.",
    months: ["May26", "Jun26", "Jul26"],
    confidence: "clear",
  },
  {
    id: "recovery",
    kind: "recurring",
    headline: "Every previous dip recovered the following month",
    evidence: "Dec 25 fell to 241 and was back to 334 in January. Mar 26 fell to 302 and was back to 341 in April. This is the first fall that has not turned.",
    months: ["Dec25", "Jan26", "Mar26", "Apr26"],
    confidence: "clear",
  },
  {
    id: "depth",
    kind: "flat",
    headline: "Return frequency has not moved in nine months",
    evidence: "WAU ÷ MAU has sat between 31% and 37% every month on record. The people who use it come back just as often as they always did — there are simply fewer of them.",
    months: [],
    confidence: "clear",
  },
  {
    id: "peak",
    kind: "peak",
    headline: "The high-water mark is May 2026 — 356 actives, 47.0% activation",
    evidence: "Never above 47%. The plan has been 757 seats throughout, so the ceiling has never been the constraint.",
    months: ["May26"],
    confidence: "clear",
  },
  {
    id: "dec",
    kind: "recurring",
    headline: "The one December on record was the worst month of all",
    evidence: "241 actives, 32% activation, enrolments at 604 — barely a third of February's. Consistent with a holiday slowdown, but ONE December cannot establish a season.",
    months: ["Dec25"],
    confidence: "needs more history",
  },
  {
    id: "perform",
    kind: "absent",
    headline: "Perform has recorded zero in every month since go-live",
    evidence: "Nine months, no cycles configured, no completions. This is not a decline — it never started.",
    months: MONTHS.map((r) => r.m + r.y),
    confidence: "clear",
  },
];

const KIND_META: Record<Pattern["kind"], { label: string; cls: string }> = {
  streak: { label: "Streak", cls: "bg-[#C2610E]/12 text-[#C2610E]" },
  recurring: { label: "Recurring", cls: "bg-accent-soft text-sirius" },
  flat: { label: "Unchanged", cls: "bg-bg-muted text-fg-muted" },
  peak: { label: "Record high", cls: "bg-[#1F9D63]/12 text-[#1F9D63]" },
  absent: { label: "Never happened", cls: "bg-[#B23A57]/10 text-[#B23A57]" },
};

function Patterns({ onHover }: { onHover: (months: string[]) => void }) {
  return (
    <ul className="flex flex-col divide-y divide-border-subtle" onMouseLeave={() => onHover([])}>
      {PATTERNS.map((p) => (
        <li key={p.id} onMouseEnter={() => onHover(p.months)}
          className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg px-2 py-3 transition-colors hover:bg-bg-muted/40">
          <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]", KIND_META[p.kind].cls)}>
            {KIND_META[p.kind].label}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[13.5px] font-semibold leading-snug text-fg">{p.headline}</p>
            <p className="mt-0.5 max-w-[86ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{p.evidence}</p>
            {p.confidence === "needs more history" && (
              <p className="mt-1 font-body text-[11px] font-semibold text-[#8A6D12]">
                Not yet a pattern — one occurrence. Ask again after December 2026.
              </p>
            )}
          </div>
          {p.months.length > 0 && p.months.length < MONTHS.length && (
            <span className="shrink-0 font-body text-[10.5px] text-fg-subtle">
              hover to trace &rarr; {p.months.length} month{p.months.length === 1 ? "" : "s"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- page */

export function UsageHistory() {
  const [highlight, setHighlight] = useState<string[]>([]);
  const set = new Set(highlight);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-6">
      <header className="max-w-[74ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Mockup</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">Usage &mdash; the record, and what recurs in it</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          The account&rsquo;s own numbers, month by month, left visible rather than summarised into a
          score &mdash; so a CSM can say &ldquo;you were at 46% in February&rdquo; in a QBR. Underneath,
          the patterns in that record, each naming the months it was drawn from so it can be checked
          against the row above rather than taken on trust.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl bg-bg-muted/40 p-5">
        <div style={{ width: 1232 }} className="flex max-w-full flex-col gap-4">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <Record highlight={set} />
            <p className="mt-3 border-t border-border-subtle pt-2.5 font-body text-[11px] leading-relaxed text-fg-subtle">
              Nine months is the entire record &mdash; <span className="font-mono">client_usage_monthly</span>{" "}
              starts Nov 2025. Monthly actives, weekly actives and seats are stored; enrolment and
              completion rows here are illustrative, since the monthly table holds MAU and WAU only.
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-1 flex flex-wrap items-baseline gap-2">
              <h2 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                What recurs
              </h2>
              <span className="font-body text-[11px] text-fg-subtle">
                hover a pattern to highlight the months it came from
              </span>
            </div>
            <Patterns onHover={setHighlight} />
          </section>
        </div>
      </div>

      <section className="max-w-[74ch]">
        <h2 className="font-display text-[15px] font-semibold text-fg">Two rules this panel follows</h2>
        <ul className="mt-2 flex flex-col gap-2">
          <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            <span className="font-semibold text-fg">Every pattern names its months.</span> Hovering traces
            them in the record above. A pattern a CSM cannot check is a claim, and they will stop believing
            the ones that are true.
          </li>
          <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            <span className="font-semibold text-fg">One occurrence is not a season.</span> December 2025 was
            the worst month on record and it is tempting to call it annual. There has been one December.
            The panel labels it &ldquo;not yet a pattern&rdquo; and says when to ask again.
          </li>
        </ul>
      </section>
    </div>
  );
}
