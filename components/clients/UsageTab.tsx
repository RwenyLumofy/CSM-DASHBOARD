"use client";

/* =========================================================================
   Usage tab — company-level product-usage dashboard, sourced from Metabase.
   Loads asynchronously (so the profile page stays fast), then tells the
   adoption story top-to-bottom: verdict → activation → active-user trend →
   module adoption → engagement funnel → AI leverage → setup checklist →
   detail table. See lib/usage/* for the data + scoring.
   ========================================================================= */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Info,
  Link2Off,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { LineChart, Donut, Gauge, GroupedBars } from "@/components/ui/charts";
import { cn } from "@/lib/cn";
import { formatDate, formatNumber } from "@/lib/format";
import { currentQuarter, currentWeek, periodBounds, shiftPeriod } from "@/lib/metrics/arr";
import { loadClientUsageAction, loadClientUsagePeriodAction } from "@/app/(app)/clients/[id]/usage-actions";
import type {
  AdoptionScore,
  LearningBreakdown,
  TrendMap,
  UsagePeriodMetrics,
  UsagePeriodResult,
  UsageResult,
  UsageSnapshot,
  UsageSnapshotRow,
  UsageTier,
} from "@/lib/usage/types";

const TIER_COLOR: Record<UsageTier, string> = {
  thriving: "var(--color-aurora)",
  growing: "var(--color-sirius)",
  at_risk: "var(--color-stellar)",
  dormant: "var(--color-nova)",
};
const TIER_LABEL: Record<UsageTier, string> = { thriving: "Thriving", growing: "Growing", at_risk: "At risk", dormant: "Dormant" };

const C = { dev: "var(--color-sirius)", talent: "var(--color-eclipse)", perf: "var(--color-aurora)", ai: "var(--color-nova)", muted: "var(--color-border)" };

function last12Months(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
function fill(trends: TrendMap, key: string, months: string[]): { month: string; value: number }[] {
  const map = new Map((trends[key] ?? []).map((p) => [p.month, p.value]));
  return months.map((m) => ({ month: m, value: map.get(m) ?? 0 }));
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((100 * n) / d) : 0;
}
function moduleStatus(mod: { owned: boolean; used: boolean }): ModuleStatus {
  return mod.used ? "active" : mod.owned ? "unused" : "not_owned";
}
/** Sum of a trend metric over the last `n` months (default: all provided). */
function trendSum(points: { month: string; value: number }[], n = points.length): number {
  return points.slice(-n).reduce((s, p) => s + p.value, 0);
}
/** A data-driven trend delta: compares the most recent `win` months to the
 *  `win` before them. Returns null when there's not enough signal to bother. */
function trendDelta(points: { month: string; value: number }[], win = 3): { pctChange: number; dir: "up" | "down" | "flat" } | null {
  if (points.length < win * 2) return null;
  const recent = trendSum(points.slice(-win));
  const prior = trendSum(points.slice(-win * 2, -win));
  if (recent === 0 && prior === 0) return null;
  if (prior === 0) return { pctChange: 100, dir: "up" };
  const pctChange = Math.round(((recent - prior) / prior) * 100);
  return { pctChange, dir: pctChange > 8 ? "up" : pctChange < -8 ? "down" : "flat" };
}

/* ── timeline filter (week/month/quarter/year snapshot) ──────────────────── */

type Granularity = "week" | "month" | "quarter" | "year";

/** The current period's key string for a given granularity — what the filter
 *  starts on the first time a granularity is picked. */
function defaultPeriodKey(g: Granularity, now: Date = new Date()): string {
  switch (g) {
    case "week": return currentWeek(now);
    case "month": return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    case "quarter": return currentQuarter(now);
    case "year": return String(now.getUTCFullYear());
  }
}
function granularityOf(key: string): Granularity {
  if (/^\d{4}-W\d{1,2}$/i.test(key)) return "week";
  if (/^\d{4}-Q[1-4]$/i.test(key)) return "quarter";
  if (/^\d{4}-\d{2}$/.test(key)) return "month";
  return "year";
}

/* ── first-time-viewer helpers ────────────────────────────────────────────── */

/** One-line "how to read this" caption shown under a section header. */
function SectionHint({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 font-body text-[12px] leading-relaxed text-fg-subtle">{children}</p>;
}

/** A data-driven insight callout — the dynamic CSM feedback for a section.
 *  `dir` tints it and picks a trend icon so the read is instant. */
function Insight({ dir = "neutral", children }: { dir?: "up" | "down" | "flat" | "neutral"; children: ReactNode }) {
  const color =
    dir === "up" ? "var(--color-aurora)" : dir === "down" ? "var(--color-nova)" : dir === "flat" ? "var(--color-stellar)" : "var(--color-sirius)";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : dir === "flat" ? Activity : Sparkles;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border-l-2 bg-bg-muted/40 py-2 pl-3 pr-3" style={{ borderColor: color }}>
      <Icon size={14} className="mt-0.5 shrink-0" style={{ color }} />
      <p className="font-body text-[12px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

/** Hoverable ⓘ that reveals a short definition — for composite/derived metrics
 *  whose meaning isn't obvious from the label alone. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative ml-1 inline-flex align-middle">
      <Info size={12} className="cursor-help text-fg-subtle" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left font-body text-[11.5px] font-normal normal-case leading-snug tracking-normal text-fg-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** Collapsible orientation panel — explains the whole dashboard + the score
 *  model in plain language. Open by default so a first-time viewer sees it,
 *  collapsible so regulars can tuck it away. */
function HowToRead({ environmentName }: { environmentName: string | null }) {
  const TIERS: { label: string; range: string; color: UsageTier }[] = [
    { label: "Thriving", range: "75–100", color: "thriving" },
    { label: "Growing", range: "50–74", color: "growing" },
    { label: "At risk", range: "25–49", color: "at_risk" },
    { label: "Dormant", range: "0–24", color: "dormant" },
  ];
  return (
    <details open className="group rounded-2xl border border-border bg-bg-muted/30 px-5 py-3.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-body text-[13px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
        <Info size={15} className="text-sirius" />
        How to read this dashboard
        <ChevronDown size={15} className="ml-auto text-fg-subtle transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3 font-body text-[12.5px] leading-relaxed text-fg-muted">
        <p>
          This is a live read of how actively <span className="font-semibold text-fg">{environmentName ?? "this account"}</span> uses
          the Lumofy platform — pulled straight from product data, not entered by hand. Read it top to bottom: the verdict first, then the
          detail behind it.
        </p>
        <div>
          <p className="mb-1.5 font-semibold text-fg">The Adoption Score (0–100) blends three signals:</p>
          <ul className="flex flex-col gap-1 pl-0.5">
            <li>· <span className="font-semibold text-fg">Activation (45%)</span> — share of paid seats that logged in during the last 30 days. The core question: are the people they paid for actually showing up?</li>
            <li>· <span className="font-semibold text-fg">Module adoption (35%)</span> — of the modules this account <em>bought</em> (Develop / Perform / Engage), how many are actually being used. Owning three but using one drags this down; using everything they bought maxes it out.</li>
            <li>· <span className="font-semibold text-fg">Momentum (20%)</span> — did people log in <em>this week</em>, not just this month? Catches accounts that are quietly going cold.</li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="font-semibold text-fg">Tiers:</span>
          {TIERS.map((t) => (
            <span key={t.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: TIER_COLOR[t.color] }} />
              <span className="font-semibold text-fg">{t.label}</span>
              <span className="text-fg-subtle">{t.range}</span>
            </span>
          ))}
        </div>
        <p className="text-fg-subtle">
          <span className="font-semibold text-fg-muted">How to use it with your team:</span> lead with the score and the one-line
          verdict, then explain <em>why</em> from the three signals, then turn it into one action — e.g. high seat utilization but low
          activation means the licenses are handed out but people aren't logging in, so the play is enablement, not more seats.
        </p>
      </div>
    </details>
  );
}

export function UsageTab({ clientId }: { clientId: string }) {
  const [state, setState] = useState<{ phase: "loading" | "done"; data?: UsageResult }>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  // Whether the fetch triggered by the current reloadKey should bypass every
  // cache (Refresh / Retry) or read normally (first mount).
  const forceNextRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = forceNextRef.current;
    forceNextRef.current = false;
    setState({ phase: "loading" });
    loadClientUsageAction(clientId, { forceRefresh })
      .then((data) => !cancelled && setState({ phase: "done", data }))
      .catch((e) => !cancelled && setState({ phase: "done", data: { status: "error", message: String(e) } }));
    return () => {
      cancelled = true;
    };
  }, [clientId, reloadKey]);

  const reload = (force: boolean) => {
    forceNextRef.current = force;
    setReloadKey((k) => k + 1);
  };

  // null = "Current" (the always-on cards above, unchanged). Any other value
  // is a periodBounds()-compatible key ("YYYY-Www"/"YYYY-MM"/"YYYY-Qn"/"YYYY").
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [periodState, setPeriodState] = useState<{ phase: "loading" | "done"; data?: UsagePeriodResult }>({ phase: "loading" });

  // The period score's activation denominator is the CURRENT seat count (no
  // history to reconstruct it from) — read off the already-fetched "Current"
  // snapshot so the period fetch doesn't need a second Metabase round trip.
  const currentSnap = state.phase === "done" && state.data?.status === "ok" ? state.data : null;
  const seatBase = currentSnap ? (currentSnap.metrics.seats > 0 ? currentSnap.metrics.seats : currentSnap.metrics.total_users) : null;

  useEffect(() => {
    if (!periodKey || seatBase === null) return;
    let cancelled = false;
    const { start, end, label } = periodBounds(periodKey);
    setPeriodState({ phase: "loading" });
    loadClientUsagePeriodAction(clientId, { start, end, label, seatBase })
      .then((data) => !cancelled && setPeriodState({ phase: "done", data }))
      .catch((e) => !cancelled && setPeriodState({ phase: "done", data: { status: "error", message: String(e) } }));
    return () => {
      cancelled = true;
    };
  }, [clientId, periodKey, seatBase]);

  if (state.phase === "loading") return <UsageSkeleton />;
  const data = state.data!;
  if (data.status !== "ok") return <UsageUnavailableCard result={data} onRetry={() => reload(true)} />;

  return (
    <UsageDashboard
      snap={data}
      onRefresh={() => reload(true)}
      periodKey={periodKey}
      onPeriodChange={setPeriodKey}
      periodState={periodKey ? periodState : null}
    />
  );
}

