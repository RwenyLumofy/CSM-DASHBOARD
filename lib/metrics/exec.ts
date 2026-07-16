/* =========================================================================
   Executive report — the filtered, period-aware portfolio rollup behind
   /reports.

   Everything here is derived from the ARR ledger + the client rows already in
   memory (lib/data.ts `loadSource` loads both once per request), so a filter
   change or a 6-period trend costs no extra queries.

   Two deliberate departures from the old /reports:

   1. FILTERS ARE APPLIED BEFORE THE MATH, not after. Retention is recomputed
      against the filtered book — "NRR for Zainab's enterprise accounts" is a
      real number, not the global NRR with rows hidden. Because computeRetention
      groups `arrEvents` by client itself, the events MUST be narrowed to the
      filtered ids too, or the ledger would drag in accounts the filter removed.

   2. CHURN IS PERIOD-SCOPED. The old page listed every churned account ever
      (`clients.filter(status === "churned")`) directly beneath a period-scoped
      revenue bridge — two contradictory answers to "how did we do this
      quarter?" on one screen. Churn now comes from `churn` events inside the
      period bounds, so the list and the bridge always agree.
   ========================================================================= */

import type { ArrEvent, Client, RetentionMetrics } from "@/lib/types";
import type { UsageMonthRow } from "@/lib/usage/types";
import {
  atRisk,
  concentration,
  lastCompleteMonth,
  movements,
  usageMovementByClient,
  type ConcentrationRow,
  type Movement,
  type RiskRow,
} from "@/lib/metrics/movement";
import { ALL_TIME, arrAsOf, currentQuarter, currentWeek, isRangeKey, periodBounds, periodMovement, rangeKey, shiftPeriod } from "@/lib/metrics/arr";
import { computeRetention } from "@/lib/metrics/retention";
import { buildPortfolioSummary } from "@/lib/metrics/portfolio";
import { buildHealthDrag, type HealthDrag } from "@/lib/metrics/health-drag";
import { buildChurnAnalysis, type ChurnAnalysis } from "@/lib/metrics/churn";
import type { ClientHealthConfig } from "@/lib/metrics/health-config";

/* ------------------------------------------------------------------ filters */

export interface ExecFilters {
  csm?: string; // csm.email (lowercased)
  segment?: string; // enterprise | mid_market | smb
  status?: string; // onboarding | active | renewal | churned
  country?: string;
  industry?: string;
  customerType?: string; // arr | otp
  health?: string; // healthy | watch | at_risk  (fixed 75/55 bands)
  tier?: string; // properties.tier — an admin-defined string
}

export const FILTER_KEYS = [
  "csm",
  "segment",
  "status",
  "country",
  "industry",
  "customerType",
  "health",
  "tier",
] as const satisfies readonly (keyof ExecFilters)[];

/** Health bands mirror buildPortfolioSummary's fixed 75/55 cutoffs on purpose:
 *  admin-renameable tier NAMES would make a saved board URL mean something
 *  different next quarter. Score bands don't move. */
export function healthBand(score: number): "healthy" | "watch" | "at_risk" {
  if (score >= 75) return "healthy";
  if (score >= 55) return "watch";
  return "at_risk";
}

const propStr = (c: Client, key: string): string | null => {
  const v = c.properties?.[key];
  return typeof v === "string" && v.trim() ? v : null;
};

export function applyFilters(clients: Client[], f: ExecFilters): Client[] {
  return clients.filter((c) => {
    if (f.csm && (c.csm?.email ?? "").toLowerCase() !== f.csm.toLowerCase()) return false;
    if (f.segment && c.segment !== f.segment) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.country && (c.country ?? "") !== f.country) return false;
    if (f.industry && (c.industry ?? "") !== f.industry) return false;
    if (f.customerType && c.customerType !== f.customerType) return false;
    // A churned account keeps whatever health score it died with — 74 of this
    // book's 76 churned accounts sit in the "at risk" band purely because they
    // are gone. Counting them would make "at risk" read 78 while the health
    // donut (which excludes churned, per buildPortfolioSummary) reads 4 for the
    // same filter. "Show me at-risk accounts" never means "show me dead ones",
    // so a health filter implies the live book. countHealthBands() below tallies
    // on the same rule, so the dropdown count always equals what you get.
    if (f.health) {
      if (c.status === "churned") return false;
      if (healthBand(c.health.score) !== f.health) return false;
    }
    if (f.tier && propStr(c, "tier") !== f.tier) return false;
    return true;
  });
}

