import type {
  ArrEvent,
  Attachment,
  Client,
  Contact,
  Deal,
  Email,
  HealthScore,
  Meeting,
  Playbook,
  PlaybookTask,
  SupportSummary,
  TimelineEvent,
  UsageMetrics,
} from "@/lib/types";
import { csmById } from "@/lib/sample/csms";
import { arrAsOf, currentQuarter, deriveClientArr, periodBounds, withRunningBalance } from "@/lib/metrics/arr";

/* ------------------------------------------------------------------ helpers */

function initialsFor(name: string): string {
  const latin = name.match(/[A-Za-z][A-Za-z'.-]*/g) ?? [];
  const a = latin[0];
  const b = latin[1];
  if (a && b) return (a[0] + b[0]).toUpperCase();
  if (a) return a.slice(0, 2).toUpperCase();
  const chars = [...name.replace(/\s+/g, "")];
  return chars.slice(0, 2).join("");
}

function segmentFor(employees: number | null): Client["segment"] {
  if (!employees) return "smb";
  if (employees >= 250) return "enterprise";
  if (employees >= 50) return "mid_market";
  return "smb";
}

interface Seed {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  csmId: string | null;
  arr: number;
  previousArr: number;
  startedAt: string | null;
  renewalDate: string | null;
  status?: Client["status"];
  churnedAt?: string | null;
  tags?: string[];
  /** A handful of illustrative 0–100 signal numbers, averaged into a demo
   *  score below — sample mode doesn't run the real (admin-configurable,
   *  8-metric) health engine, so these are cosmetic only, not tied to
   *  HealthMetricKey. */
  h: Record<string, number>;
  trend?: number;
  support: Omit<SupportSummary, "csatScale" | "supportLevelUsed" | "slaBreaches" | "tickets" | "csatTrend" | "npsTrend">;
  usage: Omit<UsageMetrics, "adoptionRate" | "stickiness">;
}

const PORTAL = "7385921";

/** Sample-mode-only stand-in for the real (admin-configurable) health engine
 *  — averages the seed's illustrative signal numbers into a score/tier.
 *  `components` is intentionally empty: sample mode has no real per-metric
 *  breakdown to show, and an absent key already means "no data" under the
 *  new HealthComponents shape (see lib/metrics/health.ts). */
function sampleHealth(h: Record<string, number>, trend: number): HealthScore {
  const values = Object.values(h);
  const score = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const tier: HealthScore["tier"] = score >= 75 ? "healthy" : score >= 55 ? "watch" : "at_risk";
  return { score, tier, components: {}, trend, updatedAt: "2026-06-14T08:00:00.000Z" };
}

function makeClient(s: Seed): Client {
  const status = s.status ?? "active";
  const adoptionRate = s.usage.seats > 0 ? s.usage.activeUsers / s.usage.seats : 0;
  const stickiness = s.usage.mau > 0 ? s.usage.wau / s.usage.mau : 0;
  return {
    id: s.id,
    hubspotId: s.id,
    source: "hubspot",
    name: s.name,
    domain: s.domain,
    country: s.country,
    industry: s.industry,
    employees: s.employees,
    customerType: "arr",
    status,
    csm: csmById(s.csmId),
    csmSource: "manual",
    implementationOwner: null,
    implementationOwnerSource: null,
    currency: "USD",
    arr: s.arr,
    previousArr: s.previousArr,
    startedAt: s.startedAt,
    renewalDate: s.renewalDate,
    churnedAt: s.churnedAt ?? null,
    segment: segmentFor(s.employees),
    logoUrl: null,
    hubspotUrl: `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${s.id}`,
    health: sampleHealth(s.h, s.trend ?? 0),
    support: { ...s.support, csatScale: "percent", supportLevelUsed: null, slaBreaches: [], tickets: [], csatTrend: [], npsTrend: [] },
    usage: { ...s.usage, adoptionRate, stickiness },
    tags: s.tags ?? [],
  };
}

/* ---------------------------------------------------------------- usage/help */

function usage(p: { seats: number; activeUsers: number; wau: number; mau: number; activityTrend?: number[]; lastActiveAt?: string; featureAdoption?: UsageMetrics["featureAdoption"] }): Omit<UsageMetrics, "adoptionRate" | "stickiness"> {
  return {
    seats: p.seats,
    activeUsers: p.activeUsers,
    wau: p.wau,
    mau: p.mau,
    lastActiveAt: p.lastActiveAt ?? "2026-06-13T17:00:00.000Z",
    featureAdoption: p.featureAdoption ?? [
      { feature: "Assessments", pct: 62 },
      { feature: "Learning paths", pct: 48 },
      { feature: "Performance", pct: 35 },
      { feature: "Engagement", pct: 27 },
    ],
    activityTrend: p.activityTrend ?? [30, 34, 33, 38, 41, 44, 42, 47, 49, 52, 50, 55],
  };
}

/* ---- autoSeed: generates a default Seed from compact HubSpot-sourced data -- */

interface RawClient {
  id: string;
  name: string;
  domain?: string | null;
  country?: string | null;
  industry?: string | null;
  employees?: number | null;
  csmId?: string | null;
  arr: number;
  startedAt?: string | null;
  h?: Partial<Record<string, number>>;
  trend?: number;
  tags?: string[];
}

function autoSeed(r: RawClient): Seed {
  const emp = r.employees ?? 20;
  const seats = Math.max(5, Math.round(emp * 0.7));
  const active = Math.max(3, Math.round(seats * 0.6));
  const base = r.arr > 50000 ? 74 : r.arr > 10000 ? 67 : r.arr > 3000 ? 62 : 56;
  const h: Record<string, number> = {
    usage: r.h?.usage ?? base,
    sentiment: r.h?.sentiment ?? base + 3,
    support: r.h?.support ?? base + 5,
    engagement: r.h?.engagement ?? base - 3,
    relationship: r.h?.relationship ?? base + 2,
  };
  return {
    id: r.id,
    name: r.name,
    domain: r.domain ?? null,
    country: r.country ?? null,
    industry: r.industry ?? null,
    employees: r.employees ?? null,
    csmId: r.csmId ?? null,
    arr: r.arr,
    previousArr: r.arr,
    startedAt: r.startedAt ?? null,
    renewalDate: null,
    tags: r.tags ?? [],
    h,
    trend: r.trend ?? 0,
    support: {
      openTickets: r.arr > 10000 ? 2 : 1,
      snoozedTickets: 0,
      closedLast30d: Math.max(2, Math.min(12, Math.round(r.arr / 4000))),
      oldestOpenDays: r.arr > 10000 ? 4 : 2,
      medianFirstResponseHours: 5,
      csat: r.arr > 50000 ? 85 : r.arr > 10000 ? 80 : 75,
      csatResponses: Math.max(3, Math.min(30, Math.round(r.arr / 3000))),
      nps: r.arr > 10000 ? 35 : 20,
      npsResponses: Math.max(2, Math.min(20, Math.round(r.arr / 5000))),
      lastConversationAt: "2026-06-10T10:00:00.000Z",
    },
    usage: usage({ seats, activeUsers: active, wau: Math.round(active * 0.6), mau: active }),
  };
}

/* ================================================================ SEEDS
   72 real HubSpot ARR customers (lifecyclestage=customer, customer_type=arr).
   CSM IDs are HubSpot `csm` property user IDs.
   Detailed entries for key accounts; autoSeed() for the rest.
   ================================================================ */

/* ---- 15 detailed seeds (key accounts with full health/support/usage data) --- */

const DETAILED: Seed[] = [
  {
    id: "48066915105",
    name: "Saudi Mining Polytechnic — المعهد السعودي التقني للتعدين",
    domain: "smp.edu.sa",
    country: "Saudi Arabia",
    industry: "Education Management",
    employees: 125,
    csmId: "79667619",
    arr: 13457,
    previousArr: 10000,
    startedAt: "2026-01-27",
    renewalDate: "2027-01-27",
    tags: ["expansion", "reference-able"],
    h: { usage: 88, sentiment: 84, support: 80, engagement: 82, relationship: 78 },
    trend: 6,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 7, oldestOpenDays: 2, medianFirstResponseHours: 3, csat: 94, csatResponses: 22, nps: 60, npsResponses: 14, lastConversationAt: "2026-06-12T10:00:00.000Z" },
    usage: usage({ seats: 120, activeUsers: 104, wau: 71, mau: 104, activityTrend: [40, 52, 60, 66, 71, 78, 83, 88, 92, 96, 100, 104] }),
  },
  {
    id: "39089923646",
    name: "MM Brand",
    domain: "mm-brand.com",
    country: "Bahrain",
    industry: "Design",
    employees: 67,
    csmId: "83083504",
    arr: 8904,
    previousArr: 8904,
    startedAt: "2025-09-17",
    renewalDate: "2026-09-17",
    tags: ["advocate"],
    h: { usage: 79, sentiment: 88, support: 90, engagement: 74, relationship: 82 },
    trend: 2,
    support: { openTickets: 0, snoozedTickets: 1, closedLast30d: 3, oldestOpenDays: null, medianFirstResponseHours: 2, csat: 96, csatResponses: 11, nps: 70, npsResponses: 8, lastConversationAt: "2026-06-09T13:30:00.000Z" },
    usage: usage({ seats: 60, activeUsers: 47, wau: 31, mau: 47 }),
  },
  {
    id: "43636566690",
    name: "Experience in collecting debts for financing institutions",
    domain: "exprience-sa.com",
    country: "Saudi Arabia",
    industry: "Financial Services",
    employees: 300,
    csmId: "76961168",
    arr: 6987,
    previousArr: 6987,
    startedAt: "2025-11-20",
    renewalDate: "2026-08-15",
    tags: ["enterprise", "renewal-soon"],
    h: { usage: 64, sentiment: 58, support: 52, engagement: 60, relationship: 66 },
    trend: -4,
    support: { openTickets: 4, snoozedTickets: 1, closedLast30d: 12, oldestOpenDays: 11, medianFirstResponseHours: 9, csat: 71, csatResponses: 18, nps: 10, npsResponses: 12, lastConversationAt: "2026-06-13T08:45:00.000Z" },
    usage: usage({ seats: 280, activeUsers: 150, wau: 88, mau: 150, activityTrend: [120, 132, 140, 138, 145, 150, 148, 152, 149, 151, 150, 150] }),
  },
  {
    id: "45865437447",
    name: "صندوق الوقف الصحي",
    domain: "saudihef.org.sa",
    country: "Saudi Arabia",
    industry: "Hospital & Health Care",
    employees: 300,
    csmId: "76961168",
    arr: 873,
    previousArr: 873,
    startedAt: "2025-11-25",
    renewalDate: "2026-11-25",
    tags: ["enterprise"],
    h: { usage: 72, sentiment: 76, support: 70, engagement: 68, relationship: 74 },
    trend: 3,
    support: { openTickets: 2, snoozedTickets: 0, closedLast30d: 9, oldestOpenDays: 4, medianFirstResponseHours: 5, csat: 85, csatResponses: 15, nps: 40, npsResponses: 10, lastConversationAt: "2026-06-11T09:20:00.000Z" },
    usage: usage({ seats: 250, activeUsers: 168, wau: 99, mau: 168 }),
  },
  {
    id: "47782317745",
    name: "Madghout Baytna — مضغوط بيتنا",
    domain: "madghoutbaytna.com",
    country: "Saudi Arabia",
    industry: "Food Production",
    employees: 200,
    csmId: "76961168",
    arr: 4266,
    previousArr: 4266,
    startedAt: "2025-12-31",
    renewalDate: "2026-12-31",
    h: { usage: 58, sentiment: 62, support: 64, engagement: 55, relationship: 60 },
    trend: -2,
    support: { openTickets: 3, snoozedTickets: 0, closedLast30d: 6, oldestOpenDays: 7, medianFirstResponseHours: 6, csat: 78, csatResponses: 9, nps: 20, npsResponses: 7, lastConversationAt: "2026-06-10T15:00:00.000Z" },
    usage: usage({ seats: 180, activeUsers: 92, wau: 51, mau: 92 }),
  },
  {
    id: "41440971353",
    name: "ALAWN Foundation For Development",
    domain: "alawn.org",
    country: "Yemen",
    industry: "Business Supplies & Equipment",
    employees: 150,
    csmId: "83083504",
    arr: 3498,
    previousArr: 3498,
    startedAt: "2026-02-10",
    renewalDate: "2027-02-10",
    tags: ["ngo"],
    h: { usage: 70, sentiment: 72, support: 75, engagement: 66, relationship: 70 },
    trend: 1,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 4, oldestOpenDays: 3, medianFirstResponseHours: 4, csat: 88, csatResponses: 7, nps: 45, npsResponses: 5, lastConversationAt: "2026-06-08T11:00:00.000Z" },
    usage: usage({ seats: 140, activeUsers: 95, wau: 58, mau: 95 }),
  },
  {
    id: "50796310080",
    name: "Elafgate",
    domain: "elafgate.com",
    country: "Saudi Arabia",
    industry: "Mining & Metals",
    employees: 90,
    csmId: "76961168",
    arr: 900,
    previousArr: 900,
    startedAt: "2026-04-13",
    renewalDate: "2027-04-13",
    tags: ["onboarding"],
    h: { usage: 52, sentiment: 60, support: 68, engagement: 48, relationship: 64 },
    trend: -1,
    support: { openTickets: 2, snoozedTickets: 1, closedLast30d: 5, oldestOpenDays: 6, medianFirstResponseHours: 7, csat: 80, csatResponses: 6, nps: 25, npsResponses: 4, lastConversationAt: "2026-06-07T14:30:00.000Z" },
    usage: usage({ seats: 80, activeUsers: 33, wau: 18, mau: 33, activityTrend: [5, 9, 14, 18, 22, 25, 28, 30, 31, 32, 33, 33] }),
  },
  {
    id: "39089859746",
    name: "SMC",
    domain: "smc.me",
    country: "Saudi Arabia",
    industry: "Marketing & Advertising",
    employees: 174,
    csmId: "76961168",
    arr: 1000,
    previousArr: 1000,
    startedAt: "2025-09-10",
    renewalDate: "2026-09-10",
    h: { usage: 66, sentiment: 70, support: 72, engagement: 63, relationship: 68 },
    trend: 0,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 4, oldestOpenDays: 2, medianFirstResponseHours: 4, csat: 86, csatResponses: 8, nps: 35, npsResponses: 6, lastConversationAt: "2026-06-05T10:15:00.000Z" },
    usage: usage({ seats: 160, activeUsers: 101, wau: 60, mau: 101 }),
  },
  {
    id: "52032202114",
    name: "Red Sea Markets",
    domain: "redseamarkets.com",
    country: "Saudi Arabia",
    industry: null,
    employees: 5,
    csmId: "76961168",
    arr: 3400,
    previousArr: 3400,
    startedAt: "2026-05-07",
    renewalDate: "2027-05-07",
    tags: ["onboarding"],
    h: { usage: 44, sentiment: 55, support: 70, engagement: 40, relationship: 50 },
    trend: 0,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 2, oldestOpenDays: 5, medianFirstResponseHours: 8, csat: 75, csatResponses: 3, nps: null, npsResponses: 0, lastConversationAt: "2026-06-02T09:00:00.000Z" },
    usage: usage({ seats: 5, activeUsers: 2, wau: 1, mau: 2, activityTrend: [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2] }),
  },
  {
    id: "36019859787",
    name: "شركة الوم الطبية",
    domain: null,
    country: "Saudi Arabia",
    industry: "Hospital & Health Care",
    employees: 40,
    csmId: "76961168",
    arr: 282,
    previousArr: 350,
    startedAt: "2025-07-13",
    renewalDate: "2026-07-13",
    tags: ["downgrade", "renewal-soon"],
    h: { usage: 41, sentiment: 48, support: 55, engagement: 38, relationship: 52 },
    trend: -8,
    support: { openTickets: 5, snoozedTickets: 2, closedLast30d: 8, oldestOpenDays: 19, medianFirstResponseHours: 14, csat: 62, csatResponses: 12, nps: -10, npsResponses: 9, lastConversationAt: "2026-06-13T16:00:00.000Z" },
    usage: usage({ seats: 50, activeUsers: 16, wau: 8, mau: 16, activityTrend: [38, 35, 33, 30, 27, 24, 22, 20, 19, 18, 17, 16] }),
  },
  {
    id: "35898077704",
    name: "Foundation of Muteb bin Abdulaziz bin Abdulrahman Al Saud",
    domain: null,
    country: "Saudi Arabia",
    industry: "Non-profit",
    employees: 30,
    csmId: "76961168",
    arr: 282,
    previousArr: 282,
    startedAt: "2025-07-09",
    renewalDate: "2026-07-09",
    tags: ["renewal-soon"],
    h: { usage: 60, sentiment: 64, support: 66, engagement: 58, relationship: 62 },
    trend: 1,
    support: { openTickets: 0, snoozedTickets: 0, closedLast30d: 3, oldestOpenDays: null, medianFirstResponseHours: 3, csat: 90, csatResponses: 5, nps: 50, npsResponses: 4, lastConversationAt: "2026-06-01T12:00:00.000Z" },
    usage: usage({ seats: 28, activeUsers: 18, wau: 11, mau: 18 }),
  },
  {
    id: "35871248024",
    name: "شركة دار المنظومه لتقنية المعلومات",
    domain: null,
    country: "Saudi Arabia",
    industry: "Information Technology",
    employees: 110,
    csmId: "76961168",
    arr: 335,
    previousArr: 250,
    startedAt: "2025-07-08",
    renewalDate: "2026-07-08",
    tags: ["expansion", "renewal-soon"],
    h: { usage: 81, sentiment: 80, support: 78, engagement: 77, relationship: 80 },
    trend: 5,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 6, oldestOpenDays: 1, medianFirstResponseHours: 2, csat: 92, csatResponses: 14, nps: 55, npsResponses: 9, lastConversationAt: "2026-06-12T08:30:00.000Z" },
    usage: usage({ seats: 100, activeUsers: 78, wau: 49, mau: 78 }),
  },
  {
    id: "35871248198",
    name: "شركة تقهوى لتقديم المشروبات",
    domain: null,
    country: "Saudi Arabia",
    industry: "Food & Beverages",
    employees: 22,
    csmId: "76961168",
    arr: 18,
    previousArr: 18,
    startedAt: "2025-07-08",
    renewalDate: "2026-07-08",
    h: { usage: 49, sentiment: 58, support: 62, engagement: 45, relationship: 55 },
    trend: -3,
    support: { openTickets: 2, snoozedTickets: 0, closedLast30d: 2, oldestOpenDays: 9, medianFirstResponseHours: 10, csat: 73, csatResponses: 4, nps: 15, npsResponses: 3, lastConversationAt: "2026-05-28T11:30:00.000Z" },
    usage: usage({ seats: 20, activeUsers: 8, wau: 4, mau: 8 }),
  },
  {
    id: "35871248167",
    name: "شركة ميم المتقدمة لادارة المشاريع",
    domain: null,
    country: "Saudi Arabia",
    industry: "Management Consulting",
    employees: 48,
    csmId: "76961168",
    arr: 247,
    previousArr: 247,
    startedAt: "2025-07-08",
    renewalDate: "2026-10-08",
    h: { usage: 68, sentiment: 66, support: 70, engagement: 64, relationship: 67 },
    trend: 2,
    support: { openTickets: 1, snoozedTickets: 0, closedLast30d: 5, oldestOpenDays: 3, medianFirstResponseHours: 4, csat: 84, csatResponses: 7, nps: 30, npsResponses: 5, lastConversationAt: "2026-06-06T10:00:00.000Z" },
    usage: usage({ seats: 45, activeUsers: 29, wau: 18, mau: 29 }),
  },
  {
    id: "35868529212",
    name: "شركة المهيدب أول مهمة المحدودة",
    domain: null,
    country: "Saudi Arabia",
    industry: "Construction",
    employees: 18,
    csmId: "76961168",
    arr: 18,
    previousArr: 18,
    startedAt: "2025-07-08",
    renewalDate: "2026-12-08",
    h: { usage: 55, sentiment: 60, support: 68, engagement: 52, relationship: 58 },
    trend: 0,
    support: { openTickets: 0, snoozedTickets: 0, closedLast30d: 1, oldestOpenDays: null, medianFirstResponseHours: 5, csat: 82, csatResponses: 3, nps: null, npsResponses: 0, lastConversationAt: "2026-05-20T09:00:00.000Z" },
    usage: usage({ seats: 16, activeUsers: 9, wau: 5, mau: 9 }),
  },
];

