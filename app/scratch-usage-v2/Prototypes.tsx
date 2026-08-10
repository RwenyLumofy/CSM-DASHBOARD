"use client";

/* =========================================================================
   Usage tab v2 — Prototype A (balanced) and B (compact operational).

   Same fixtures, same atoms, same product logic. They differ in HIERARCHY and
   DENSITY only, which is the thing under review.

     A  single column, evidence-first, generous. Chart is large, observations
        sit directly beneath it so the highlight interaction is visible without
        scrolling. Reference sections collapse at the bottom.
     B  two columns above the fold. Facts and chart left, observations and
        use-case evidence right, so the relationship between an observation and
        the evidence it came from is side by side rather than sequential.
        Reference sections become one row of disclosures.

   FIXTURE-ONLY. Nothing here reads a database. Nothing here is production
   behaviour.
   ========================================================================= */

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  ALL_METRICS, CONTENT_MIX, FOLLOW_THROUGH, AI_LEVERAGE, METRICS, MODULES,
  OBSERVATIONS, SCENARIOS, SETUP_CHECKLIST, USE_CASES,
  freshnessFromHours, type Observation, type Scenario,
} from "./fixtures";
import {
  ActivityChart, Disclosure, InsufficientHistory, KnownLimitation, MetricRow,
  NoEnvironment, Notice, Observations, Section, SmallPopulation, StaleBanner,
  StatePill, StateAction, TaskDraft, TrendFallback, TrustBar,
  UseCasesFlat, UseCasesNested, SummaryStrip, UseCaseEvidence,
} from "./parts";

/* ------------------------------------------------------ shared sections */

