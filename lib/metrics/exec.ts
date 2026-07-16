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
import type { UsageSnapshotRecord, UsageTier } from "@/lib/usage/types";
import { arrAsOf, currentQuarter, periodBounds, periodMovement, shiftPeriod } from "@/lib/metrics/arr";
import { computeRetention } from "@/lib/metrics/retention";
import { buildPortfolioSummary } from "@/lib/metrics/portfolio";

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

/* ------------------------------------------------------------ usage rollup */

/**
 * Portfolio-wide product usage.
 *
 * THREE THINGS TO KNOW, because they shape what this can honestly claim:
 *
 * 1. NOT PERIOD-SCOPED. `client_usage_snapshots` is keyed by client_id — one
 *    row, overwritten by the 4-hourly cron. There is no usage history in
 *    Postgres, so this is always "as of the last sync", never "for Q2". It
 *    responds to FILTERS (per-client rows) but deliberately ignores the period
 *    selector, and the UI must say so or a reader will assume otherwise.
 *
 * 2. NOT clients.usage. That JSONB column is a hollow placeholder — verified on
 *    live data: all 55 non-churned accounts carry mau/wau/seats = 0. The sync
 *    can't compute real usage (it lacks the Metabase signals) so it writes an
 *    empty shape, exactly like the health placeholder that commit 399f58f had
 *    to stop clobbering. The Metabase snapshot table is the only real source.
 *
 * 3. SEATS ARE AN ENTITLEMENT, NOT A DENOMINATOR. One account's environment
 *    reports 54,000 seats against 13,689 provisioned users — 85% of the book's
 *    entire seat count from a single licence line. A naive MAU/seats
 *    "activation" reads 6.7% globally and ~23% with that one account removed,
 *    so the raw ratio says more about licence paperwork than adoption. Both
 *    denominators are returned; the caller decides, and `seatsConcentration`
 *    flags when one account dominates.
 */
export interface UsageRollup {
  /** Accounts in the filtered book that have a usable snapshot. */
  covered: number;
  /** Filtered accounts with no snapshot row at all (no Metabase link). */
  unlinked: number;
  /** Snapshots that recorded a sync error — broken, not idle. */
  errored: number;
  mau: number;
  wau: number;
  /** WAU/MAU — of the people active this month, how many showed up this week. */
  stickiness: number | null;
  seats: number;
  provisionedUsers: number;
  /** MAU / provisioned users. The defensible activation number. */
  activationVsUsers: number | null;
  /** MAU / licensed seats. Entitlement-based — see note 3. */
  activationVsSeats: number | null;
  /** Accounts with a snapshot but zero monthly actives. */
  dormant: number;
  /** Mean adoption score across covered accounts. */
  avgAdoption: number | null;
  /** Typed to the real UsageTier union, not `string`, so a consumer switching
   *  on it can't silently miss a tier. */
  adoptionTiers: { tier: UsageTier; count: number }[];
  /** Largest single account's share of total MAU (0–1), and its name. */
  mauConcentration: { share: number; name: string } | null;
  /** Largest single account's share of total seats (0–1) — the 54k flag. */
  seatsConcentration: { share: number; name: string } | null;
  /** Oldest/newest snapshot in the set, so the UI can date the panel. */
  oldestFetch: string | null;
  newestFetch: string | null;
  learningEnrollments: number;
  learningCompletions: number;
}

