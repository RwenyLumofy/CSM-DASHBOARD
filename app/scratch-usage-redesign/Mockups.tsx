"use client";

/* =========================================================================
   Usage tab redesign — static mockups.

   Figures marked with a superscript dagger are INVENTED for the mockup. Every
   other number is Bank of Bahrain & Kuwait's real production reading, so the
   density on screen is the density a real account produces rather than a
   flattering sample.

   The tab it replaces is 1,150 lines across 13 sections, read-only, with no
   period comparison and a built-in "How to read" explainer. That explainer is
   the tell: a surface that needs instructions is answering the wrong question.
   These mockups keep every analysis and reorganise it around the decision.
   ========================================================================= */

import { useState } from "react";
import {
  ChevronDown, ChevronRight, CircleAlert, CirclePlus, ExternalLink, Info,
  Minus, Plug, RefreshCw, TrendingDown, TrendingUp, TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------- atoms */

/** Marks a number the mockup invented, so nobody reads it as a real reading. */
const Fake = () => <sup className="ml-0.5 font-body text-[9px] font-bold text-[#C2610E]" title="Invented for the mockup">†</sup>;

function Delta({ v, unit = "", invert = false }: { v: number; unit?: string; invert?: boolean }) {
  const good = invert ? v < 0 : v > 0;
  const flat = v === 0;
  const Icon = flat ? Minus : v > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-body text-[11px] font-semibold tabular",
      flat ? "text-fg-subtle" : good ? "text-[#1F9D63]" : "text-[#C2610E]")}>
      <Icon size={11} aria-hidden />{v > 0 ? "+" : ""}{v}{unit}
    </span>
  );
}