export function hasAnyFilter(f: ExecFilters): boolean {
  return FILTER_KEYS.some((k) => Boolean(f[k]));
}

/** Parse + whitelist raw searchParams into a typed filter object. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): ExecFilters {
  const out: ExecFilters = {};
  for (const k of FILTER_KEYS) {
    const raw = sp[k];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v && v !== "all") out[k] = v;
  }
  return out;
}

/* ------------------------------------------------- filter option discovery */

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}
export interface FilterOptions {
  csm: FilterOption[];
  segment: FilterOption[];
  status: FilterOption[];
  country: FilterOption[];
  industry: FilterOption[];
  customerType: FilterOption[];
  health: FilterOption[];
  tier: FilterOption[];
}

const SEGMENT_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  mid_market: "Mid-market",
  smb: "SMB",
};
const STATUS_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  active: "Active",
  renewal: "Renewal",
  churned: "Churned",
};
const HEALTH_LABELS: Record<string, string> = {
  healthy: "Healthy (75+)",
  watch: "Watch (55–74)",
  at_risk: "At risk (<55)",
};
const TYPE_LABELS: Record<string, string> = { arr: "Recurring (ARR)", otp: "One-time (OTP)" };

function tally(
  clients: Client[],
  get: (c: Client) => string | null,
  labels?: Record<string, string>,
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const c of clients) {
    const v = get(c);
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labels?.[value] ?? value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Options are derived from the FULL book, never the filtered one — otherwise
 *  picking a CSM would erase every other CSM from the dropdown. */
export function buildFilterOptions(all: Client[]): FilterOptions {
  return {
    csm: tally(all, (c) => (c.csm?.email ? c.csm.email.toLowerCase() : null)).map((o) => ({
      ...o,
      label: all.find((c) => (c.csm?.email ?? "").toLowerCase() === o.value)?.csm?.name ?? o.value,
    })),
    segment: tally(all, (c) => c.segment, SEGMENT_LABELS),
    status: tally(all, (c) => c.status, STATUS_LABELS),
    country: tally(all, (c) => c.country),
    industry: tally(all, (c) => c.industry),
    customerType: tally(all, (c) => c.customerType, TYPE_LABELS),
    // Live book only — matches applyFilters' health rule above, so the count in
    // the dropdown is exactly what selecting it returns.
    health: tally(
      all.filter((c) => c.status !== "churned"),
      (c) => healthBand(c.health.score),
      HEALTH_LABELS,
    ),
    tier: tally(all, (c) => propStr(c, "tier")),
  };
}

/* ------------------------------------------------------------- comparison */

/** How the selected period is compared against another. */
export type CompareMode = "prev" | "yoy" | "none";

export const COMPARE_MODES: { value: CompareMode; label: string }[] = [
  { value: "prev", label: "Previous period" },
  { value: "yoy", label: "Same period last year" },
  { value: "none", label: "No comparison" },
];

export function parseCompare(raw: string | string[] | undefined): CompareMode {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "yoy" || v === "none" ? v : "prev";
}

/** The period a given mode compares against. `yoy` steps back a full year in
 *  the period's own granularity — 4 quarters, 12 months, 52 weeks — so it lands
 *  on the same slot a year earlier rather than a naive date subtraction. */
export function comparisonPeriod(period: string, mode: CompareMode): string | null {
  if (mode === "none") return null;
  // Nothing precedes all of history.
  if (period === ALL_TIME) return null;
  if (mode === "prev") return shiftPeriod(period, -1);
  const grain = periodGrain(period);
  // A rolling range can't "step back a year" in window-lengths — shifting a
  // 30-day window by 12 lands 360 days back, not a year. Shift its dates
  // instead so "last 30 days vs the same 30 days last year" means that.
  if (grain === "range") {
    const [s, e] = period.split("..");
    const backAYear = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
    return rangeKey(backAYear(s), backAYear(e));
  }
  const back = grain === "quarter" ? 4 : grain === "month" ? 12 : grain === "week" ? 52 : 1;
  return shiftPeriod(period, -back);
}

/* ------------------------------------------------------------------ report */

export interface TrendPoint {
  period: string;
  label: string;
  nrr: number;
  grr: number;
  startingArr: number;
  endingArr: number;
  expansion: number;
  contraction: number;
  churn: number;
  newBusiness: number;
}

export interface ChurnRow {
  client: Client;
  arrLost: number;
  date: string;
}

export interface ExecReport {
  period: string;
  periodLabel: string;
  bounds: { start: string; end: string };
  currency: string;
  retention: RetentionMetrics;
  /** The same math over the comparison period, or null when compare="none".
   *  Powers every KPI delta on the page. */
  previous: RetentionMetrics | null;
  /** Which period `previous` covers, and how it was chosen. */
  comparison: { mode: CompareMode; period: string | null; label: string | null };
  portfolio: ReturnType<typeof buildPortfolioSummary>;
  /** New business landed in-period. Deliberately kept OUT of NRR/GRR (it isn't
   *  retention) but surfaced on its own — a board always asks for it. */
  newBusiness: number;
  /** retained + new business = the book's real closing position. */
  closingArr: number;
  trend: TrendPoint[];
  /** The same-length trend window ending at the COMPARISON period, so the chart
   *  can lay one arc over the other (Stripe's "compared to previous period"
   *  ghost). Null when compare="none". Aligned by position, not by date — that
   *  alignment is what lets two stretches of time share one x-axis. */
  compareTrend: TrendPoint[] | null;
  /** The earliest period in `trend` with real retention movement; everything
   *  before it is a 100% no-data artefact. Null if the whole window is. */
  firstRealTrendPeriod: string | null;
  downgrades: { client: Client; delta: number }[];
  churned: ChurnRow[];
  healthSplit: { healthy: number; watch: number; atRisk: number };
  /** Every account that moved this period, ranked by ARR at stake. */
  movements: Movement[];
  /** Renewals ahead, scored by whether the customer actually uses the product. */
  atRisk: RiskRow[];
  /** Top accounts by ARR with their usage share alongside. */
  concentration: { rows: ConcentrationRow[]; topArrShare: number; topMauShare: number };
  /** The month the usage movement is measured over (last complete month). */
  usageMonth: string;
  /** Why the average health score is what it is — per-metric point cost. */
  healthDrag: HealthDrag;
  /** Who churns, when, how much. All-time, NOT period-scoped — see churn.ts. */
  churnAnalysis: ChurnAnalysis;
  filteredCount: number;
  totalCount: number;
}

export interface ExecReportInput {
  clients: Client[];
  arrEvents: ArrEvent[];
  period: string;
  filters: ExecFilters;
  trendLength?: number;
  compare?: CompareMode;
  usageHistory?: UsageMonthRow[];
  healthConfig: ClientHealthConfig;
}

export function buildExecReport({
  clients,
  arrEvents,
  period,
  filters,
  trendLength = 6,
  compare = "prev",
  usageHistory = [],
  healthConfig,
}: ExecReportInput): ExecReport {
  const scoped = applyFilters(clients, filters);
  const ids = new Set(scoped.map((c) => c.id));
  // Narrow the ledger to the filtered book — see the header note: computeRetention
  // re-groups events by client itself and would otherwise count accounts the
  // filter just removed.
  const events = scoped.length === clients.length ? arrEvents : arrEvents.filter((e) => ids.has(e.clientId));

  const bounds = periodBounds(period);
  const retention = computeRetention(scoped, events, period);
  const cmpPeriod = comparisonPeriod(period, compare);
  const previous = cmpPeriod ? computeRetention(scoped, events, cmpPeriod) : null;
  const movement = periodMovement(events, bounds.start, bounds.end);

  // Trend: oldest → newest, ending at `endPeriod`.
  const buildTrend = (endPeriod: string): TrendPoint[] => {
    const out: TrendPoint[] = [];
    for (let i = trendLength - 1; i >= 0; i--) {
      const p = shiftPeriod(endPeriod, -i);
      const r = computeRetention(scoped, events, p);
      const b = periodBounds(p);
      const m = periodMovement(events, b.start, b.end);
      out.push({
        period: p,
        label: b.label,
        nrr: r.nrr,
        grr: r.grr,
        startingArr: r.startingArr,
        endingArr: r.endingArr,
        expansion: r.expansion,
        contraction: r.contraction,
        churn: r.churn,
        newBusiness: m.newBusiness,
      });
    }
    return out;
  };
  const trend = buildTrend(period);
  // The first period in the trend that has any retention movement behind it.
  // Everything before it plots NRR/GRR 100% — arithmetically right (nothing
  // churned, nothing expanded) and indistinguishable from "the ledger doesn't
  // go back this far". On live data the ledger's first churn event is 2025-Q4,
  // so a 6-quarter trend renders 100/100/100/96.5/85.9/93.1 — which reads as
  // "retention was perfect and then collapsed" when it actually means "the data
  // starts here". The UI marks the boundary rather than letting a board draw
  // that conclusion.
  const firstRealTrendPeriod =
    trend.find((t) => t.churn > 0 || t.expansion > 0 || t.contraction > 0)?.period ?? null;
  // The ghost window. Only meaningful if it has real movement behind it — a
  // window entirely before the ledger begins computes NRR 100 for every point
  // (no opening base, nothing churned), which would draw a confident flat line
  // describing a period that has no data at all. Suppress it rather than
  // invent it.
  const compareTrendRaw = cmpPeriod ? buildTrend(cmpPeriod) : null;
  // The guard is MOVEMENT, not an opening balance.
  //
  // computeRetention returns NRR 100 for a period where nothing happened —
  // arithmetically correct (start + 0 − 0 − 0 = start) and completely
  // indistinguishable from "we have no data for this window". This ledger's
  // events effectively begin in Q4 2025, so a year-over-year ghost drew a
  // confident flat 100% line across all of 2024, silently asserting perfect
  // retention for quarters the ledger knows nothing about. Every one of those
  // points passed a `startingArr > 0` check, because accounts DID carry ARR
  // then — their new_business events are backdated to contract start; it's the
  // renewals/churn that aren't recorded.
  //
  // Requiring at least one real movement means the ghost only appears when
  // there's something to compare against, and vanishes rather than lying.
  // RETENTION movement specifically — new_business is excluded, because the
  // chart plots NRR/GRR and those move only on churn/expansion/contraction (new
  // business is deliberately kept out of retention). Counting it would let a
  // window full of new logos and nothing else "pass" and then draw as flat 100%.
  // This ledger records no churn at all before 2025-Q4, so a year-over-year
  // ghost across 2024 is exactly that case.
  const compareHasMovement =
    compareTrendRaw?.some((t) => t.churn > 0 || t.expansion > 0 || t.contraction > 0) ?? false;
  const compareTrend = compareHasMovement ? compareTrendRaw : null;

  // Period-scoped churn, straight off the ledger (see header note #2).
  const byId = new Map(scoped.map((c) => [c.id, c]));
  const churned: ChurnRow[] = events
    .filter((e) => e.type === "churn")
    .filter((e) => {
      const d = e.effectiveDate.slice(0, 10);
      return d >= bounds.start && d < bounds.end;
    })
    .map((e) => {
      const client = byId.get(e.clientId);
      return client ? { client, arrLost: Math.max(0, -e.amount), date: e.effectiveDate.slice(0, 10) } : null;
    })
    .filter((r): r is ChurnRow => r !== null)
    .sort((a, b) => b.arrLost - a.arrLost);

  const portfolio = buildPortfolioSummary(scoped);
  const downgradeRows = scoped
    .filter((c) => c.status !== "churned" && c.arr < c.previousArr)
    .map((c) => ({ client: c, delta: c.arr - c.previousArr }))
    .sort((a, b) => a.delta - b.delta);

  // Usage movement is measured over the last COMPLETE calendar month, which is
  // independent of the selected ARR period on purpose: usage history is monthly
  // and a quarter-to-date comparison would be against a part-month. The UI
  // labels which month it's showing rather than implying it follows the period.
  const usageMonth = lastCompleteMonth();
  const historyIds = scoped.length === clients.length ? usageHistory : usageHistory.filter((r) => ids.has(r.clientId));
  const usageMoves = usageMovementByClient(historyIds, usageMonth);
  const movementRows = movements(scoped, events, { start: bounds.start, end: bounds.end }, usageMoves);
  const riskRows = atRisk(scoped, usageMoves);
  const concentrationRows = concentration(scoped, usageMoves);

  return {
    period,
    periodLabel: bounds.label,
    bounds: { start: bounds.start, end: bounds.end },
    currency: portfolio.currency,
    retention,
    previous,
    comparison: {
      mode: compare,
      period: cmpPeriod,
      label: cmpPeriod ? periodBounds(cmpPeriod).label : null,
    },
    movements: movementRows,
    atRisk: riskRows,
    concentration: concentrationRows,
    usageMonth,
    healthDrag: buildHealthDrag(scoped, healthConfig),
    // Follows the selected period like everything else. The churn page defaults
    // that period to ALL_TIME (patterns usually want the whole history), but
    // that's the reader's choice now, not a property of the page.
    //
    // ALL_TIME must pass NO bounds, not its bounds. periodBounds("all") returns
    // real dates (0000-01-01 .. 9999-12-31), so handing them over made `bounds`
    // truthy and silently took the period path: churn read 56 accounts (only the
    // ones with a dated event) instead of 76, reported itself as a periodic rate,
    // and hid the 20-account undated data gap entirely. Every number was
    // plausible, which is what made it dangerous.
    churnAnalysis: buildChurnAnalysis(
      scoped,
      events,
      period === ALL_TIME ? undefined : { start: bounds.start, end: bounds.end },
    ),
    portfolio,
    newBusiness: movement.newBusiness,
    closingArr: retention.endingArr + movement.newBusiness,
    trend,
    compareTrend,
    firstRealTrendPeriod,
    downgrades: downgradeRows,
    churned,
    healthSplit: { healthy: portfolio.healthy, watch: portfolio.watch, atRisk: portfolio.atRisk },
    filteredCount: scoped.length,
    totalCount: clients.length,
  };
}

/** ARR balance for the whole (filtered) book at a given date — used for the
 *  trend chart's opening line. */
export function bookArrAsOf(events: ArrEvent[], dateISO: string, clientIds: Set<string>): number {
  const byClient = new Map<string, ArrEvent[]>();
  for (const e of events) {
    if (!clientIds.has(e.clientId)) continue;
    const list = byClient.get(e.clientId) ?? [];
    list.push(e);
    byClient.set(e.clientId, list);
  }
  let total = 0;
  for (const [, list] of byClient) total += arrAsOf(list, dateISO);
  return total;
}

/* ------------------------------------------------------------ date presets */

/**
 * Named ranges, in TWO VISIBLY SEPARATE GROUPS — calendar and rolling.
 *
 * The split is the point, and it's the one thing verified research actually
 * settled. Salesforce has a documented asymmetry in its own date literals:
 * LAST_N_DAYS:30 INCLUDES today, while LAST_N_MONTHS:3 EXCLUDES the current
 * month. Same naming shape, opposite semantics, in a mature product. That's the
 * strongest evidence there is that rolling and calendar must not be blended
 * into one "relative ranges" list — which is exactly what the first cut did.
 *
 * Both are the convention, not one: product analytics (Mixpanel defaults to
 * "Last 30 days") leads with rolling; CRM/finance (Salesforce reports, Stripe
 * Reports — which defaults to the PRIOR MONTH) leans calendar. This page is
 * finance-shaped, so the calendar default stands; rolling is offered alongside
 * rather than argued away, which is what I did the first time.
 *
 * Weeks were already fully built (isoWeekBounds/currentWeek, and periodBounds
 * has always parsed "YYYY-Www") and simply never exposed.
 *
 * Rolling presets resolve to explicit "YYYY-MM-DD..YYYY-MM-DD" range keys, so
 * they flow through periodBounds/shiftPeriod/comparison like any other period
 * — no second date system.
 */
export type PresetGroup = "calendar" | "rolling";

export interface Preset {
  key: string;
  label: string;
  group: PresetGroup;
  resolve: (now: Date) => string;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const minusDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - n);
  return x;
};