/* ---- 57 auto-seeded real clients from HubSpot ---- */

const AUTO_RAW: RawClient[] = [
  { id: "35871248005", name: "شركة ذكاء واكثر", country: "Saudi Arabia", csmId: "76961168", arr: 35, startedAt: "2025-07-08" },
  { id: "35868529036", name: "شركة امتيازات الريادة للمقاولات العامة", country: "Saudi Arabia", csmId: "76961168", arr: 353, startedAt: "2025-07-08" },
  { id: "35871247931", name: "شركة روشن للتجارة", country: "Saudi Arabia", csmId: "76961168", arr: 18, startedAt: "2025-07-08" },
  { id: "35841420893", name: "WAHET ALKHAIR — واحة الخيرات", country: "Saudi Arabia", csmId: "76961168", arr: 18, startedAt: "2025-07-08" },
  { id: "35841420324", name: "شركة قمة الشاي لتقديم المشروبات", country: "Saudi Arabia", csmId: "76961168", arr: 953, startedAt: "2025-07-08" },
  { id: "36298706760", name: "ENMA ALRWABI", domain: "enmaalrwabi.com", country: "Saudi Arabia", csmId: "76961168", arr: 530, startedAt: "2025-07-08" },
  { id: "35054889837", name: "Mrasim — وكالة مراسم للانتاج الفني", domain: "mrasim.com", country: "Saudi Arabia", csmId: "76961168", arr: 312, startedAt: "2025-08-06" },
  { id: "34999024409", name: "Azmeel Travel", domain: "azmeeltravel.com", country: "Saudi Arabia", csmId: "76961168", arr: 353, startedAt: "2025-06-12" },
  { id: "35214051632", name: "Pioneerclosets — الخزائن الرائدة", domain: "pioneerclosets.net", country: "Saudi Arabia", employees: 80, csmId: "76961168", arr: 673, startedAt: "2025-06-19" },
  { id: "52234301577", name: "Imam Abdulaziz bin Mohammed Royal Reserve Development Authority (KARRDA)", domain: "karrda.gov.sa", country: "Saudi Arabia", industry: "Environmental Services", employees: 200, csmId: "79667619", arr: 21719, startedAt: "2026-03-01" },
  { id: "34513951386", name: "Global Industrial Resources W.L.L.", domain: "gir-group.com", country: "Bahrain", industry: "International Trade & Development", csmId: "83083504", arr: 4770, startedAt: "2025-11-24" },
  { id: "33475052576", name: "ARTAT Enterprise — شركة ارطات للتجارة", domain: "artat.com.sa", country: "Saudi Arabia", employees: 3, csmId: "76961168", arr: 35, startedAt: "2025-05-15" },
  { id: "33056220975", name: "Braxtone Group", domain: "braxtone.com", country: "Bahrain", industry: "Insurance", csmId: "83083504", arr: 16903, startedAt: "2025-05-21" },
  { id: "31942735901", name: "BASIC ELECTRONICS COMPANY LTD — الاساسية للالكترونيات", domain: "al-asasyah.com", country: "Saudi Arabia", industry: "Electrical & Electronic Manufacturing", csmId: "76961168", arr: 105, startedAt: "2025-09-18" },
  { id: "31417852345", name: "Gathern", domain: "www.gathern.co", country: "Saudi Arabia", industry: "Hospitality", employees: 141, csmId: "79667619", arr: 20869, startedAt: "2025-09-11" },
  { id: "31019275832", name: "Idex", domain: "idex.sa", country: "Saudi Arabia", industry: "Computer Software", employees: 41, csmId: "76961168", arr: 228, startedAt: "2025-06-17" },
  { id: "30948018557", name: "Managed Services", domain: "managed.sa", country: "Saudi Arabia", industry: "Computer Software", employees: 50, csmId: "76961168", arr: 7751, startedAt: "2025-05-05" },
  { id: "30038840087", name: "ClickApps", domain: "clickapps.co", country: "Saudi Arabia", industry: "Computer Software", employees: 250, csmId: "76961168", arr: 420, startedAt: "2025-02-17" },
  { id: "29048430771", name: "ALJAZEERH POULTRY COMPANY", domain: "aljazeerh.sa", country: "Saudi Arabia", industry: "Food Production", employees: 82, csmId: "76961168", arr: 144, startedAt: "2025-02-11" },
  { id: "52023972108", name: "Masdar Building Materials", domain: "mbm.com.sa", country: "Saudi Arabia", industry: "Mining & Metals", employees: 470, csmId: "76961168", arr: 3578, startedAt: "2026-02-24" },
  { id: "27715708009", name: "Abudawood Trading Co.", domain: "abudawoodtrading.com", country: "Saudi Arabia", industry: "Chemicals", employees: 250, csmId: "76961168", arr: 1937, startedAt: "2025-01-09" },
  { id: "26563517962", name: "East Engineering Consulting Company", domain: "ecec.com.sa", country: "Saudi Arabia", industry: "Civil Engineering", employees: 500, csmId: "83083504", arr: 13080, startedAt: "2026-03-02" },
  { id: "37000560789", name: "Amarox KSA", domain: "saudiamarox.com", country: "Saudi Arabia", industry: "Pharmaceuticals", employees: 120, csmId: "79667619", arr: 30051, startedAt: "2025-11-22" },
  { id: "25700544613", name: "Taifco — شركة الطائف للاستثمار والسياحة", domain: "taifco.com.sa", country: "Saudi Arabia", csmId: "76961168", arr: 565, startedAt: "2025-06-01" },
  { id: "35907460714", name: "SAUDI ANMA HOLDING — انماء السعودية", domain: "anma.com.sa", country: "Saudi Arabia", industry: "Real Estate", employees: 50, csmId: "76961168", arr: 265, startedAt: "2025-07-08" },
  { id: "25532046620", name: "AlAbraaj Restaurants Group", domain: "alabraajgroup.com", country: "Bahrain", industry: "Restaurants", employees: 1200, csmId: "83083504", arr: 31900, startedAt: "2025-07-27" },
  { id: "23589699868", name: "Amakin", domain: "amakin.bh", country: "Bahrain", employees: 50, csmId: "79667619", arr: 15900, startedAt: "2025-05-18" },
  { id: "51533390611", name: "Albawardi", domain: "www.albawardi.com", country: "Saudi Arabia", industry: "Business Supplies & Equipment", employees: 1000, csmId: "76961168", arr: 900, startedAt: "2025-12-21" },
  { id: "22797389218", name: "neo space group", domain: "neospacegroup.com", country: "Saudi Arabia", industry: "Aviation & Aerospace", employees: 40, csmId: "79667619", arr: 105920, startedAt: "2024-10-30", h: { usage: 80, sentiment: 82, support: 78, engagement: 76, relationship: 80 } },
  { id: "22759588729", name: "Total CX", domain: "total-cx.com", country: "Bahrain", employees: 300, csmId: "83083504", arr: 39750, startedAt: "2025-04-20" },
  { id: "22425542705", name: "Almanea — المنيع للتجارة", domain: "almanea.sa", country: "Saudi Arabia", industry: "International Trade & Development", employees: 370, csmId: "76961168", arr: 21, startedAt: "2025-09-18" },
  { id: "21813683275", name: "Salem Bin Mahfouz Foundation | سالم بن محفوظ الأهلية", domain: "sbmf.org.sa", country: "Saudi Arabia", industry: "Fund Raising", employees: 50, csmId: "83083504", arr: 26500, startedAt: "2024-10-28" },
  { id: "18722830900", name: "Gulf Air Group", domain: "gulfairgroup.bh", country: "Bahrain", industry: "Airlines & Aviation", csmId: "83083504", arr: 256764, startedAt: "2024-04-17", h: { usage: 82, sentiment: 80, support: 84, engagement: 78, relationship: 82 } },
  { id: "18150483034", name: "Dar wa Emaar", domain: "darwaemaar.com", country: "Saudi Arabia", industry: "Construction", employees: 200, csmId: "76961168", arr: 37654, startedAt: "2025-12-08" },
  { id: "18149213461", name: "لدن للاستثمار", domain: "ladun.sa", country: "Saudi Arabia", industry: "Real Estate", employees: 250, csmId: "83083504", arr: 60844, startedAt: "2025-02-03", h: { usage: 76, sentiment: 78, support: 80, engagement: 72, relationship: 78 } },
  { id: "17506676850", name: "GCCIA", domain: "gccia.com.sa", country: "Saudi Arabia", industry: "Government Administration", employees: 250, csmId: "79667619", arr: 20085, startedAt: "2025-04-06" },
  { id: "16870368064", name: "Rashid Equestrian & Horseracing Club REHC", domain: "rehc.gov.bh", country: "Bahrain", industry: "Government Administration", csmId: null, arr: 14750, startedAt: "2024-03-28", tags: ["unassigned"] },
  { id: "16675975830", name: "sawaeed", domain: "sawaeed.sa", country: "Saudi Arabia", industry: "Human Resources", employees: 1000, csmId: "79667619", arr: 153852, startedAt: "2024-07-31", h: { usage: 78, sentiment: 76, support: 80, engagement: 74, relationship: 78 } },
  { id: "35865515659", name: "Saudi Radwa Food company", domain: "saudiradwa.com", country: "Saudi Arabia", industry: "Food Production", employees: 500, csmId: "83083504", arr: 19080, startedAt: "2025-09-11" },
  { id: "16563101715", name: "Ministry of Economy and Planning — MEPsaudi", domain: "mep.gov.sa", country: "Saudi Arabia", industry: "Government Administration", employees: 5000, csmId: "83083504", arr: 181110, startedAt: "2025-05-19", h: { usage: 70, sentiment: 74, support: 78, engagement: 68, relationship: 76 } },
  { id: "16416490639", name: "Al-Arabia OOH", domain: "al-arabia.com", country: "Saudi Arabia", industry: "Marketing & Advertising", employees: 170, csmId: "76961168", arr: 8263, startedAt: "2025-08-03" },
  { id: "15842113420", name: "Beyon", domain: "beyon.com", country: "Bahrain", industry: "Telecommunications", employees: 50, csmId: "83083504", arr: 47728, startedAt: "2025-04-20" },
  { id: "15389467144", name: "Ministry of Environment, Water and Agriculture MEWA", domain: "mewa.gov.sa", country: "Saudi Arabia", industry: "Government Administration", employees: 5000, csmId: "79667619", arr: 143116, startedAt: "2025-09-10", h: { usage: 72, sentiment: 75, support: 78, engagement: 70, relationship: 76 } },
  { id: "15389065328", name: "Inovest", domain: "inovest.bh", country: "Bahrain", industry: "Financial Services", employees: 200, csmId: "92324750", arr: 6042, startedAt: "2025-06-17" },
  { id: "10900755784", name: "National Events Center | المركز الوطني للفعاليات", domain: "nec.gov.sa", country: "Saudi Arabia", industry: "Entertainment", employees: 300, csmId: "76961168", arr: 3493, startedAt: "2025-12-14" },
  { id: "10455398535", name: "Arla Foods", domain: "arla.com", country: "Bahrain", industry: "Dairy", employees: 22000, csmId: "79667619", arr: 77831, startedAt: "2025-07-08", h: { usage: 79, sentiment: 80, support: 82, engagement: 76, relationship: 80 } },
  { id: "9070419349", name: "The Bahrain Ship Repairing and Engineering Company", domain: "basrec.com", country: "Bahrain", industry: "Mechanical & Industrial Engineering", employees: 50, csmId: "83083504", arr: 13674, startedAt: "2026-01-28" },
  { id: "9069847714", name: "Propel Consult", domain: "propelconsult.com", country: "Bahrain", industry: "Staffing & Recruiting", employees: 70, csmId: null, arr: 5088, startedAt: "2026-02-11", tags: ["unassigned"] },
  { id: "5569477417", name: "YK Almoayyed & Sons", domain: "almoayyed.com", country: "Bahrain", industry: "Automotive", employees: 5000, csmId: "79667619", arr: 16218, startedAt: "2025-05-18" },
  { id: "5352018460", name: "Shura Council", domain: "shura.bh", country: "Bahrain", industry: "Government Administration", employees: 200, csmId: "83083504", arr: 9946, startedAt: "2025-06-29" },
  { id: "4020147480", name: "Arab Ship Building and Repair Yard (ASRY)", domain: "asry.net", country: "Bahrain", industry: "Maritime", employees: 1500, csmId: "83083504", arr: 117660, startedAt: "2023-12-12", h: { usage: 77, sentiment: 78, support: 80, engagement: 74, relationship: 78 } },
  { id: "16853131039", name: "Khaleeji Commercial Bank B.S.C. البنك الخليجي التجاري", domain: "khaleeji.bank", country: "Bahrain", industry: "Banking", employees: 1000, csmId: "79667619", arr: 60060, startedAt: "2024-03-10", h: { usage: 74, sentiment: 76, support: 78, engagement: 72, relationship: 76 } },
  { id: "4020147401", name: "IKEA", domain: "ikea.com.bh", country: "Bahrain", industry: "Furniture", employees: 100000, csmId: "79667619", arr: 44520, startedAt: "2026-01-28" },
  { id: "4020147366", name: "The Benefit Company", domain: "benefit.bh", country: "Bahrain", industry: "Financial Services", employees: 250, csmId: "83083504", arr: 49926, startedAt: "2025-09-22" },
  { id: "4020204985", name: "Bank of Bahrain & Kuwait", domain: "bbkonline.com", country: "Bahrain", industry: "Banking", employees: 850, csmId: "83083504", arr: 225334, startedAt: "2025-05-18", h: { usage: 80, sentiment: 82, support: 84, engagement: 78, relationship: 82 } },
  { id: "4020183268", name: "Bahrain Development Bank (BDB) بنك البحرين للتنمية", domain: "bdb-bh.com", country: "Bahrain", industry: "Financial Services", employees: 500, csmId: "83083504", arr: 114749, startedAt: "2025-07-09", h: { usage: 76, sentiment: 78, support: 80, engagement: 74, relationship: 78 } },
  { id: "4020153725", name: "GPIC", domain: "gpic.com", country: "Bahrain", employees: 327, csmId: "79667619", arr: 295221, startedAt: "2020-07-07", h: { usage: 82, sentiment: 84, support: 86, engagement: 80, relationship: 84 } },
];