function Eyebrow({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h3 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">{children}</h3>
      {hint && <span className="font-body text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  );
}

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <section className={cn("rounded-xl border border-border bg-surface p-4", className)}>{children}</section>
);

/* ------------------------------------------------------- 1. control bar */

function ControlBar() {
  const [period, setPeriod] = useState("month");
  const [compare, setCompare] = useState("prev");
  const periods = [["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["custom", "Custom"]];
  const compares = [["prev", "Previous period"], ["yoy", "Same period last year"], ["median", "Portfolio median"], ["none", "No comparison"]];

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface/95 px-3.5 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Period</span>
        <div className="flex rounded-lg border border-border p-0.5">
          {periods.map(([k, label]) => (
            <button key={k} onClick={() => setPeriod(k)}
              className={cn("rounded-md px-2 py-1 font-body text-[12px] transition-colors",
                period === k ? "bg-accent-soft font-semibold text-sirius" : "text-fg-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Compare to</span>
        <div className="relative">
          <select value={compare} onChange={(e) => setCompare(e.target.value)}
            className="appearance-none rounded-lg border border-border bg-surface py-1 pl-2.5 pr-7 font-body text-[12px] text-fg">
            {compares.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden />
        </div>
      </div>
      <span className="ml-auto font-body text-[11px] text-fg-subtle">
        Jul 2026 vs Jun 2026 · synced 2h ago
      </span>
    </div>
  );
}

/* ----------------------------------------------------- 2. verdict strip */

const FINDINGS = [
  { id: "f1", sev: "critical", title: "Perform has never been used", evidence: "Owned since go-live. 0 cycles configured, 0 completed. Two recorded use cases expect it.", action: "Create task", section: "Use cases" },
  { id: "f2", sev: "warning", title: "Monthly actives fell 12% while seats grew", evidence: "MAU 317 → 279 against 757 seats. Activation 41.9% → 36.9%.", action: "Add to Pulse", section: "Activation" },
  { id: "f3", sev: "warning", title: "440 seats have never been assigned", evidence: "748 of 757 licences consumed, but 317 monthly actives. Downsell exposure at renewal.", action: "Add to Pulse", section: "Seats" },
  { id: "f4", sev: "info", title: "Two use cases name no product", evidence: "Their definitions have an empty products[] list, so adoption can't be checked.", action: "Open definition", section: "Use cases" },
  { id: "f5", sev: "info", title: "Content is 91% Lumofy library", evidence: "Company-authored content is 9% of enrolments. Low authoring effort, high dependency.", action: "Add to Pulse", section: "Content" },
];

const SEV_STYLE: Record<string, string> = {
  critical: "bg-[#B23A57]/10 text-[#B23A57]",
  warning: "bg-[#C99A14]/15 text-[#8A6D12]",
  info: "bg-bg-muted text-fg-muted",
};

function VerdictStrip({ forceOpen = false }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(forceOpen);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <span className="tabular font-display text-[30px] font-bold leading-none text-fg">62</span>
          <Delta v={-4} />
        </div>
        <span className="rounded-pill bg-[#C99A14]/15 px-2.5 py-1 font-body text-[12.5px] font-semibold text-[#8A6D12]">
          Developing
        </span>
        <p className="min-w-0 flex-1 font-body text-[13.5px] leading-snug text-fg">
          Deep use of Develop by a third of the seats, and no use of Perform at all &mdash; the plan is
          wider than the adoption.
        </p>
        <button onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
          5 things need attention
          <ChevronRight size={13} className={cn("transition-transform", open && "rotate-90")} aria-hidden />
        </button>
      </div>

      {open && (
        <ul className="flex flex-col divide-y divide-border-subtle border-t border-border">
          {FINDINGS.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 hover:bg-bg-muted/50">
              <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]", SEV_STYLE[f.sev])}>
                {f.sev}
              </span>
              <div className="min-w-0 flex-1">
                <button className="text-left font-body text-[13px] font-semibold text-fg hover:text-sirius">
                  {f.title}
                </button>
                <p className="mt-0.5 font-body text-[12px] leading-relaxed text-fg-muted">{f.evidence}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden font-body text-[10.5px] text-fg-subtle sm:inline">&rarr; {f.section}</span>
                <button className="rounded-lg border border-border px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                  {f.action}
                </button>
              </div>
            </li>
          ))}
          <li className="px-4 py-2.5">
            <p className="font-body text-[11px] text-fg-subtle">
              Setup checklist passed 6 of 8 &mdash; the two failures are findings above. It collapses to
              &ldquo;Setup complete&rdquo; when all pass.
            </p>
          </li>
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------- 3. use cases versus usage */

const USE_CASES = [
  { name: "Compliance training at scale", module: "Develop", state: "running", read: "4,812 enrolments this period", delta: 6 },
  { name: "Onboarding new joiners", module: "Develop", state: "running", read: "1,204 enrolments · 61% completed", delta: -3 },
  { name: "Annual performance cycle", module: "Perform", state: "not_started", read: "0 cycles configured since go-live", delta: 0 },
  { name: "Succession planning", module: "Perform", state: "not_started", read: "0 talent assessments enrolled", delta: 0 },
  { name: "Employee listening", module: "Engage", state: "running", read: "2 survey cycles · 418 responses", delta: 12 },
  { name: "Leadership development", module: null, state: "unknown", read: "Definition names no product", delta: 0 },
  { name: "Culture programme", module: null, state: "unknown", read: "Definition names no product", delta: 0 },
];

const STATE_META: Record<string, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-[#1F9D63]/12 text-[#1F9D63]" },
  not_started: { label: "Not started", cls: "bg-[#C2610E]/12 text-[#C2610E]" },
  unknown: { label: "Can't tell", cls: "bg-bg-muted text-fg-subtle" },
};

function UseCasesVersusUsage() {
  return (
    <Card>
      <Eyebrow hint="what they said they'd do, against what the product shows">Use cases versus usage</Eyebrow>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {USE_CASES.map((u) => (
          /* A grid, not flex: the columns have to line up down the list or the
             three states stop being comparable at a glance, which is the only
             reason this section exists. Collapses to two rows under 768px. */
          <li key={u.name} className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_5rem_14rem_7rem]">
            <span className={cn("justify-self-start rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]", STATE_META[u.state].cls)}>
              {STATE_META[u.state].label}
            </span>
            <span className="min-w-0 truncate font-body text-[13px] text-fg">{u.name}</span>
            <span className="col-start-2 font-body text-[11px] text-fg-subtle sm:col-start-3">{u.module ?? "—"}</span>
            <span className="col-start-2 font-body text-[12px] text-fg-muted sm:col-start-4">{u.read}<Fake /></span>
            <span className="col-start-2 justify-self-start sm:col-start-5 sm:justify-self-end">
              {u.state === "running"
                ? <Delta v={u.delta} unit="%" />
                : (
                  <button className="rounded-lg border border-border px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
                    {u.state === "not_started" ? "Create task" : "Open definition"}
                  </button>
                )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border-subtle pt-2.5 font-body text-[12px] leading-relaxed text-fg-muted">
        <span className="font-semibold text-fg">The inverse read:</span> Perform is in the plan, unused, and
        two recorded use cases expect it. Engage is in the plan and used by one use case only.
      </p>
    </Card>
  );
}

/* ------------------------------------ 4. activation and active users */

const SERIES = [38, 41, 44, 46, 43, 45, 47, 44, 42, 40, 38, 37];
const COMPARE_SERIES = [33, 35, 36, 39, 41, 42, 44, 45, 46, 45, 44, 43];

function Chart() {
  const w = 660, h = 132, pad = 4;
  const max = 50, min = 28;
  const pt = (arr: number[]) => arr.map((v, i) =>
    `${pad + (i / (arr.length - 1)) * (w - pad * 2)},${h - pad - ((v - min) / (max - min)) * (h - pad * 2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[132px] w-full" role="img" aria-label="Activation rate over twelve months, with the comparison period overlaid">
      {[0, 0.5, 1].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={pad + f * (h - pad * 2)} y2={pad + f * (h - pad * 2)}
          stroke="var(--color-border-subtle)" strokeWidth="1" />
      ))}
      <polyline points={pt(COMPARE_SERIES)} fill="none" stroke="var(--color-fg-subtle)" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={pt(SERIES)} fill="none" stroke="var(--color-sirius)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Kpi({ label, value, delta, sub, unit = "", invert = false }: { label: string; value: string; delta: number; sub: string; unit?: string; invert?: boolean }) {
  return (
    <div className="rounded-lg bg-bg-muted/50 px-3 py-2.5">
      <p className="font-body text-[11px] text-fg-subtle">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tabular font-display text-[19px] font-bold text-fg">{value}</span>
        <Delta v={delta} unit={unit} invert={invert} />
      </p>
      <p className="mt-0.5 font-body text-[11px] text-fg-subtle">{sub}</p>
    </div>
  );
}

function Activation() {
  return (
    <Card>
      <Eyebrow hint="one chart, comparison dashed">Activation and active users</Eyebrow>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Activation" value="41.9%" delta={-5.0} unit="pp" sub="748 of 757 licences" />
        <Kpi label="Monthly actives" value="317" delta={-12} unit="%" sub="of 757 seats" />
        <Kpi label="Weekly actives" value="112" delta={-8} unit="%" sub="35% of MAU" />
        <Kpi label="Stickiness" value="35%" delta={2} unit="pp" sub="WAU ÷ MAU" />
      </div>
      <div className="mt-3">
        <Chart />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 font-body text-[11px] text-fg-muted">
            <span className="h-0.5 w-4 rounded bg-sirius" aria-hidden /> Jul 2026 &mdash; activation %
          </span>
          <span className="flex items-center gap-1.5 font-body text-[11px] text-fg-subtle">
            <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-fg-subtle" aria-hidden /> Jun 2026
          </span>
          <span className="ml-auto font-body text-[11px] text-fg-subtle">Nov 2025 &ndash; Jul 2026 is all the monthly history there is</span>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------- 5. modules in plan */

const MODULES = [
  { name: "Develop", owned: true, used: true, volume: "12,514 enrolments · 9,727 completed", delta: 4 },
  { name: "Perform", owned: true, used: false, volume: "0 cycles configured, 0 completed", delta: 0 },
  { name: "Engage", owned: true, used: true, volume: "2 cycles · 418 responses", delta: 12 },
];

function Modules() {
  return (
    <Card>
      <Eyebrow>Modules in plan</Eyebrow>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {MODULES.map((m) => (
          <li key={m.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="w-[5rem] shrink-0 font-body text-[13px] font-semibold text-fg">{m.name}</span>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em]",
              m.used ? "bg-[#1F9D63]/12 text-[#1F9D63]" : "bg-[#C2610E]/12 text-[#C2610E]")}>
              {m.used ? "In use" : "Owned, unused"}
            </span>
            <span className="min-w-0 flex-1 font-body text-[12px] text-fg-muted">{m.volume}</span>
            <span className="w-12 shrink-0 text-right">{m.used ? <Delta v={m.delta} unit="%" /> : <span className="font-body text-[11px] text-fg-subtle">&mdash;</span>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 font-body text-[11px] text-fg-subtle">
        Owned is from the plan. There is no record of WHEN a module was added, so &ldquo;unused since&rdquo;
        cannot be shown.
      </p>
    </Card>
  );
}

/* -------------------------------------- 6. content and follow-through */

function ContentAndFollowThrough() {
  const sources = [
    { label: "Lumofy library", pct: 68, n: "8,509" },
    { label: "Global (Go1, Coursera)", pct: 23, n: "2,878" },
    { label: "Company-authored", pct: 9, n: "1,127" },
  ];
  const funnel = [
    { label: "Learning items", enrolled: "12,514", completed: "9,727", pct: 78, delta: 4 },
    { label: "Pathways", enrolled: "2,932", completed: "1,531", pct: 52, delta: -6 },
    { label: "Quizzes", enrolled: "3,140", completed: "2,714", pct: 86, delta: 2 },
  ];
  return (
    <Card>
      <Eyebrow>Content and follow-through</Eyebrow>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 font-body text-[12px] font-semibold text-fg">Where the content comes from</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-pill">
            <span className="bg-sirius" style={{ width: "68%" }} />
            <span className="bg-sirius/55" style={{ width: "23%" }} />
            <span className="bg-sirius/25" style={{ width: "9%" }} />
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {sources.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 font-body text-[12px]">
                <span className={cn("size-2 shrink-0 rounded-sm", i === 0 ? "bg-sirius" : i === 1 ? "bg-sirius/55" : "bg-sirius/25")} aria-hidden />
                <span className="tabular w-8 font-semibold text-fg">{s.pct}%</span>
                <span className="min-w-0 flex-1 truncate text-fg-muted">{s.label}</span>
                <span className="tabular text-fg-subtle">{s.n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-body text-[11.5px] leading-relaxed text-fg-muted">
            9% company-authored means the account leans almost entirely on our library &mdash; cheap to run,
            and nothing of their own to lose if they leave.
          </p>
        </div>
        <div>
          <p className="mb-2 font-body text-[12px] font-semibold text-fg">Enrolled versus completed</p>
          <ul className="flex flex-col gap-2.5">
            {funnel.map((f) => (
              <li key={f.label}>
                <div className="flex items-baseline gap-2 font-body text-[12px]">
                  <span className="min-w-0 flex-1 text-fg-muted">{f.label}</span>
                  <span className="tabular text-fg-subtle">{f.enrolled} &rarr; {f.completed}</span>
                  <span className="tabular w-9 text-right font-semibold text-fg">{f.pct}%</span>
                  <span className="w-12 text-right"><Delta v={f.delta} unit="pp" /></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-bg-muted">
                  <span className={cn("block h-full rounded-pill", f.pct >= 70 ? "bg-[#1F9D63]" : "bg-[#C99A14]")} style={{ width: `${f.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------ 7. seats and licences */

function Seats() {
  return (
    <Card>
      <Eyebrow>Seats and licences</Eyebrow>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Seats" value="757" delta={0} sub="no seat history is stored" />
        <Kpi label="Licences used" value="748" delta={1} unit="%" sub="98.8% consumed" />
        <Kpi label="Monthly actives" value="317" delta={-12} unit="%" sub="41.9% of seats" />
        <Kpi label="Never active" value="440" delta={9} unit="%" invert sub="seats assigned, unused" />
      </div>
      <div className="mt-3 rounded-lg border border-[#C99A14]/30 bg-[#C99A14]/[0.06] px-3.5 py-3">
        <p className="font-body text-[13px] font-semibold text-fg">Two commercial reads, and they point opposite ways</p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            <span className="font-semibold text-[#C2610E]">Downsell exposure.</span>{" "}
            440 of 757 seats are assigned but never active. At renewal that is the number procurement will find.
          </li>
          <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            <span className="font-semibold text-[#1F9D63]">Expansion trigger.</span>{" "}
            98.8% of licences are consumed. If activation turns upward, they run out of room before they run out of need.
          </li>
        </ul>
      </div>
      <p className="mt-2 font-body text-[11px] text-fg-subtle">
        &ldquo;Never active&rdquo;<Fake /> is licences-used minus monthly actives &mdash; a proxy. True
        never-opened counts need a usage-sync change.
      </p>
    </Card>
  );
}

/* ---------------------------------------------- collapsed: all metrics */

function AllMetrics() {
  const [open, setOpen] = useState(false);
  const rows = [
    ["mau", "Monthly active users", "317", -12, "SNAPSHOT_SQL"],
    ["wau", "Weekly active users", "112", -8, "SNAPSHOT_SQL"],
    ["seats", "Seats", "757", 0, "SNAPSHOT_SQL"],
    ["used_licenses", "Licences used", "748", 1, "SNAPSHOT_SQL"],
    ["learning_enrollments", "Learning enrolments", "12,514", 4, "PERIOD_SNAPSHOT_SQL"],
    ["learning_completions", "Learning completions", "9,727", 6, "PERIOD_SNAPSHOT_SQL"],
  ];
  return (
    <div className="rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-bg-muted">
        <span className="font-body text-[12.5px] font-semibold text-fg">All metrics</span>
        <span className="font-body text-[11.5px] text-fg-subtle">44 rows · every figure with its source and change</span>
        <ChevronRight size={13} className={cn("ml-auto text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <table className="w-full border-t border-border">
          <thead>
            <tr className="border-b border-border-subtle">
              {["Key", "Metric", "Value", "Change", "Source"].map((h) => (
                <th key={h} className="px-4 py-1.5 text-left font-body text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0] as string} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-1.5 font-mono text-[11px] text-fg-subtle">{r[0]}</td>
                <td className="px-4 py-1.5 font-body text-[12px] text-fg-muted">{r[1]}</td>
                <td className="tabular px-4 py-1.5 font-body text-[12px] font-semibold text-fg">{r[2]}</td>
                <td className="px-4 py-1.5"><Delta v={r[3] as number} unit="%" /></td>
                <td className="px-4 py-1.5 font-mono text-[10.5px] text-fg-subtle">{r[4]}</td>
              </tr>
            ))}
            <tr><td colSpan={5} className="px-4 py-2 font-body text-[11px] text-fg-subtle">… 38 more rows</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --------------------------------------------------------- the frames */

function Frame({ title, note, width, children }: { title: string; note: string; width: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="font-display text-[16px] font-semibold text-fg">{title}</h2>
        <p className="font-body text-[12px] text-fg-muted">{note}</p>
      </div>
      <div className="overflow-x-auto rounded-xl bg-bg-muted/40 p-4">
        <div style={{ width }} className="max-w-full">
          <div className="flex flex-col gap-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- non-happy states */

function StateCard({ icon: Icon, tone, title, body, action }: {
  icon: typeof Plug; tone: "muted" | "warn"; title: string; body: React.ReactNode; action: string;
}) {
  return (
    <Card className={cn(tone === "warn" && "border-[#C99A14]/40 bg-[#C99A14]/[0.05]")}>
      <div className="flex gap-3">
        <Icon size={17} className={cn("mt-0.5 shrink-0", tone === "warn" ? "text-[#C99A14]" : "text-fg-subtle")} aria-hidden />
        <div className="min-w-0">
          <p className="font-body text-[13.5px] font-semibold text-fg">{title}</p>
          <div className="mt-1 max-w-[62ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{body}</div>
          <button className="mt-2.5 rounded-lg border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            {action}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="h-8 w-2/3 animate-pulse rounded bg-bg-muted" />
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-muted" />)}
        </div>
        <div className="h-[132px] animate-pulse rounded bg-bg-muted" />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- page */

export function UsageRedesignMockups() {
  const full = (
    <>
      <ControlBar />
      <VerdictStrip />
      <UseCasesVersusUsage />
      <Activation />
      <Modules />
      <ContentAndFollowThrough />
      <Seats />
      <AllMetrics />
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-9 p-6">
      <header className="max-w-[70ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Mockup</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">Usage tab &mdash; redesign</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          Seven sections plus collapsed reference, replacing thirteen. Figures are Bank of Bahrain &amp;
          Kuwait&rsquo;s real production readings except where marked{" "}
          <Fake />, which are invented for the mockup. Nothing here is shown that the data cannot support &mdash;
          per-user progress, activation by department, seat history and module-added dates are all absent
          on purpose.
        </p>
      </header>

      <Frame title="1 · Full tab at rest — 1280px" width={1232}
        note="Verdict collapsed to one line. Every number carries its comparison against the previous period.">
        {full}
      </Frame>

      <Frame title="2 · Verdict strip expanded" width={1232}
        note="Each finding: title, one line of evidence, one action. Clicking the title scrolls to the section that produced it.">
        <VerdictStrip forceOpen />
      </Frame>

      <Frame title="3 · 768px — the same tab" width={736}
        note="KPI rows go two-up, the use-case rows wrap their evidence beneath the name, the chart keeps full width.">
        {full}
      </Frame>

      <Frame title="4 · Non-happy states" width={1232}
        note="Three of the four required. Loading is the skeleton; the fourth (fresh environment) is below it.">
        <Skeleton />
        <StateCard icon={Plug} tone="muted" title="This account isn't linked to a Lumofy environment"
          action="Link environment"
          body={<>Usage comes from the product database, matched by environment. Nothing here is broken &mdash; there is simply nothing to read yet. Health treats this as absent, not as zero, so the account is not penalised for it.</>} />
        <StateCard icon={TriangleAlert} tone="warn" title="Showing the last good sync — 6 days old"
          action="Retry sync"
          body={<>The last three syncs failed (<span className="font-mono text-[11.5px]">Metabase 504</span>). Everything below is from 30 Jul 2026 and is <span className="font-semibold text-fg">not current</span>. Comparisons are disabled while stale, because a delta between a fresh period and a stale one is worse than no delta.</>} />
        <StateCard icon={CircleAlert} tone="muted" title="Environment provisioned 9 days ago — too early to read"
          action="Set a review date"
          body={<>12 of 757 seats assigned, 3 monthly actives, no completions. An adoption score would be arithmetically valid and practically meaningless, so it is withheld rather than shown as a bad number. The findings list shows onboarding steps instead.</>} />
      </Frame>

      <Frame title="5 · Annotations — what is NOT here, and why" width={1232} note="">
        <Card>
          <ul className="flex flex-col gap-2">
            {[
              ["Per-user progress, “never opened” counts", "Needs a usage-sync change. The “440 never active” figure is a proxy (licences − MAU) and is labelled as one."],
              ["Activation by department / division / role", "The snapshot stores COUNTS of departments and roles, not activity per department. Showing a breakdown would require joining data we do not pull."],
              ["Seat history / seats over time", "client_usage_monthly stores MAU and WAU only. The seats KPI shows no delta for that reason, rather than a fabricated 0%."],
              ["“Unused since <date>” on a module", "Nothing records when a module entered the plan, or when a use-case implementation went live."],
              ["Portfolio median comparison", "Computable from the same monthly table across accounts, but not implemented today — the control offers it and it is the one option that would need new work."],
            ].map(([t, why]) => (
              <li key={t} className="flex gap-2.5">
                <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden />
                <p className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                  <span className="font-semibold text-fg">{t}</span> &mdash; {why}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </Frame>
    </div>
  );
}