/** A trailing window ENDING YESTERDAY. Deliberately not including today: today
 *  is a partial day, and a "last 30 days" that silently contains a half-finished
 *  one is the Salesforce LAST_N_DAYS trap — it makes the most recent point dip
 *  for no reason. Stated here because the choice is invisible otherwise. */
const rolling = (days: number) => (now: Date) =>
  rangeKey(dayKey(minusDays(now, days)), dayKey(minusDays(now, 1)));

export const PRESETS: Preset[] = [
  // calendar — completed periods first, matching Stripe Reports' prior-month default
  { key: "last_week", label: "Last week", group: "calendar", resolve: (n) => shiftPeriod(currentWeek(n), -1) },
  { key: "this_week", label: "This week", group: "calendar", resolve: (n) => currentWeek(n) },
  { key: "last_month", label: "Last month", group: "calendar", resolve: (n) => shiftPeriod(monthKey(n), -1) },
  { key: "this_month", label: "This month", group: "calendar", resolve: (n) => monthKey(n) },
  { key: "last_quarter", label: "Last quarter", group: "calendar", resolve: (n) => shiftPeriod(currentQuarter(n), -1) },
  { key: "this_quarter", label: "This quarter", group: "calendar", resolve: (n) => currentQuarter(n) },
  { key: "last_year", label: "Last year", group: "calendar", resolve: (n) => String(n.getUTCFullYear() - 1) },
  { key: "this_year", label: "This year", group: "calendar", resolve: (n) => String(n.getUTCFullYear()) },
  // rolling — trailing windows, each ending yesterday
  { key: "all_time", label: "All time", group: "rolling", resolve: () => ALL_TIME },
  { key: "last_7d", label: "Last 7 days", group: "rolling", resolve: rolling(7) },
  { key: "last_30d", label: "Last 30 days", group: "rolling", resolve: rolling(30) },
  { key: "last_90d", label: "Last 90 days", group: "rolling", resolve: rolling(90) },
  { key: "last_365d", label: "Last 12 months", group: "rolling", resolve: rolling(365) },
];