export function buildUsageRollup(clients: Client[], snapshots: UsageSnapshotRecord[]): UsageRollup {
  const byId = new Map(snapshots.map((s) => [s.clientId, s]));
  // Churned accounts keep a stale snapshot (70 of them do). Their usage is not
  // part of the live book's story, so they're excluded here — matching the
  // health rollup's rule in buildPortfolioSummary.
  const live = clients.filter((c) => c.status !== "churned");

  const rows: { client: Client; snap: UsageSnapshotRecord }[] = [];
  let unlinked = 0;
  let errored = 0;
  for (const c of live) {
    const s = byId.get(c.id);
    if (!s) {
      unlinked += 1;
      continue;
    }
    if (s.syncError) {
      errored += 1;
      continue;
    }
    rows.push({ client: c, snap: s });
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const sum = (pick: (s: UsageSnapshotRecord) => number) => rows.reduce((a, r) => a + pick(r.snap), 0);

  const mau = sum((s) => num(s.metrics?.mau));
  const wau = sum((s) => num(s.metrics?.wau));
  const seats = sum((s) => num(s.metrics?.seats));
  const provisionedUsers = sum((s) => num(s.metrics?.total_users));
  const dormant = rows.filter((r) => num(r.snap.metrics?.mau) === 0).length;

  const scores = rows.map((r) => num(r.snap.score?.score)).filter((n) => Number.isFinite(n));
  const tierCounts = new Map<UsageTier, number>();
  for (const r of rows) {
    const t = r.snap.score?.tier;
    if (t) tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
  }

  const topBy = (pick: (s: UsageSnapshotRecord) => number, total: number) => {
    if (!rows.length || total <= 0) return null;
    const top = [...rows].sort((a, b) => pick(b.snap) - pick(a.snap))[0];
    return { share: pick(top.snap) / total, name: top.client.name };
  };

  const fetches = rows.map((r) => r.snap.fetchedAt).sort();

  return {
    covered: rows.length,
    unlinked,
    errored,
    mau,
    wau,
    stickiness: mau > 0 ? wau / mau : null,
    seats,
    provisionedUsers,
    activationVsUsers: provisionedUsers > 0 ? mau / provisionedUsers : null,
    activationVsSeats: seats > 0 ? mau / seats : null,
    dormant,
    avgAdoption: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    adoptionTiers: [...tierCounts.entries()]
      .map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => b.count - a.count),
    mauConcentration: topBy((s) => num(s.metrics?.mau), mau),
    seatsConcentration: topBy((s) => num(s.metrics?.seats), seats),
    oldestFetch: fetches[0] ?? null,
    newestFetch: fetches[fetches.length - 1] ?? null,
    learningEnrollments: sum((s) => num(s.metrics?.learning_enrollments)),
    learningCompletions: sum((s) => num(s.metrics?.learning_completions)),
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
  if (mode === "prev") return shiftPeriod(period, -1);
  const grain = periodGrain(period);
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
  /** Portfolio product usage. NOT period-scoped — see UsageRollup's note 1. */
  usage: UsageRollup;
  portfolio: ReturnType<typeof buildPortfolioSummary>;
  /** New business landed in-period. Deliberately kept OUT of NRR/GRR (it isn't
   *  retention) but surfaced on its own — a board always asks for it. */
  newBusiness: number;
  /** retained + new business = the book's real closing position. */
  closingArr: number;
  trend: TrendPoint[];
  downgrades: { client: Client; delta: number }[];
  churned: ChurnRow[];
  healthSplit: { healthy: number; watch: number; atRisk: number };
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
  usageSnapshots?: UsageSnapshotRecord[];
}

export function buildExecReport({
  clients,
  arrEvents,
  period,
  filters,
  trendLength = 6,
  compare = "prev",
  usageSnapshots = [],
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

  // Trend: oldest → newest, ending at the selected period.
  const trend: TrendPoint[] = [];
  for (let i = trendLength - 1; i >= 0; i--) {
    const p = shiftPeriod(period, -i);
    const r = computeRetention(scoped, events, p);
    const b = periodBounds(p);
    const m = periodMovement(events, b.start, b.end);
    trend.push({
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
    usage: buildUsageRollup(scoped, usageSnapshots),
    portfolio,
    newBusiness: movement.newBusiness,
    closingArr: retention.endingArr + movement.newBusiness,
    trend,
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

/* ------------------------------------------------------------ period helpers */

/** A short, human label for a period key ("2026-Q2" → "Q2 2026"). */
export function periodDisplay(period: string): string {
  const q = period.match(/^(\d{4})-Q([1-4])$/i);
  if (q) return `Q${q[2]} ${q[1]}`;
  const mo = period.match(/^(\d{4})-(\d{2})$/);
  if (mo) {
    const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[Number(mo[2])]} ${mo[1]}`;
  }
  const w = period.match(/^(\d{4})-W(\d{1,2})$/i);
  if (w) return `Week ${Number(w[2])}, ${w[1]}`;
  return period;
}

/** The granularity of a period key — drives the period picker's mode toggle. */
export function periodGrain(period: string): "week" | "month" | "quarter" | "year" {
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