function ReferenceSections({ dense }: { dense?: boolean }) {
  return (
    <div className={cn("grid gap-2", dense && "sm:grid-cols-2")}>
      <Disclosure label="Setup checklist" count={`${SETUP_CHECKLIST.filter((c) => c.ok).length} of ${SETUP_CHECKLIST.length} pass`} dense={dense}>
        <ul className="flex flex-col gap-1">
          {SETUP_CHECKLIST.map((c) => (
            <li key={c.label} className="flex items-center gap-2 font-body text-[12px]">
              <span className={cn("size-1.5 shrink-0 rounded-full", c.ok ? "bg-[#1F9D63]" : "bg-[#C2610E]")} aria-hidden />
              <span className={c.ok ? "text-fg-muted" : "text-fg"}>{c.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-body text-[10.5px] leading-relaxed text-fg-subtle">
          Existing checklist logic, reorganised and unchanged. Not converted into observations &mdash; the
          decision rules and actions for that are not specified yet.
        </p>
      </Disclosure>

      <Disclosure label="Products and modules" count={`${MODULES.filter((m) => m.entitled).length} entitled`} dense={dense}>
        <ul className="flex flex-col gap-1.5">
          {MODULES.map((m) => (
            <li key={m.name} className="flex flex-wrap items-baseline gap-x-2 font-body text-[12px]">
              <span className="w-[4.5rem] shrink-0 font-semibold text-fg">{m.name}</span>
              <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]",
                m.entitled ? "bg-bg-muted text-fg-muted" : "bg-[#C99A14]/15 text-[#8A6D12]")}>
                {m.entitled ? "In plan" : "Not entitled"}
              </span>
              <span className="min-w-0 flex-1 text-fg-muted">{m.reading}</span>
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure label="Content and follow-through" count="by source and activity" dense={dense}>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Content mix by source</p>
        <ul className="mt-1 flex flex-col gap-1">
          {CONTENT_MIX.map((c) => (
            <li key={c.source} className="flex items-baseline gap-2 font-body text-[12px]">
              <span className="tabular w-8 shrink-0 font-semibold text-fg">{c.share}%</span>
              <span className="min-w-0 flex-1 text-fg-muted">{c.source}</span>
              <span className="tabular text-fg-subtle">{c.starts.toLocaleString()} starts</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">Started versus completed</p>
        <ul className="mt-1 flex flex-col gap-1">
          {FOLLOW_THROUGH.map((f) => (
            <li key={f.activity} className="flex items-baseline gap-2 font-body text-[12px]">
              <span className="min-w-0 flex-1 text-fg-muted">{f.activity}</span>
              <span className="tabular text-fg-subtle">{f.distinctCourses} distinct</span>
              <span className="tabular text-fg-subtle">{f.started.toLocaleString()} &rarr; {f.completed.toLocaleString()}</span>
              <span className="tabular w-9 text-right font-semibold text-fg">{Math.round((f.completed / f.started) * 100)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">AI leverage</p>
        <ul className="mt-1 flex flex-wrap gap-x-5">
          {AI_LEVERAGE.map((a) => (
            <li key={a.label} className="font-body text-[12px] text-fg-muted">
              {a.label} <span className="tabular font-semibold text-fg">{a.value}</span>
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure label="Definitions and all metrics" count={`${ALL_METRICS.length} shown · 44 in full`} dense={dense}>
        <table className="w-full">
          <thead>
            <tr>{["Metric", "Value", "Change", "Source"].map((h) => (
              <th key={h} className="pb-1 text-left font-body text-[10px] font-bold uppercase tracking-[0.05em] text-fg-subtle">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {ALL_METRICS.map((m) => (
              <tr key={m.key} className="border-t border-border-subtle">
                <td className="py-1 font-body text-[11.5px] text-fg-muted">{m.name}</td>
                <td className="tabular py-1 font-body text-[11.5px] font-semibold text-fg">{m.value}</td>
                <td className="tabular py-1 font-body text-[11.5px] text-fg-subtle">{m.change}</td>
                <td className="py-1 font-mono text-[10px] text-fg-subtle">{m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </div>
  );
}

/* ------------------------------------------------------------- shell */

function useProto(initial: Scenario) {
  const [scenario, setScenario] = useState<Scenario>(initial);
  const [period, setPeriod] = useState(SCENARIOS[initial].selectedPeriod);
  const [focus, setFocus] = useState<Observation | null>(null);
  const [task, setTask] = useState<{ title: string } | null>(null);

  const base = SCENARIOS[scenario];
  const inProgress = period === "2026-08";
  const s = {
    ...base,
    selectedPeriod: period,
    periodStatus: inProgress ? ("in_progress" as const) : ("complete" as const),
    comparisonDisabled: inProgress
      ? SCENARIOS.in_progress.comparisonDisabled
      : scenario === "in_progress" ? null : base.comparisonDisabled,
  };
  const freshness = freshnessFromHours(s.syncHoursAgo);
  const pick = (sc: Scenario) => { setScenario(sc); setPeriod(SCENARIOS[sc].selectedPeriod); setFocus(null); };

  return { scenario, pick, s, freshness, period, setPeriod, focus, setFocus, task, setTask };
}

function ScenarioSwitch({ value, onChange }: { value: Scenario; onChange: (s: Scenario) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-body text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-subtle">Prototype state</span>
      {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
        <button key={k} onClick={() => onChange(k)}
          className={cn("rounded-md border px-2 py-0.5 font-body text-[11.5px] transition-colors",
            value === k ? "border-sirius bg-accent-soft font-semibold text-sirius" : "border-border text-fg-muted hover:text-fg")}>
          {SCENARIOS[k].label}
        </button>
      ))}
    </div>
  );
}

/* ================================================== PROTOTYPE A */

export function PrototypeA() {
  const p = useProto("default");
  const empty = p.scenario === "no_environment";
  const obs = empty ? [] : OBSERVATIONS;

  return (
    <div className="flex flex-col gap-3">
      <ScenarioSwitch value={p.scenario} onChange={p.pick} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <TrustBar s={p.s} freshness={p.freshness} onPeriod={p.setPeriod}
            compareBasis={p.s.comparisonDisabled ? null : "Jun 2026"} />

        {empty ? <NoEnvironment /> : (
          <>
            {p.freshness === "stale" && <div className="pb-3"><StaleBanner note={p.s.note ?? ""} /></div>}
            {p.s.periodStatus === "in_progress" && (
              <div className="pb-3"><Notice tone="info">
                <span className="font-semibold text-fg">August is in progress.</span> {p.s.note} {p.s.comparisonDisabled}
              </Notice></div>
            )}

            <MetricRow metrics={METRICS} blocked={p.s.comparisonDisabled} />

            <Section title="Active users by month">
              <ActivityChart highlight={p.focus?.periods ?? []} blocked={null} height={168} />
            </Section>

            <Section title="Observations" aside={<span className="font-body text-[11px] text-fg-subtle">evidence-backed, up to three</span>}>
              <Observations items={obs} focused={p.focus?.id ?? null}
                onFocus={(o) => p.setFocus(p.focus?.id === o.id ? null : o)}
                onTask={(t) => p.setTask({ title: t })} />
            </Section>

            <Section title="Use cases and product evidence" aside={<span className="font-body text-[11px] text-fg-subtle">nested — one row per use case</span>}>
              <UseCasesNested rows={USE_CASES} onTask={(t) => p.setTask({ title: t })} />
            </Section>

            <Section title="Reference">
              <ReferenceSections />
              <div className="mt-2.5"><KnownLimitation /></div>
            </Section>
          </>
        )}
      </div>

      <TaskDraft open={!!p.task} title={p.task?.title ?? ""} onClose={() => p.setTask(null)}
        evidence={["Account · Bank of Bahrain & Kuwait", `Period · ${p.period}`, "Metric · Active users (317)", "Source · client_usage_monthly"]} />
    </div>
  );
}

/* ================================================== PROTOTYPE B */

export function PrototypeB() {
  const p = useProto("default");
  const empty = p.scenario === "no_environment";
  const obs = empty ? [] : OBSERVATIONS;

  return (
    <div className="flex flex-col gap-3">
      <ScenarioSwitch value={p.scenario} onChange={p.pick} />

      <div className="rounded-xl border border-border bg-surface p-3.5">
        <TrustBar s={p.s} freshness={p.freshness} onPeriod={p.setPeriod} dense
            compareBasis={p.s.comparisonDisabled ? null : "Jun 2026"} />

        {empty ? <NoEnvironment /> : (
          <>
            {p.freshness === "stale" && <div className="pb-2"><StaleBanner note={p.s.note ?? ""} /></div>}
            {p.s.periodStatus === "in_progress" && (
              <div className="pb-2"><Notice tone="info">
                <span className="font-semibold text-fg">In progress.</span> {p.s.note} {p.s.comparisonDisabled}
              </Notice></div>
            )}

            {/* Above the fold: facts + chart on the left, observations and the
                evidence they point at on the right, so the link between them is
                spatial rather than sequential. */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <div>
                <MetricRow metrics={METRICS} blocked={p.s.comparisonDisabled} dense />
                <Section title="Active users by month" dense>
                  <ActivityChart highlight={p.focus?.periods ?? []} blocked={null} height={124} />
                </Section>
              </div>
              <div>
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">Observations</h3>
                  <span className="font-body text-[11px] text-fg-subtle">click to trace in the chart</span>
                </div>
                <Observations items={obs} focused={p.focus?.id ?? null} dense
                  onFocus={(o) => p.setFocus(p.focus?.id === o.id ? null : o)}
                  onTask={(t) => p.setTask({ title: t })} />

                <Section title="Use cases and product evidence" dense
                  aside={<span className="font-body text-[11px] text-fg-subtle">nested</span>}>
                  <UseCasesNested rows={USE_CASES} onTask={(t) => p.setTask({ title: t })} dense />
                </Section>
              </div>
            </div>

            <Section title="Reference" dense>
              <ReferenceSections dense />
              <div className="mt-2"><KnownLimitation /></div>
            </Section>
          </>
        )}
      </div>

      <TaskDraft open={!!p.task} title={p.task?.title ?? ""} onClose={() => p.setTask(null)}
        evidence={["Account · Bank of Bahrain & Kuwait", `Period · ${p.period}`, "Metric · Active users (317)", "Source · client_usage_monthly"]} />
    </div>
  );
}

/* ================================================== STATE GALLERY */

export function StateGallery() {
  const [task, setTask] = useState<string | null>(null);
  const cell = (title: string, body: React.ReactNode) => (
    <div className="rounded-lg border border-border-subtle p-3">
      <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">{title}</p>
      {body}
    </div>
  );
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {cell("Insufficient history", <InsufficientHistory />)}
      {cell("Fewer than 20 monthly actives", <SmallPopulation />)}
      {cell("Live trend query unavailable", <TrendFallback />)}
      {cell("Sync failed — previous evidence retained", <StaleBanner note="Everything shown is the last good reading, from 30 Jul 2026." />)}
      {cell("Use-case states, one of each", (
        <ul className="flex flex-col gap-2">
          {USE_CASES.filter((r) => r.products.length === 1).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <StatePill s={r.products[0].state} />
              <span className="min-w-0 flex-1 truncate font-body text-[12px] text-fg">{r.name}</span>
              <StateAction s={r.products[0].state} onTask={(t) => setTask(t)} />
            </li>
          ))}
        </ul>
      ))}
      {cell("Multi-product use case — NESTED (recommended)", (
        <UseCasesNested rows={USE_CASES.filter((r) => r.products.length > 1)} onTask={(t) => setTask(t)} dense />
      ))}
      {cell("Multi-product use case — FLAT, one row per product", (
        <UseCasesFlat rows={USE_CASES.filter((r) => r.products.length > 1)} onTask={(t) => setTask(t)} />
      ))}
      <TaskDraft open={!!task} title={task ?? ""} onClose={() => setTask(null)}
        evidence={["Account · Bank of Bahrain & Kuwait", "Period · 2026-07", "Product · Perform", "State · No activity recorded"]} />
    </div>
  );
}

/* ================================================== HYBRID (B refined) */

export function PrototypeHybrid() {
  const p = useProto("default");
  const empty = p.scenario === "no_environment";
  const obs = empty ? [] : OBSERVATIONS.slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <ScenarioSwitch value={p.scenario} onChange={p.pick} />

      <div className="@container/tab rounded-xl border border-border bg-surface p-4">
        {/* 1 · trust controls, full width, on their own rule */}
        <div className="border-b border-border">
          <TrustBar s={p.s} freshness={p.freshness} onPeriod={p.setPeriod}
            compareBasis={p.s.comparisonDisabled ? null : "Jun 2026"} />
        </div>

        {empty ? <div className="pt-3"><NoEnvironment /></div> : (
          <>
            {p.freshness === "stale" && <div className="pt-3"><StaleBanner note={p.s.note ?? ""} /></div>}
            {p.s.periodStatus === "in_progress" && (
              <div className="pt-3"><Notice tone="info">
                <span className="font-semibold text-fg">August is in progress.</span> {p.s.note} {p.s.comparisonDisabled}
              </Notice></div>
            )}

            {/* 2 · compact summary strip */}
            <SummaryStrip blocked={p.s.comparisonDisabled} />

            {/* 3 · analysis row — chart at A's height, at most three observations */}
            {/* @container, not lg:. The tab sits inside Signal's nav and profile
                chrome, so a 1280px viewport leaves roughly 940px of content —
                a viewport breakpoint would hold two columns at widths where
                neither panel is readable. Stacks below 62rem of CONTAINER. */}
            <div className="mt-4 grid gap-5 @[62rem]/tab:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div>
                <p className="mb-2 flex items-baseline gap-2 font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                  Active users by month
                  <span className="font-normal normal-case tracking-normal text-[11px] text-fg-subtle">absolute counts · monthly series</span>
                </p>
                <ActivityChart highlight={p.focus?.periods ?? []} blocked={null} height={168} />
              </div>
              <div>
                <p className="mb-2 flex items-baseline gap-2 font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                  Observations
                  <span className="font-normal normal-case tracking-normal text-[11px] text-fg-subtle">max three · click to trace</span>
                </p>
                <Observations items={obs} focused={p.focus?.id ?? null} dense
                  onFocus={(o) => p.setFocus(p.focus?.id === o.id ? null : o)}
                  onTask={(t) => p.setTask({ title: t })} />
              </div>
            </div>

            {/* 4 · use-case evidence, full width */}
            <Section title="Use-case evidence"
              aside={<span className="font-body text-[11px] text-fg-subtle">available product-usage evidence for each recorded use case</span>}>
              <UseCaseEvidence rows={USE_CASES} onTask={(t) => p.setTask({ title: t })} />
            </Section>

            {/* 5 · reference, progressive disclosure */}
            <Section title="Reference">
              <ReferenceSections dense />
              <div className="mt-2.5"><KnownLimitation /></div>
            </Section>
          </>
        )}
      </div>

      <TaskDraft open={!!p.task} title={p.task?.title ?? ""} onClose={() => p.setTask(null)}
        evidence={["Account · Bank of Bahrain & Kuwait", `Period · ${p.period}`, "Metric · Active users (317)", "Source · client_usage_monthly"]} />
    </div>
  );
}