const SEEDS: Seed[] = [...DETAILED, ...AUTO_RAW.map(autoSeed)];

/* ============================================================ ARR ledger
   Build a coherent ledger per seed so the new ARR-history, in-app renewal/
   expansion, and event-based retention features work in sample mode:
     - one `new_business` event (= ARR at the start of the period) dated at
       the account's start date,
     - an `expansion`/`contraction` event mid-quarter when arr ≠ previousArr.
   The client's materialized arr/previousArr/renewal are then derived from the
   ledger — the single source of truth, with no hardcoded year.
   ================================================================== */

// Computed per call (not frozen at module load) so it stays correct if the
// process runs across a quarter boundary — matching the DB recompute path.
function quarterStart(): string {
  return periodBounds(currentQuarter()).start;
}
const SAMPLE_MOVE_DATE = `${quarterStart().slice(0, 7)}-15`; // mid first month of the quarter at seed time

function buildSeedEvents(s: Seed): ArrEvent[] {
  const start = (s.startedAt ?? "2023-01-01").slice(0, 10);
  const base = s.previousArr;
  const createdAt = `${start}T00:00:00.000Z`;
  const events: ArrEvent[] = [
    {
      id: `evt-${s.id}-nb`,
      clientId: s.id,
      type: "new_business",
      amount: base,
      arr: 0,
      effectiveDate: start,
      renewalDate: s.renewalDate,
      source: "hubspot",
      externalId: `seed-deal-${s.id}`,
      note: "Initial contract (Closed Won)",
      createdBy: "HubSpot sync",
      createdAt,
    },
  ];

  const delta = s.arr - s.previousArr;
  if (delta !== 0) {
    events.push({
      id: `evt-${s.id}-mv`,
      clientId: s.id,
      type: delta > 0 ? "expansion" : "contraction",
      amount: delta,
      arr: 0,
      effectiveDate: SAMPLE_MOVE_DATE,
      renewalDate: null,
      source: "manual",
      externalId: null,
      note: delta > 0 ? "Seats added mid-term" : "Scope reduced at review",
      createdBy: csmById(s.csmId)?.name ?? "CSM",
      createdAt: `${SAMPLE_MOVE_DATE}T10:00:00.000Z`,
    });
  }

  if (s.status === "churned") {
    const churnDate = (s.churnedAt ?? SAMPLE_MOVE_DATE).slice(0, 10);
    events.push({
      id: `evt-${s.id}-ch`,
      clientId: s.id,
      type: "churn",
      amount: -s.arr,
      arr: 0,
      effectiveDate: churnDate,
      renewalDate: null,
      source: "manual",
      externalId: null,
      note: "Did not renew",
      createdBy: csmById(s.csmId)?.name ?? "CSM",
      createdAt: `${churnDate}T10:00:00.000Z`,
    });
  }

  return withRunningBalance(events);
}