export function resolvePreset(key: string, now: Date = new Date()): string {
  return PRESETS.find((p) => p.key === key)?.resolve(now) ?? currentQuarter(now);
}

/** Which preset a period key corresponds to — so the picker reads "Last
 *  quarter" rather than a raw key, and "Custom" once you've paged off one. */
export function matchPreset(period: string, now: Date = new Date()): string | null {
  return PRESETS.find((p) => p.resolve(now) === period)?.key ?? null;
}

/* ---------------------------------------------------------------- headline */

/**
 * The one-sentence summary that opens the page.
 *
 * It replaces a static description ("Retention, revenue movement, product usage
 * and portfolio health across the ARR base…") that restated the title, had gone
 * stale as the page changed under it, and spent the most valuable space above
 * the fold saying nothing. Every figure here is already computed — this is
 * assembly, not new math.
 *
 * Returned as DATA, not a formatted string, so the component can emphasise the
 * numbers and the caller can localise/format currency once. It's also then
 * trivially the text you'd paste into an email or a board slide.
 */
export interface Headline {
  period: string;
  inProgress: boolean;
  closingArr: number;
  /** Closing vs opening, as a fraction. Null when there's no opening base. */
  arrChange: number | null;
  churnArr: number;
  churnCount: number;
  contraction: number;
  expansion: number;
  newBusiness: number;
  movedCount: number;
  renewalsCount: number;
  renewalsArr: number;
  atRiskCount: number;
  atRiskArr: number;
}