/* ── states ─────────────────────────────────────────────────────────────── */

function UsageSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center gap-2 text-fg-subtle">
          <Loader2 size={15} className="animate-spin" />
          <span className="font-body text-[13px]">Loading product usage from Metabase…</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-bg-muted" />
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsageUnavailableCard({ result, onRetry }: { result: Exclude<UsageResult, UsageSnapshot>; onRetry: () => void }) {
  const map = {
    unlinked: { icon: Link2Off, title: "Not linked to a platform environment" },
    not_configured: { icon: BarChart3, title: "Metabase isn't connected yet" },
    error: { icon: TriangleAlert, title: "Couldn't load usage" },
  } as const;
  const { icon: Icon, title } = map[result.status];
  return (
    <Card>
      <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-bg-muted text-fg-subtle">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <p className="font-body text-sm font-semibold text-fg">{title}</p>
        <p className="caption max-w-md leading-relaxed">{result.message}</p>
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    </Card>
  );
}

/* ── the dashboard ──────────────────────────────────────────────────────── */

function UsageDashboard({
  snap,
  onRefresh,
  periodKey,
  onPeriodChange,
  periodState,
}: {
  snap: UsageSnapshot;
  onRefresh: () => void;
  periodKey: string | null;
  onPeriodChange: (key: string | null) => void;
  periodState: { phase: "loading" | "done"; data?: UsagePeriodResult } | null;
}) {
  const m = snap.metrics;
  const lb = snap.learning;
  const months = last12Months();
  // Current-state only — seats have no history to reconstruct, so this stays
  // "as of today" even inside period mode (see HealthBanner's activation note).
  const seatBase = m.seats > 0 ? m.seats : m.total_users;
  const utilization = pct(m.used_licenses > 0 ? m.used_licenses : m.active_users, seatBase);
  const stickiness = pct(m.wau, m.mau);
  const activePoints = fill(snap.trends, "active_users", months);
  const activeDelta = trendDelta(activePoints);

  const periodLoading = periodKey !== null && periodState?.phase === "loading";
  const periodResult = periodKey !== null && periodState?.phase === "done" ? periodState.data : undefined;
  const period = periodResult?.status === "ok" ? periodResult : null;
  const periodErrorMessage = periodResult && periodResult.status !== "ok" ? periodResult.message : null;

  const filterBar = (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardEyebrow>Timeline</CardEyebrow>
          <SectionHint>See a snapshot of usage bounded to one week, month, quarter, or year — every section below recomputes for it, not just the totals.</SectionHint>
        </div>
        <UsageTimelineFilter periodKey={periodKey} onChange={onPeriodChange} />
      </div>
    </Card>
  );

  if (periodKey && periodLoading) {
    return (
      <div className="flex flex-col gap-5">
        <HowToRead environmentName={snap.environmentName} />
        {filterBar}
        <Card>
          <div className="flex items-center gap-2 py-8 text-fg-subtle">
            <Loader2 size={15} className="animate-spin" />
            <span className="font-body text-[13px]">Loading this period from Metabase…</span>
          </div>
        </Card>
      </div>
    );
  }
  if (periodKey && periodErrorMessage) {
    return (
      <div className="flex flex-col gap-5">
        <HowToRead environmentName={snap.environmentName} />
        {filterBar}
        <Card><p className="py-8 text-center font-body text-[13px] text-fg-subtle">{periodErrorMessage}</p></Card>
      </div>
    );
  }

  const p = period?.metrics ?? null;
  const plb = period?.learning ?? null;
  const hasPeriodActivity = p ? Object.values(p).some((v) => v > 0) : false;
  const periodRangeLabel = period ? `${formatDate(period.start)} – ${formatDate(inclusiveEndDate(period.end))}` : "";

  // Score, module ownership, content mix, engagement funnel, and AI leverage
  // all read from the period when one's selected — only WAU/MAU/stickiness
  // (inherently "now"-relative concepts) and current-state-only fields
  // (seats, total users, org structure) stay on the always-current snapshot.
  const score = period ? period.score : snap.score;
  const ownedModuleKeys = (["develop", "perform", "engage"] as const).filter((k) => score.modules[k].owned);

  const buildContentRows = (learning: LearningBreakdown) => [
    { label: "Company-built", sub: "Courses your team built in the course builder", color: C.perf, items: learning.company.items, enrollments: learning.company.enrollments, completions: learning.company.completions },
    { label: "Lumofy library", sub: "Lumofy-curated catalogue (Docebo + shared course builder)", color: C.dev, items: learning.lumofy.items, enrollments: learning.lumofy.enrollments, completions: learning.lumofy.completions },
    ...learning.providers.map((pv) => ({ label: pv.provider, sub: "Global library · external marketplace", color: C.ai, items: pv.items, enrollments: pv.enrollments, completions: pv.completions })),
  ].filter((r) => r.enrollments > 0 || r.items > 0);
  const contentRows = buildContentRows(period ? plb! : lb);
  const contentTotals = period
    ? { items: p!.learning_items_count, enrollments: p!.learning_enrollments, completions: p!.learning_completions }
    : { items: m.learning_items_count, enrollments: m.learning_enrollments, completions: m.learning_completions };

  const engagementGroups = period
    ? [
        { label: "Company", values: [plb!.company.enrollments, plb!.company.completions] as [number, number] },
        { label: "Lumofy", values: [plb!.lumofy.enrollments, plb!.lumofy.completions] as [number, number] },
        { label: "Global lib.", values: [plb!.global.enrollments, plb!.global.completions] as [number, number] },
        { label: "Co. paths", values: [p!.pathway_company_enrollments, p!.pathway_company_completions] as [number, number] },
        { label: "Lumofy paths", values: [p!.pathway_lumofy_enrollments, p!.pathway_lumofy_completions] as [number, number] },
        { label: "Quizzes", values: [p!.quiz_enrollments, p!.quiz_completions] as [number, number] },
        { label: "Talent assess.", values: [p!.talent_assessment_enrollments, p!.talent_assessment_completed] as [number, number] },
        { label: "AI assess.", values: [p!.ai_assessment_enrollments, p!.ai_assessment_completed] as [number, number] },
      ]
    : [
        { label: "Company", values: [lb.company.enrollments, lb.company.completions] as [number, number] },
        { label: "Lumofy", values: [lb.lumofy.enrollments, lb.lumofy.completions] as [number, number] },
        { label: "Global lib.", values: [lb.global.enrollments, lb.global.completions] as [number, number] },
        { label: "Co. paths", values: [m.pathway_company_enrollments, m.pathway_company_completions] as [number, number] },
        { label: "Lumofy paths", values: [m.pathway_lumofy_enrollments, m.pathway_lumofy_completions] as [number, number] },
        { label: "Quizzes", values: [m.quiz_enrollments, m.quiz_completions] as [number, number] },
        { label: "Talent assess.", values: [m.talent_assessment_enrollments, m.talent_assessment_completed] as [number, number] },
        { label: "AI assess.", values: [m.ai_assessment_enrollments, m.ai_assessment_completed] as [number, number] },
      ];
  const engagementHasAny = engagementGroups.some((g) => g.values[0] > 0 || g.values[1] > 0);

  const aiLeverage = period
    ? { total: p!.competencies_created, aiGenerated: p!.competencies_ai_generated, extraLabel: "AI generation runs logged" }
    : { total: m.competencies_total, aiGenerated: m.competencies_ai_generated, extraLabel: `${formatNumber(m.ai_generation_runs)} AI generation runs logged` };

  const developRows: ModuleRow[] = period
    ? [
        ["Courses (learning)", p!.learning_enrollments, p!.learning_completions],
        ["Pathways", p!.pathway_enrollments, p!.pathway_completions],
        ["Quizzes", p!.quiz_enrollments, p!.quiz_completions],
        ["Talent assessments", p!.talent_assessment_enrollments, p!.talent_assessment_completed],
        ["AI assessments", p!.ai_assessment_enrollments, p!.ai_assessment_completed],
      ]
    : [
        ["Courses (learning)", m.learning_enrollments, m.learning_completions],
        ["Pathways", m.pathway_enrollments, m.pathway_completions],
        ["Quizzes", m.quiz_enrollments, m.quiz_completions],
        ["Talent assessments", m.talent_assessment_enrollments, m.talent_assessment_completed],
        ["AI assessments", m.ai_assessment_enrollments, m.ai_assessment_completed],
      ];
  const developExtras: [string, number][] = period
    ? [["Distinct courses used", p!.learning_items_count], ["Distinct pathways used", p!.pathways_count], ["Live sessions", p!.sessions_created], ["Competencies touched", p!.competencies_created]]
    : [["Distinct courses used", m.learning_items_count], ["Distinct pathways used", m.pathways_count], ["Live sessions", m.sessions_created], ["Competencies built", m.competencies_total]];
  const performRows: ModuleRow[] = period
    ? [["PM cycles", p!.pm_cycles_configured, p!.pm_cycles_completed, "completed"]]
    : [["PM cycles", m.pm_cycles_configured, m.pm_cycles_completed, "completed"]];
  const performExtras: [string, number][] = period
    ? [["Competencies", p!.competencies_created], ["AI-generated", p!.competencies_ai_generated]]
    : [["Competencies", m.competencies_total], ["AI-generated", m.competencies_ai_generated]];
  // Period mode only has response counts (no schema-verified date on the
  // cycle-to-user junction table), not the cycle+response pair current mode
  // shows — ModuleRow's secondary is optional for exactly this case.
  const engageRows: ModuleRow[] = period
    ? [["eNPS responses", p!.enps_responses], ["Custom survey responses", p!.survey_responses]]
    : [["eNPS surveys", m.enps_cycles, m.enps_responses, "responses"], ["Custom surveys", m.survey_cycles, m.survey_responses, "responses"]];

  // ── data-driven insights (dynamic, not static copy) ────────────────────
  const mauPctSeats = pct(m.mau, seatBase);
  const activationInsight: { dir: "up" | "down" | "flat" | "neutral"; text: ReactNode } = (() => {
    if (m.mau === 0) {
      return { dir: "down", text: `No logins in the last 30 days across ${formatNumber(m.total_users)} provisioned users — this account is dormant. Priority: get someone back in.` };
    }
    const gap = utilization - mauPctSeats;
    if (gap >= 30) {
      return {
        dir: "flat",
        text: <>Licenses are assigned but under-used: <span className="font-semibold text-fg">{utilization}%</span> of seats are handed out, yet only <span className="font-semibold text-fg">{mauPctSeats}%</span> ({formatNumber(m.mau)} people) logged in this month — a <span className="font-semibold text-fg">{gap}-point</span> gap. The play is enablement to get assigned users active, not more seats.</>,
      };
    }
    if (stickiness >= 30) {
      return { dir: "up", text: <>Strong habit: <span className="font-semibold text-fg">{stickiness}%</span> of monthly users came back this week — people rely on the platform, not just visit occasionally.</> };
    }
    if (stickiness > 0 && stickiness < 15) {
      return { dir: "flat", text: <>Low stickiness (<span className="font-semibold text-fg">{stickiness}%</span>): of {formatNumber(m.mau)} monthly users, only {formatNumber(m.wau)} returned this week. They log in about monthly — a nudge/cadence campaign could build a weekly habit.</> };
    }
    return { dir: "up", text: <><span className="font-semibold text-fg">{formatNumber(m.mau)}</span> of {formatNumber(seatBase)} seats active this month (<span className="font-semibold text-fg">{mauPctSeats}%</span>), {formatNumber(m.wau)} this week — healthy activation with room to grow toward full seat coverage.</> };
  })();

  const periodActiveDays = period ? period.activeUsersTrend.filter((d) => d.value > 0).length : 0;
  const periodPeakDay = period ? Math.max(0, ...period.activeUsersTrend.map((d) => d.value)) : 0;
  const periodActivationPct = period ? pct(p!.active_users, seatBase) : 0;

  return (
    <div className="flex flex-col gap-5">
      <HowToRead environmentName={snap.environmentName} />

      {filterBar}

      <HealthBanner score={score} environmentName={snap.environmentName} periodLabel={period?.label ?? null} onRefresh={onRefresh} />

      {period && !hasPeriodActivity ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-bg-muted text-fg-subtle">
              <Activity size={20} strokeWidth={1.75} />
            </span>
            <p className="font-body text-sm font-semibold text-fg">No data for this period</p>
            <p className="caption max-w-md leading-relaxed">No usage was recorded between {periodRangeLabel}. Try a different period, or switch back to Current.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Activation strip */}
          {period ? (
            <Card>
              <CardEyebrow>Activation · {period.label}</CardEyebrow>
              <SectionHint>
                <span className="font-semibold text-fg-muted">Active users</span> = distinct people who logged in during {period.label} ({periodRangeLabel}), out of the account&rsquo;s current seats.
              </SectionHint>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
                <Kpi label="Active users" value={formatNumber(p!.active_users)} sub={`${periodActivationPct}% of seats`} spark={period.activeUsersTrend.map((d) => d.value)} tip="Distinct users who logged in during this period, out of the account's current seats." />
                <Kpi label="Days with activity" value={formatNumber(periodActiveDays)} sub={`of ${formatNumber(period.activeUsersTrend.length)} days`} tip="How many days in this period had at least one login." />
                <Kpi label="Peak day" value={formatNumber(periodPeakDay)} sub="highest single day" tip="The most active single day within this period." />
                <Kpi label="Total users" value={formatNumber(m.total_users)} sub="current roster" tip="All user accounts provisioned on the platform today — a current fact, not scoped to this period." />
                <div className="flex flex-col items-center justify-center">
                  <Gauge value={periodActivationPct} label="Seat coverage" color={periodActivationPct > 100 ? "var(--color-nova)" : "var(--color-sirius)"} />
                  <span className="font-body text-[11px] text-fg-subtle">{formatNumber(p!.active_users)} / {formatNumber(seatBase)} seats</span>
                </div>
              </div>
              <Insight dir={p!.active_users > 0 ? "up" : "down"}>
                <span className="font-semibold text-fg">{formatNumber(p!.active_users)}</span> of {formatNumber(seatBase)} seats ({periodActivationPct}%) were active during {period.label}, across {formatNumber(periodActiveDays)} of {formatNumber(period.activeUsersTrend.length)} days.
              </Insight>
            </Card>
          ) : (
            <Card>
              <CardEyebrow>Activation · who&rsquo;s actually using it</CardEyebrow>
              <SectionHint>
                <span className="font-semibold text-fg-muted">WAU</span> = distinct people who logged in the last <span className="font-semibold text-fg-muted">7 days</span>.{" "}
                <span className="font-semibold text-fg-muted">MAU</span> = distinct people who logged in the last <span className="font-semibold text-fg-muted">30 days</span>.{" "}
                <span className="font-semibold text-fg-muted">Stickiness = WAU ÷ MAU</span> — of this month&rsquo;s users, how many came back this week (a habit vs a one-off visit).
              </SectionHint>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
                <Kpi label="Weekly active (WAU)" value={formatNumber(m.wau)} sub={`${pct(m.wau, seatBase)}% of seats`} spark={fill(snap.trends, "active_users", months).map((pt) => pt.value)} tip="Distinct users who logged in during the last 7 days, out of the account's seats." />
                <Kpi label="Monthly active (MAU)" value={formatNumber(m.mau)} sub={`${pct(m.mau, seatBase)}% of seats`} spark={fill(snap.trends, "active_users", months).map((pt) => pt.value)} tip="Distinct users who logged in during the last 30 days, out of the account's seats." />
                <Kpi label="Total users" value={formatNumber(m.total_users)} sub={`${formatNumber(m.active_users)} active`} tip="All user accounts provisioned on the platform, however long ago they were added." />
                <Kpi label="Stickiness" value={`${stickiness}%`} sub={`${formatNumber(m.wau)} WAU ÷ ${formatNumber(m.mau)} MAU`} tip="WAU ÷ MAU. High (>30%) = a weekly habit. Low (<15%) = people log in about once a month and leave." />
                <div className="flex flex-col items-center justify-center">
                  <Gauge value={utilization} label="Seat utilization" color={utilization > 100 ? "var(--color-nova)" : "var(--color-sirius)"} />
                  <span className="font-body text-[11px] text-fg-subtle">{formatNumber(m.used_licenses || m.active_users)} / {formatNumber(m.seats)} seats</span>
                </div>
              </div>
              <Insight dir={activationInsight.dir}>{activationInsight.text}</Insight>
            </Card>
          )}

          {/* Active users trend */}
          {period ? (
            <Card>
              <div className="mb-1 flex items-center justify-between">
                <CardEyebrow>Active users · {period.label}</CardEyebrow>
                <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-subtle"><Activity size={13} /> daily logins</span>
              </div>
              <SectionHint>Distinct users logging in each day within {period.label} ({periodRangeLabel}).</SectionHint>
              <div className="mt-3 overflow-x-auto">
                <Sparkline data={period.activeUsersTrend.map((d) => d.value)} width={680} height={140} />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="mb-1 flex items-center justify-between">
                <CardEyebrow>Active users · last 12 months</CardEyebrow>
                <span className="flex items-center gap-1.5 font-body text-[11.5px] text-fg-subtle"><Activity size={13} /> monthly logins</span>
              </div>
              <SectionHint>Distinct users logging in each month over the past year. The direction matters more than any single month — hover any point for the exact count.</SectionHint>
              <div className="mt-3">
                <LineChart months={months} series={[{ label: "Monthly active users", color: C.dev, points: activePoints }]} />
              </div>
              {activeDelta && (
                <Insight dir={activeDelta.dir}>
                  {activeDelta.dir === "up" && <>Logins are climbing — the last 3 months average <span className="font-semibold text-fg">{activeDelta.pctChange}%</span> above the prior 3. Momentum is building.</>}
                  {activeDelta.dir === "down" && <>Logins are slipping — down <span className="font-semibold text-fg">{Math.abs(activeDelta.pctChange)}%</span> vs the prior quarter. Worth a proactive check-in before it compounds.</>}
                  {activeDelta.dir === "flat" && <>Logins are holding steady over the last quarter (<span className="font-semibold text-fg">{activeDelta.pctChange >= 0 ? "+" : ""}{activeDelta.pctChange}%</span>) — stable, but no growth to lean on yet.</>}
                </Insight>
              )}
            </Card>
          )}

          {/* Modules — only the ones this account has in its plan (Module property) */}
          <div className="flex flex-col gap-3">
            <div>
              <CardEyebrow>Modules in plan{period && ` · ${period.label}`}</CardEyebrow>
              <SectionHint>
                Only the modules this account actually has (from its <span className="font-semibold text-fg-muted">Module</span> field on the deal).{" "}
                <span className="font-semibold text-fg-muted">Active</span> = {period ? "used during this period" : "real usage"}; <span className="font-semibold text-fg-muted">Owned · not used</span> = they have it but haven&rsquo;t started{period ? " in this window" : ""} —
                the clearest enablement target. The Competency framework is shared, so it counts under whichever of Develop/Perform they have.
              </SectionHint>
            </div>
            {ownedModuleKeys.length === 0 ? (
              <Card><p className="py-4 text-center font-body text-[13px] text-fg-subtle">No modules set for this account — add them on the deal&rsquo;s <span className="font-semibold text-fg-muted">Module</span> field to track adoption.</p></Card>
            ) : (
              <div className="flex flex-col gap-5">
                {score.modules.develop.owned && (
                  <ModuleCard
                    icon={GraduationCap}
                    title="Develop"
                    status={moduleStatus(score.modules.develop)}
                    color={C.dev}
                    wide
                    rowsCaption="Each row: people enrolled · of those, how many finished."
                    rows={developRows}
                    extras={developExtras}
                  />
                )}
                {(score.modules.perform.owned || score.modules.engage.owned) && (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {score.modules.perform.owned && (
                      <ModuleCard icon={BarChart3} title="Perform" status={moduleStatus(score.modules.perform)} color={C.perf} rows={performRows} extras={performExtras} />
                    )}
                    {score.modules.engage.owned && (
                      <ModuleCard icon={MessagesSquare} title="Engage" status={moduleStatus(score.modules.engage)} color={C.talent} showBars={false} rows={engageRows} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content by source — one clear table across all 3 content categories */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card>
              <CardEyebrow>Content mix{period && ` · ${period.label}`}</CardEyebrow>
              <SectionHint>How the {formatNumber(contentTotals.enrollments)} course enrollments split across your three content sources.</SectionHint>
              <div className="mt-4">
                {contentTotals.enrollments > 0 ? (
                  <Donut
                    size={132}
                    centerLabel={formatNumber(contentTotals.enrollments)}
                    centerSub="enrollments"
                    segments={[
                      { label: "Company-built", value: period ? plb!.company.enrollments : lb.company.enrollments, color: C.perf },
                      { label: "Lumofy library", value: period ? plb!.lumofy.enrollments : lb.lumofy.enrollments, color: C.dev },
                      { label: "Global library", value: period ? plb!.global.enrollments : lb.global.enrollments, color: C.ai },
                    ]}
                  />
                ) : (
                  <p className="py-8 text-center font-body text-[13px] text-fg-subtle">{period ? "No data for this period." : "No enrollments yet."}</p>
                )}
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardEyebrow>Content by source{period && ` · ${period.label}`}</CardEyebrow>
              <SectionHint>
                <span className="font-semibold text-fg-muted">Courses</span> = how many distinct titles they&rsquo;ve touched ·{" "}
                <span className="font-semibold text-fg-muted">Enrolled</span> = total sign-ups (one learner can take many courses) ·{" "}
                <span className="font-semibold text-fg-muted">Completed</span> = of those sign-ups, how many finished.
              </SectionHint>
              {contentRows.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Source</th>
                        <th className="pb-2 pr-4 text-right font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Courses</th>
                        <th className="pb-2 pr-4 text-right font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Enrolled</th>
                        <th className="pb-2 pr-4 text-right font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Completed</th>
                        <th className="pb-2 text-right font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Completion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentRows.map((r) => (
                        <tr key={r.label} className="border-b border-border-subtle last:border-0">
                          <td className="py-2 pr-4 font-body text-[13px]">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                              <span className="font-semibold text-fg">{r.label}</span>
                            </span>
                            <span className="mt-0.5 block pl-4 font-body text-[11px] text-fg-subtle">{r.sub}</span>
                          </td>
                          <td className="tabular py-2 pr-4 text-right font-body text-[13px] text-fg">{formatNumber(r.items)}</td>
                          <td className="tabular py-2 pr-4 text-right font-body text-[13px] text-fg">{formatNumber(r.enrollments)}</td>
                          <td className="tabular py-2 pr-4 text-right font-body text-[13px] text-fg-muted">{formatNumber(r.completions)}</td>
                          <td className="tabular py-2 text-right font-body text-[13px] text-fg-muted">{pct(r.completions, r.enrollments)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td className="py-2 pr-4 font-body text-[13px] font-semibold text-fg">All sources</td>
                        <td className="tabular py-2 pr-4 text-right font-body text-[13px] font-semibold text-fg">{formatNumber(contentTotals.items)}</td>
                        <td className="tabular py-2 pr-4 text-right font-body text-[13px] font-semibold text-fg">{formatNumber(contentTotals.enrollments)}</td>
                        <td className="tabular py-2 pr-4 text-right font-body text-[13px] font-semibold text-fg">{formatNumber(contentTotals.completions)}</td>
                        <td className="tabular py-2 text-right font-body text-[13px] font-semibold text-fg">{pct(contentTotals.completions, contentTotals.enrollments)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center font-body text-[13px] text-fg-subtle">{period ? "No data for this period." : "No enrollments yet."}</p>
              )}
            </Card>
          </div>

          {/* Engagement funnel */}
          {engagementHasAny && (
            <Card>
              <CardEyebrow>Engagement funnel · enrolled → completed{period && ` · ${period.label}`}</CardEyebrow>
              <SectionHint>Each activity shows how many people <span className="font-semibold text-fg-muted">enrolled</span> vs actually <span className="font-semibold text-fg-muted">completed</span> it. The taller the gap between the two bars, the bigger the drop-off — a signal to nudge learners or simplify the content.</SectionHint>
              <div className="mt-3">
                <GroupedBars series={[{ label: "Enrolled", color: C.dev }, { label: "Completed", color: C.perf }]} groups={engagementGroups} />
              </div>
            </Card>
          )}

          {/* AI leverage */}
          <Card>
            <CardEyebrow>AI leverage · competencies{period && ` · ${period.label}`}</CardEyebrow>
            <SectionHint>Of the competencies {period ? "touched in this period" : "in their framework"}, the share built with Lumofy&rsquo;s AI vs entered by hand. A high AI share means they leaned on the platform to stand the framework up fast.</SectionHint>
            <div className="mt-4">
              {aiLeverage.total > 0 ? (
                <Donut
                  size={132}
                  centerLabel={`${pct(aiLeverage.aiGenerated, aiLeverage.total)}%`}
                  centerSub="AI-built"
                  segments={[
                    { label: "AI-generated", value: aiLeverage.aiGenerated, color: C.ai },
                    { label: "Manual", value: Math.max(0, aiLeverage.total - aiLeverage.aiGenerated), color: C.muted },
                  ]}
                />
              ) : (
                <p className="py-8 text-center font-body text-[13px] text-fg-subtle">{period ? "No data for this period." : "No competencies built yet."}</p>
              )}
            </div>
            <p className="caption mt-3 leading-relaxed">
              {formatNumber(aiLeverage.total)} competencies {period ? "touched" : "on the platform"}, {formatNumber(aiLeverage.aiGenerated)} generated by AI. {aiLeverage.extraLabel}.
            </p>
          </Card>
        </>
      )}

      {/* Setup checklist — lifetime onboarding milestones, not period-scoped */}
      <Card>
        <CardEyebrow>Setup checklist</CardEyebrow>
        <SectionHint>
          The onboarding milestones for this account&rsquo;s modules, in order — reflects the account&rsquo;s current state{period && ", not the selected period"}. A green check means that step has real data; grey means it&rsquo;s still pending.
        </SectionHint>
        <ul className="mt-3 flex flex-col gap-2.5">
          <Check ok={m.total_users > 0} label={`Users provisioned (${formatNumber(m.total_users)})`} />
          <Check ok={m.job_roles > 0 || m.departments > 0} label={`Org structure (${formatNumber(m.job_roles)} roles · ${formatNumber(m.departments)} departments)`} />
          <Check ok={m.mau > 0} label="Users logging in" />
          {(snap.score.modules.develop.owned || snap.score.modules.perform.owned) && (
            <Check ok={m.competencies_total > 0} label={`Competency framework (${formatNumber(m.competencies_total)})`} />
          )}
          {snap.score.modules.develop.owned && (
            <>
              <Check ok={m.learning_items_count > 0 || m.pathways_count > 0} label={`Content published${m.learning_items_count > 0 ? ` (${formatNumber(m.learning_items_count)} courses)` : ""}`} />
              <Check ok={m.learning_enrollments > 0 || m.pathway_enrollments > 0} label="Learners enrolled" />
              <Check ok={m.talent_assessment_enrollments > 0 || m.ai_assessment_enrollments > 0} label="Assessments running" />
            </>
          )}
          {snap.score.modules.perform.owned && (
            <Check ok={m.pm_cycles_configured > 0} label="Performance cycles configured" />
          )}
          {snap.score.modules.engage.owned && (
            <Check ok={m.enps_cycles > 0 || m.survey_cycles > 0} label="Surveys running" />
          )}
        </ul>
      </Card>

      {/* Detail table */}
      <Card>
        <CardEyebrow>All metrics{period && ` · ${period.label}`}</CardEyebrow>
        <SectionHint>Every raw number behind the charts above, grouped by module — the reference for when someone asks &ldquo;where did that figure come from?&rdquo;</SectionHint>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Metric</th>
                <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Module</th>
                <th className="pb-2 text-right font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Value</th>
              </tr>
            </thead>
            <tbody>
              {(period ? periodDetailRows(p!, plb!) : detailRows(m, lb)).map((r) => (
                <tr key={r.label} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-4 font-body text-[13px] text-fg">{r.label}</td>
                  <td className="py-2 pr-4 font-body text-[12px] text-fg-subtle">{r.module}</td>
                  <td className="tabular py-2 text-right font-body text-[13px] font-semibold text-fg">{formatNumber(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="px-1 font-body text-[11px] text-fg-subtle">
        Source: Metabase · {snap.region.toUpperCase()} · environment {snap.environmentName ?? snap.environmentId.slice(0, 8)} ·{" "}
        {period ? `period ${period.label} (${periodRangeLabel})` : `as of ${new Date(snap.fetchedAt).toLocaleString()}`}
      </p>
    </div>
  );
}

function UsageTimelineFilter({ periodKey, onChange }: { periodKey: string | null; onChange: (key: string | null) => void }) {
  const granularity = periodKey ? granularityOf(periodKey) : null;
  const label = periodKey ? periodBounds(periodKey).label : null;

  function selectGranularity(value: string) {
    if (value === "current") onChange(null);
    else onChange(defaultPeriodKey(value as Granularity));
  }
  function shift(delta: number) {
    if (periodKey) onChange(shiftPeriod(periodKey, delta));
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Timeline granularity"
        value={granularity ?? "current"}
        onChange={(e) => selectGranularity(e.target.value)}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-body text-[12.5px] font-medium text-fg outline-none transition-colors focus:border-sirius-200"
      >
        <option value="current">Current</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
      </select>
      {periodKey && (
        <span className="flex items-center gap-0.5 rounded-lg border border-border bg-surface pl-1 pr-1">
          <button onClick={() => shift(-1)} aria-label="Previous period" className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[84px] text-center font-body text-[12.5px] font-semibold text-fg">{label}</span>
          <button onClick={() => shift(1)} aria-label="Next period" className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
            <ChevronRight size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

/** end is exclusive (the day after the period) — shift back one day for a
 *  human-readable inclusive end date. */
function inclusiveEndDate(endExclusive: string): string {
  const d = new Date(`${endExclusive}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}


function HealthBanner({
  score: s,
  environmentName,
  periodLabel,
  onRefresh,
}: {
  score: AdoptionScore;
  environmentName: string | null;
  /** Non-null in period mode — swaps the part-bar tips to describe the
   *  period-rebased definitions instead of "now"/"the last 30 days". */
  periodLabel: string | null;
  onRefresh: () => void;
}) {
  const color = TIER_COLOR[s.tier];
  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Donut size={112} centerLabel={String(s.score)} centerSub="score" segments={[{ label: "score", value: s.score, color }, { label: "rest", value: 100 - s.score, color: "var(--color-border-subtle)" }]} />
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-body text-[12px] font-semibold" style={{ background: `${color}1f`, color }}>
              <Sparkles size={12} /> {TIER_LABEL[s.tier]}
            </span>
            <h3 className="mt-2 font-display text-[15px] font-bold text-fg">
              {environmentName ?? "Platform environment"}{periodLabel && <span className="font-body text-[12px] font-medium text-fg-subtle"> · {periodLabel}</span>}
            </h3>
            <p className="caption mt-0.5 max-w-lg leading-relaxed">{s.verdict}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2.5 sm:border-l sm:border-border-subtle sm:pl-6">
          <PartBar
            label="Activation"
            value={s.parts.activation}
            weight="45%"
            tip={periodLabel ? "Share of current seats that logged in during this period." : "Share of seats that logged in over the last 30 days. The biggest driver of the score."}
          />
          <PartBar label="Module adoption" value={s.parts.breadth} weight="35%" tip={`Of the modules this account bought (Develop / Perform / Engage), how many saw real use${periodLabel ? " during this period" : ""}.`} />
          <PartBar
            label="Momentum"
            value={s.parts.recency}
            weight="20%"
            tip={periodLabel ? "Did activity persist into this period's closing days (100), taper off earlier in the period (55), or never show up at all (0)." : "Is the account active right now — people logging in this week (100), only this month (55), or not at all (0)."}
          />
        </div>
        <button
          onClick={onRefresh}
          title="Refresh usage"
          className="shrink-0 self-start rounded-lg border border-border p-1.5 text-fg-subtle hover:border-sirius hover:text-sirius"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </Card>
  );
}

function PartBar({ label, value, weight, tip }: { label: string; value: number; weight?: string; tip?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-36 shrink-0 items-center font-body text-[12px] text-fg-muted">
        {label}
        {weight && <span className="ml-1 font-body text-[10px] text-fg-subtle">·{weight}</span>}
        {tip && <InfoTip text={tip} />}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
        <span className="block h-full rounded-full bg-sirius transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="tabular w-9 shrink-0 text-right font-body text-[12px] font-semibold text-fg">{value}%</span>
    </div>
  );
}

function Kpi({ label, value, sub, spark, tip }: { label: string; value: string; sub?: string; spark?: number[]; tip?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
        {tip && <InfoTip text={tip} />}
      </span>
      <span className="tabular font-display text-2xl font-bold leading-none text-fg">{value}</span>
      {sub && <span className="font-body text-[11.5px] text-fg-subtle">{sub}</span>}
      {spark && spark.some((v) => v > 0) && <Sparkline data={spark} width={96} height={22} className="mt-1" />}
    </div>
  );
}

type ModuleStatus = "active" | "unused" | "not_owned";
/** A module row: [label, primary count, secondary count, verb for the
 *  secondary]. Secondary is optional — a period-mode row that only has one
 *  meaningful number (e.g. survey responses, with no period-scoped cycle
 *  count to pair it with) omits it and renders just the primary value. */
type ModuleRow = [string, number, number?, string?];

const MODULE_BADGE: Record<ModuleStatus, { tone: "sirius" | "neutral"; label: string }> = {
  active: { tone: "sirius", label: "Active" },
  unused: { tone: "neutral", label: "Owned · not used" },
  not_owned: { tone: "neutral", label: "Not in plan" },
};

function ModuleCard({
  icon: Icon,
  title,
  status,
  color,
  rows,
  extras,
  rowVerb = "completed",
  rowsCaption,
  showBars = true,
  wide = false,
  className,
}: {
  icon: typeof GraduationCap;
  title: string;
  status: ModuleStatus;
  color: string;
  rows: ModuleRow[];
  extras?: [string, number][];
  rowVerb?: string;
  rowsCaption?: string;
  showBars?: boolean;
  wide?: boolean; // renders rows in 2 columns (for a full-width card)
  className?: string;
}) {
  const badge = MODULE_BADGE[status];
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-body text-sm font-semibold text-fg">
          <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${color}1f`, color }}>
            <Icon size={15} />
          </span>
          {title}
        </span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      {rowsCaption && <p className="mt-2 font-body text-[11px] text-fg-subtle">{rowsCaption}</p>}
      <div className={cn("mt-4 grid gap-x-8 gap-y-3", wide && "sm:grid-cols-2")}>
        {rows.map(([label, primary, secondary, verb]) => (
          <div key={label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-body text-[12.5px] text-fg-muted">{label}</span>
              <span className="tabular shrink-0 whitespace-nowrap font-body text-[13px] font-semibold text-fg">
                {formatNumber(primary)}
                {secondary !== undefined && <span className="font-normal text-fg-subtle"> · {formatNumber(secondary)} {verb ?? rowVerb}</span>}
              </span>
            </div>
            {showBars && secondary !== undefined && (
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-bg-muted">
                <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(secondary, primary)}%`, background: color }} />
              </span>
            )}
          </div>
        ))}
      </div>
      {extras && extras.length > 0 && (
        <div className={cn("mt-4 grid gap-x-8 gap-y-2 border-t border-border-subtle pt-3", wide ? "sm:grid-cols-4 grid-cols-2" : "grid-cols-2")}>
          {extras.map(([label, v]) => (
            <span key={label} className="flex items-baseline justify-between gap-2 font-body text-[12px]">
              <span className="truncate text-fg-subtle">{label}</span>
              <span className="tabular shrink-0 font-semibold text-fg">{formatNumber(v)}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 font-body text-[13px]">
      {ok ? <CheckCircle2 size={16} className="shrink-0 text-[color:var(--color-aurora)]" /> : <XCircle size={16} className="shrink-0 text-fg-subtle" />}
      <span className={cn(ok ? "text-fg" : "text-fg-subtle")}>{label}</span>
    </li>
  );
}

function detailRows(m: UsageSnapshotRow, lb: LearningBreakdown): { label: string; module: string; value: number }[] {
  return [
    { label: "Weekly active users", module: "Adoption", value: m.wau },
    { label: "Monthly active users", module: "Adoption", value: m.mau },
    { label: "Total users", module: "Adoption", value: m.total_users },
    { label: "Seats", module: "Adoption", value: m.seats },
    { label: "Job roles", module: "Adoption", value: m.job_roles },
    { label: "Departments", module: "Adoption", value: m.departments },
    { label: "Distinct courses used — all sources", module: "Develop", value: m.learning_items_count },
    { label: "— Company-built courses", module: "Develop", value: lb.company.items },
    { label: "— Lumofy library courses", module: "Develop", value: lb.lumofy.items },
    { label: "— Global library courses", module: "Develop", value: lb.global.items },
    { label: "Course enrollments (total)", module: "Develop", value: m.learning_enrollments },
    { label: "— Company-built", module: "Develop", value: lb.company.enrollments },
    { label: "— Lumofy library", module: "Develop", value: lb.lumofy.enrollments },
    { label: "— Global library", module: "Develop", value: lb.global.enrollments },
    ...lb.providers.map((p) => ({ label: `    · ${p.provider}`, module: "Develop", value: p.enrollments })),
    { label: "Course completions (total)", module: "Develop", value: m.learning_completions },
    { label: "— Company-built completed", module: "Develop", value: lb.company.completions },
    { label: "— Lumofy library completed", module: "Develop", value: lb.lumofy.completions },
    { label: "— Global library completed", module: "Develop", value: lb.global.completions },
    { label: "Pathway enrollments (total)", module: "Develop", value: m.pathway_enrollments },
    { label: "— Company-built pathways", module: "Develop", value: m.pathway_company_enrollments },
    { label: "— Lumofy-library pathways", module: "Develop", value: m.pathway_lumofy_enrollments },
    { label: "Pathway completions (total)", module: "Develop", value: m.pathway_completions },
    { label: "— Company-built completed", module: "Develop", value: m.pathway_company_completions },
    { label: "— Lumofy-library completed", module: "Develop", value: m.pathway_lumofy_completions },
    { label: "Pathways used (own + shared)", module: "Develop", value: m.pathways_count },
    { label: "Quizzes generated", module: "Develop", value: m.quizzes_generated },
    { label: "Quiz enrollments", module: "Develop", value: m.quiz_enrollments },
    { label: "Quiz completions", module: "Develop", value: m.quiz_completions },
    { label: "Live sessions created", module: "Develop", value: m.sessions_created },
    { label: "Talent assessment enrollments", module: "Develop", value: m.talent_assessment_enrollments },
    { label: "Talent assessment completed", module: "Develop", value: m.talent_assessment_completed },
    { label: "AI assessment enrollments", module: "Develop", value: m.ai_assessment_enrollments },
    { label: "AI assessment completed", module: "Develop", value: m.ai_assessment_completed },
    { label: "PM cycles configured", module: "Perform", value: m.pm_cycles_configured },
    { label: "PM cycles completed", module: "Perform", value: m.pm_cycles_completed },
    { label: "eNPS survey cycles", module: "Engage", value: m.enps_cycles },
    { label: "eNPS responses", module: "Engage", value: m.enps_responses },
    { label: "Custom survey cycles", module: "Engage", value: m.survey_cycles },
    { label: "Custom survey responses", module: "Engage", value: m.survey_responses },
    { label: "Competencies on platform", module: "Develop / Perform", value: m.competencies_total },
    { label: "AI-generated competencies", module: "Develop / Perform", value: m.competencies_ai_generated },
    { label: "AI generation runs", module: "Develop / Perform", value: m.ai_generation_runs },
  ];
}

/** Same shape as detailRows(), sourced from a period snapshot instead — omits
 *  rows with no period-scoped counterpart (seats/total users/org structure/
 *  cycle counts; see UsagePeriodMetrics's own doc comment for why). */
function periodDetailRows(p: UsagePeriodMetrics, lb: LearningBreakdown): { label: string; module: string; value: number }[] {
  return [
    { label: "Active users", module: "Adoption", value: p.active_users },
    { label: "Distinct courses used — all sources", module: "Develop", value: p.learning_items_count },
    { label: "— Company-built courses", module: "Develop", value: lb.company.items },
    { label: "— Lumofy library courses", module: "Develop", value: lb.lumofy.items },
    { label: "— Global library courses", module: "Develop", value: lb.global.items },
    { label: "Course enrollments (total)", module: "Develop", value: p.learning_enrollments },
    { label: "— Company-built", module: "Develop", value: lb.company.enrollments },
    { label: "— Lumofy library", module: "Develop", value: lb.lumofy.enrollments },
    { label: "— Global library", module: "Develop", value: lb.global.enrollments },
    ...lb.providers.map((pv) => ({ label: `    · ${pv.provider}`, module: "Develop", value: pv.enrollments })),
    { label: "Course completions (total)", module: "Develop", value: p.learning_completions },
    { label: "— Company-built completed", module: "Develop", value: lb.company.completions },
    { label: "— Lumofy library completed", module: "Develop", value: lb.lumofy.completions },
    { label: "— Global library completed", module: "Develop", value: lb.global.completions },
    { label: "Pathway enrollments (total)", module: "Develop", value: p.pathway_enrollments },
    { label: "— Company-built pathways", module: "Develop", value: p.pathway_company_enrollments },
    { label: "— Lumofy-library pathways", module: "Develop", value: p.pathway_lumofy_enrollments },
    { label: "Pathway completions (total)", module: "Develop", value: p.pathway_completions },
    { label: "— Company-built completed", module: "Develop", value: p.pathway_company_completions },
    { label: "— Lumofy-library completed", module: "Develop", value: p.pathway_lumofy_completions },
    { label: "Pathways used (own + shared)", module: "Develop", value: p.pathways_count },
    { label: "Quizzes created", module: "Develop", value: p.quizzes_generated },
    { label: "Quiz enrollments", module: "Develop", value: p.quiz_enrollments },
    { label: "Quiz completions", module: "Develop", value: p.quiz_completions },
    { label: "Live sessions created", module: "Develop", value: p.sessions_created },
    { label: "Talent assessment enrollments", module: "Develop", value: p.talent_assessment_enrollments },
    { label: "Talent assessment completed", module: "Develop", value: p.talent_assessment_completed },
    { label: "AI assessment enrollments", module: "Develop", value: p.ai_assessment_enrollments },
    { label: "AI assessment completed", module: "Develop", value: p.ai_assessment_completed },
    { label: "PM cycles configured", module: "Perform", value: p.pm_cycles_configured },
    { label: "PM cycles completed", module: "Perform", value: p.pm_cycles_completed },
    { label: "eNPS responses", module: "Engage", value: p.enps_responses },
    { label: "Custom survey responses", module: "Engage", value: p.survey_responses },
    { label: "Competencies touched", module: "Develop / Perform", value: p.competencies_created },
    { label: "AI-generated competencies", module: "Develop / Perform", value: p.competencies_ai_generated },
  ];
}