function materialize(client: Client, events: ArrEvent[]): Client {
  const derived = deriveClientArr(events);
  return {
    ...client,
    arr: derived.arr,
    previousArr: arrAsOf(events, quarterStart()),
    renewalDate: derived.renewalDate ?? client.renewalDate,
    status: client.status === "churned" ? "churned" : derived.status,
    startedAt: derived.startedAt ?? client.startedAt,
    churnedAt: client.churnedAt ?? derived.churnedAt,
  };
}

/* ----------------------------------------------------- contacts & files */

function buildSeedContacts(c: Client): Contact[] {
  const now = "2026-01-01T00:00:00.000Z";
  const host = c.domain ?? `${c.id}.example`;
  const out: Contact[] = [
    {
      id: `ct-${c.id}-1`,
      clientId: c.id,
      hubspotContactId: `hsct-${c.id}-1`,
      firstName: "Account",
      lastName: "Owner",
      email: `procurement@${host}`,
      phone: null,
      jobTitle: "Procurement Lead",
      isPrimary: true,
      createdAt: now,
    },
  ];
  // A second, finance-side contact for larger accounts.
  if (c.arr >= 10000) {
    out.push({
      id: `ct-${c.id}-2`,
      clientId: c.id,
      hubspotContactId: `hsct-${c.id}-2`,
      firstName: "Finance",
      lastName: "Manager",
      email: `finance@${host}`,
      phone: null,
      jobTitle: "Finance Manager",
      isPrimary: false,
      createdAt: now,
    });
  }
  return out;
}