export function buildHeadline(r: ExecReport): Headline {
  const opening = r.retention.startingArr;
  const atRiskRows = r.atRisk.filter((x) => x.risk >= 30);
  return {
    period: r.period,
    inProgress: periodInProgress(r.period),
    closingArr: r.closingArr,
    arrChange: opening > 0 ? (r.closingArr - opening) / opening : null,
    churnArr: r.retention.churn,
    churnCount: r.churned.length,
    contraction: r.retention.contraction,
    expansion: r.retention.expansion,
    newBusiness: r.newBusiness,
    movedCount: r.movements.length,
    renewalsCount: r.atRisk.length,
    renewalsArr: r.atRisk.reduce((a, x) => a + x.arr, 0),
    atRiskCount: atRiskRows.length,
    atRiskArr: atRiskRows.reduce((a, x) => a + x.arr, 0),
  };
}

/* ------------------------------------------------------------ period helpers */

/** A short, human label for a period key ("2026-Q2" → "Q2 2026"). */
export function periodDisplay(period: string): string {
  if (period === ALL_TIME) return "All time";
  // An explicit range has no name — show the dates, because "Apr 1 – Apr 30" is
  // the only honest label for one. A rolling window is meaningless without them.
  if (isRangeKey(period)) {
    const [s, e] = period.split("..");
    const fmt = (iso: string, withYear: boolean) => {
      const m = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${m[Number(iso.slice(5, 7))]} ${Number(iso.slice(8, 10))}${withYear ? ` ${iso.slice(0, 4)}` : ""}`;
    };
    const sameYear = s.slice(0, 4) === e.slice(0, 4);
    return `${fmt(s, !sameYear)} – ${fmt(e, true)}`;
  }
  const q = period.match(/^(\d{4})-Q([1-4])$/i);
  if (q) return `Q${q[2]} ${q[1]}`;
  const mo = period.match(/^(\d{4})-(\d{2})$/);
  if (mo) {
    const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[Number(mo[2])]} ${mo[1]}`;
  }
  // A week number is not a date. "Week 28, 2026" makes a reader count on their
  // fingers; the span is what they actually want, and showing it is the whole
  // point of the picker.
  const w = period.match(/^(\d{4})-W(\d{1,2})$/i);
  if (w) {
    const b = periodBounds(period);
    const end = new Date(`${b.end}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1); // bounds.end is exclusive
    const m = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const s2 = b.start;
    const e2 = end.toISOString().slice(0, 10);
    const sameMonth = s2.slice(0, 7) === e2.slice(0, 7);
    const left = `${m[Number(s2.slice(5, 7))]} ${Number(s2.slice(8, 10))}`;
    const right = sameMonth ? `${Number(e2.slice(8, 10))}` : `${m[Number(e2.slice(5, 7))]} ${Number(e2.slice(8, 10))}`;
    return `${left} – ${right}`;
  }
  return period;
}

/** The granularity of a period key — drives the period picker's mode toggle. */
export function periodGrain(period: string): "all" | "range" | "week" | "month" | "quarter" | "year" {
  if (period === ALL_TIME) return "all";
  if (isRangeKey(period)) return "range";
  if (/^\d{4}-W\d{1,2}$/i.test(period)) return "week";
  if (/^\d{4}-\d{2}$/.test(period)) return "month";
  if (/^\d{4}-Q[1-4]$/i.test(period)) return "quarter";
  return "year";
}

/**
 * The default period for an executive view: the last COMPLETE quarter, not the
 * current one.
 *
 * `currentQuarter()` (what /reports used to default to) is the right answer for
 * an operational view but the wrong one for a retrospective. On day 16 of a
 * quarter it reports NRR 100%, zero churn and a flat waterfall — every metric
 * technically true and all of them meaningless, because almost nothing has
 * happened yet. Verified against live data on 2026-07-16: Q3 renders entirely
 * empty while Q2 (complete) shows NRR 93.1%.
 *
 * Defaulting one quarter back means the page opens on a period that actually
 * has a story. The navigator still steps forward into the live quarter, and
 * `periodInProgress()` badges it when it does.
 */
export function defaultExecPeriod(now: Date = new Date()): string {
  return shiftPeriod(currentQuarter(now), -1);
}

/** True when `period`'s window contains `now` — i.e. the numbers are still
 *  accruing and shouldn't be read as final. */
export function periodInProgress(period: string, now: Date = new Date()): boolean {
  if (period === ALL_TIME) return false;
  const { start, end } = periodBounds(period);
  const today = now.toISOString().slice(0, 10);
  return today >= start && today < end;
}

/** How far through an in-progress period we are, for the badge copy. */
export function periodProgress(period: string, now: Date = new Date()): { elapsed: number; total: number } {
  const { start, end } = periodBounds(period);
  const day = 86_400_000;
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const total = Math.round((e - s) / day);
  const elapsed = Math.min(total, Math.max(0, Math.round((now.getTime() - s) / day)));
  return { elapsed, total };
}