function buildSeedAttachments(c: Client): Attachment[] {
  if (c.arr < 10000) return [];
  return [
    {
      id: `att-${c.id}-1`,
      clientId: c.id,
      hubspotFileId: `hsf-${c.id}-1`,
      dealId: `seed-deal-${c.id}`,
      name: "Signed Agreement.pdf",
      url: null,
      extension: "pdf",
      size: 482_000,
      storagePath: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

/* --------------------------------------------------- the mutable store
   Module-level arrays act as an in-memory store so in-app ARR changes and
   bulk imports work during `next dev` (single process) without a database.
   In production, DATABASE_URL is set and the Drizzle repo is used instead. */

export const SAMPLE_ARR_EVENTS: ArrEvent[] = [];
export const SAMPLE_CONTACTS: Contact[] = [];
export const SAMPLE_ATTACHMENTS: Attachment[] = [];

export const SAMPLE_CLIENTS: Client[] = SEEDS.map((s) => {
  const events = buildSeedEvents(s);
  SAMPLE_ARR_EVENTS.push(...events);
  const client = materialize(makeClient(s), events);
  SAMPLE_CONTACTS.push(...buildSeedContacts(client));
  SAMPLE_ATTACHMENTS.push(...buildSeedAttachments(client));
  return client;
});

export function sampleClientById(id: string): Client | undefined {
  return SAMPLE_CLIENTS.find((c) => c.id === id);
}

export function sampleArrEventsForClient(clientId: string): ArrEvent[] {
  return SAMPLE_ARR_EVENTS.filter((e) => e.clientId === clientId);
}
export function sampleContactsForClient(clientId: string): Contact[] {
  return SAMPLE_CONTACTS.filter((c) => c.clientId === clientId);
}
export function sampleAttachmentsForClient(clientId: string): Attachment[] {
  return SAMPLE_ATTACHMENTS.filter((a) => a.clientId === clientId);
}

/* -------------------------------------------------------- sample deals / emails / meetings */

const _firstClientId = (): string => SAMPLE_CLIENTS[0]?.id ?? "sample-1";
const _secondClientId = (): string => SAMPLE_CLIENTS[1]?.id ?? "sample-2";

export const SAMPLE_DEALS: Deal[] = [
  {
    id: "hs-deal-sample-001",
    clientId: _firstClientId(),
    hubspotDealId: "sample-001",
    name: "Lumofy — Direct Sales Q2 2025",
    amount: 48000,
    closeDate: "2025-04-15T00:00:00.000Z",
    pipeline: "direct",
    referralSource: "Direct Sales",
    ownerName: "Sales Team",
    ownerEmail: "sales@lumofy.com",
    hubspotUrl: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "hs-deal-sample-002",
    clientId: _secondClientId(),
    hubspotDealId: "sample-002",
    name: "Indirect Partner Deal — Q3 2025",
    amount: 24000,
    closeDate: "2025-07-10T00:00:00.000Z",
    pipeline: "indirect",
    referralSource: "Jisr",
    ownerName: "Partner Channel",
    ownerEmail: null,
    hubspotUrl: null,
    createdAt: new Date().toISOString(),
  },
];

export const SAMPLE_EMAILS: Email[] = [
  {
    id: "hse-sample-001",
    clientId: _firstClientId(),
    dealId: "sample-001",
    hubspotEmailId: "sample-001",
    subject: "Welcome to Lumofy — next steps",
    fromEmail: "csm@lumofy.com",
    toEmail: "contact@client.com",
    direction: "OUTBOUND",
    bodySnippet: "Hi team, great to have you on board. Here is what we will cover in your kickoff call this week…",
    sentAt: "2025-04-16T09:00:00.000Z",
    createdAt: new Date().toISOString(),
  },
  {
    id: "hse-sample-002",
    clientId: _firstClientId(),
    dealId: "sample-001",
    hubspotEmailId: "sample-002",
    subject: "RE: Kickoff call recap",
    fromEmail: "contact@client.com",
    toEmail: "csm@lumofy.com",
    direction: "INBOUND",
    bodySnippet: "Thanks for the thorough recap. The team is excited to get started with the onboarding modules.",
    sentAt: "2025-04-18T11:30:00.000Z",
    createdAt: new Date().toISOString(),
  },
];

export const SAMPLE_MEETINGS: Meeting[] = [
  {
    id: "hsm-sample-001",
    clientId: _firstClientId(),
    dealId: "sample-001",
    hubspotMeetingId: "sample-001",
    title: "Kickoff call",
    startTime: "2025-04-17T10:00:00.000Z",
    endTime: "2025-04-17T11:00:00.000Z",
    outcome: "COMPLETED",
    notes: "Introductions, platform walkthrough, agreed on 30-day onboarding milestones.",
    location: "Zoom",
    createdAt: new Date().toISOString(),
  },
];

export function sampleDealsForClient(clientId: string): Deal[] {
  return SAMPLE_DEALS.filter((d) => d.clientId === clientId);
}
export function sampleEmailsForClient(clientId: string): Email[] {
  return SAMPLE_EMAILS.filter((e) => e.clientId === clientId);
}
export function sampleMeetingsForClient(clientId: string): Meeting[] {
  return SAMPLE_MEETINGS.filter((m) => m.clientId === clientId);
}

/* ------------------------------------------------------------ mutators */

function recomputeSampleClient(clientId: string): void {
  const events = sampleArrEventsForClient(clientId);
  const stamped = withRunningBalance(events);
  const balById = new Map(stamped.map((e) => [e.id, e.arr]));
  for (const e of events) e.arr = balById.get(e.id) ?? e.arr;

  const c = SAMPLE_CLIENTS.find((x) => x.id === clientId);
  if (!c) return;
  const derived = deriveClientArr(events);
  c.arr = derived.arr;
  c.previousArr = arrAsOf(events, quarterStart());
  if (derived.renewalDate) c.renewalDate = derived.renewalDate;
  c.status = derived.status;
  c.churnedAt = derived.churnedAt;
  if (derived.startedAt) c.startedAt = derived.startedAt;
}

/** Append an ARR event to the sample store and re-materialize the client. */
export function sampleAppendArrEvent(e: ArrEvent): void {
  SAMPLE_ARR_EVENTS.push(e);
  recomputeSampleClient(e.clientId);
}

/** Upsert a client into the sample store (used by bulk import in dev). */
export function sampleUpsertClient(c: Client): void {
  const i = SAMPLE_CLIENTS.findIndex((x) => x.id === c.id);
  if (i >= 0) SAMPLE_CLIENTS[i] = c;
  else SAMPLE_CLIENTS.push(c);
}

/** Bulk-import clients + their baseline events into the sample store. */
export function sampleImportClients(payload: { clients: Client[]; baselineEvents: ArrEvent[] }): void {
  for (const c of payload.clients) sampleUpsertClient(c);
  SAMPLE_ARR_EVENTS.push(...payload.baselineEvents);
  for (const c of payload.clients) recomputeSampleClient(c.id);
}

/* ------------------------------------------------------------- playbooks */

export const SAMPLE_PLAYBOOKS: Playbook[] = [
  {
    id: "pb-onboarding",
    name: "30-day onboarding",
    description: "Guide a new ARR account from kickoff to first value within 30 days.",
    trigger: "manual",
    active: true,
    steps: [
      { id: "ob-1", title: "Kickoff call scheduled", dueOffsetDays: 2 },
      { id: "ob-2", title: "Admin & SSO configured", dueOffsetDays: 5 },
      { id: "ob-3", title: "First learning path published", dueOffsetDays: 10 },
      { id: "ob-4", title: "50% of seats activated", dueOffsetDays: 21 },
      { id: "ob-5", title: "30-day value review", dueOffsetDays: 30 },
    ],
  },
  {
    id: "pb-at-risk",
    name: "At-risk recovery",
    description: "Triggered when health drops below 55. Stabilize and rebuild adoption.",
    trigger: "health_below",
    triggerValue: 55,
    active: true,
    steps: [
      { id: "ar-1", title: "Root-cause review of usage drop", dueOffsetDays: 3 },
      { id: "ar-2", title: "Exec check-in booked", dueOffsetDays: 7 },
      { id: "ar-3", title: "90-day recovery plan agreed", dueOffsetDays: 14 },
      { id: "ar-4", title: "Re-enablement session delivered", dueOffsetDays: 21 },
    ],
  },
  {
    id: "pb-renewal",
    name: "Renewal — 90 days out",
    description: "Triggered 90 days before renewal. Secure the renewal and surface expansion.",
    trigger: "renewal_within",
    triggerValue: 90,
    active: true,
    steps: [
      { id: "rn-1", title: "Value/ROI summary prepared", dueOffsetDays: 5 },
      { id: "rn-2", title: "Renewal proposal sent", dueOffsetDays: 30 },
      { id: "rn-3", title: "Expansion opportunity qualified", dueOffsetDays: 45 },
      { id: "rn-4", title: "Renewal closed", dueOffsetDays: 85 },
    ],
  },
];

export const SAMPLE_TASKS: PlaybookTask[] = [
  { id: "t1", clientId: "36019859787", playbookId: "pb-at-risk", stepId: "ar-1", title: "Root-cause review of usage drop", status: "done", dueDate: "2026-06-05", ownerId: "76961168", completedAt: "2026-06-04" },
  { id: "t2", clientId: "36019859787", playbookId: "pb-at-risk", stepId: "ar-2", title: "Exec check-in booked", status: "in_progress", dueDate: "2026-06-18", ownerId: "76961168", completedAt: null },
  { id: "t3", clientId: "43636566690", playbookId: "pb-renewal", stepId: "rn-1", title: "Value/ROI summary prepared", status: "todo", dueDate: "2026-06-20", ownerId: "76961168", completedAt: null },
  { id: "t4", clientId: "52032202114", playbookId: "pb-onboarding", stepId: "ob-3", title: "First learning path published", status: "todo", dueDate: "2026-06-19", ownerId: null, completedAt: null },
];

export const SAMPLE_TIMELINE: TimelineEvent[] = [
  { id: "e1", clientId: "36019859787", type: "health_change", title: "Health dropped to At risk (41)", body: "WAU down 60% over 8 weeks; CSAT fell to 62%.", at: "2026-06-13T09:00:00.000Z" },
  { id: "e2", clientId: "36019859787", type: "playbook", title: "At-risk recovery playbook started", author: "Batool Momani", at: "2026-06-04T10:00:00.000Z" },
  { id: "e3", clientId: "43636566690", type: "renewal", title: "Renewal due 2026-08-15", body: "$6,987 ARR up for renewal in 61 days.", at: "2026-06-15T00:00:00.000Z" },
  { id: "e4", clientId: "48066915105", type: "usage", title: "Crossed 85% seat activation", body: "104 of 120 seats active this month.", at: "2026-06-12T08:00:00.000Z" },
  { id: "e5", clientId: "35871248024", type: "note", title: "Expansion opportunity identified", body: "Customer requesting 30 additional seats — upsell conversation scheduled.", author: "Batool Momani", at: "2026-06-10T12:30:00.000Z" },
];

export function tasksForClient(clientId: string): PlaybookTask[] {
  return SAMPLE_TASKS.filter((t) => t.clientId === clientId);
}

export function timelineForClient(clientId: string): TimelineEvent[] {
  return SAMPLE_TIMELINE.filter((e) => e.clientId === clientId).sort((a, b) => b.at.localeCompare(a.at));
}
