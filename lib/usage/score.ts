/* Adoption Score — the CSM verdict at the top of the Usage tab.
   Pure function of the current snapshot + which modules the company OWNS
   (from the account "Module"/package property), so it's easy to test.

   score = 45% activation + 35% module adoption + 20% momentum
     activation     = active-in-30d (MAU) as a share of seats (fallback: roster)
     module adoption = of the modules the company BOUGHT, how many show real use
     momentum       = are people active right now (this week) vs only this month

   The 3 Lumofy modules and the account features that map to each:
     Develop — learning, pathways, quizzes, talent & AI assessments, live sessions
     Perform — performance-management cycles
     Engage  — employee surveys (eNPS + custom surveys)
   The Competency Framework is a SHARED feature: its usage counts toward whichever
   of Develop / Perform the company owns (per the account Module property). */

import type { AdoptionScore, ModuleKey, UsagePeriodMetrics, UsageSnapshotRow, UsageTier } from "@/lib/usage/types";

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ── package feature → module ownership ─────────────────────────────────────
   The account "Module" property (client.properties.package) holds granular
   feature names, not the 3 module names — so we map. Matching is case- and
   whitespace-insensitive and tolerates the known "Competnecy" typo. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const DEVELOP_FEATURES = [
  "learning (authoring tool)", "lumofy library", "talent assessments", "custom assessment development",
  "custom content development", "lumofy content dispatching", "lumofy content dispatch", "go1", "develop",
].map(norm);
const PERFORM_FEATURES = ["performance management", "perform"].map(norm);
const ENGAGE_FEATURES = ["engagement surveys", "engage"].map(norm);
const COMPETENCY_FEATURES = ["competnecy framework builder", "competency framework builder"].map(norm);

export interface OwnedModules {
  develop: boolean;
  perform: boolean;
  engage: boolean;
  competency: boolean;
}

/** Derive which of the 3 modules a company owns from its package feature list.
 *  If nothing maps (missing/unknown package), assume it owns all three so the
 *  score doesn't over-credit a blank account. */
export function ownedModulesFromPackage(pkg: unknown): OwnedModules {
  const features = (Array.isArray(pkg) ? pkg : []).map((f) => norm(String(f)));
  const has = (set: string[]) => features.some((f) => set.includes(f));
  const develop = has(DEVELOP_FEATURES);
  const perform = has(PERFORM_FEATURES);
  const engage = has(ENGAGE_FEATURES);
  const competency = has(COMPETENCY_FEATURES);
  if (!develop && !perform && !engage) return { develop: true, perform: true, engage: true, competency };
  return { develop, perform, engage, competency };
}

const MODULE_LABEL: Record<ModuleKey, string> = { develop: "Develop", perform: "Perform", engage: "Engage" };

export function computeAdoptionScore(m: UsageSnapshotRow, owned: OwnedModules): AdoptionScore {
  const denom = m.seats > 0 ? m.seats : m.total_users;
  const activation = denom > 0 ? clampPct((100 * m.mau) / denom) : 0;

  // Is each module actually USED? Competency framework usage counts toward
  // whichever of Develop / Perform the company owns (shared feature).
  const hasCompetency = m.competencies_total > 0;
  const developUsed =
    m.learning_enrollments > 0 || m.pathway_enrollments > 0 || m.quiz_enrollments > 0 ||
    m.talent_assessment_enrollments > 0 || m.ai_assessment_enrollments > 0 || m.sessions_created > 0 ||
    (hasCompetency && owned.develop);
  const performUsed = m.pm_cycles_configured > 0 || (hasCompetency && owned.perform);
  const engageUsed = m.enps_cycles > 0 || m.survey_cycles > 0;

  const used: Record<ModuleKey, boolean> = { develop: developUsed, perform: performUsed, engage: engageUsed };
  const modules: AdoptionScore["modules"] = {
    develop: { owned: owned.develop, used: developUsed },
    perform: { owned: owned.perform, used: performUsed },
    engage: { owned: owned.engage, used: engageUsed },
  };

  // Module adoption = of the modules they BOUGHT, how many are actually used.
  const ownedKeys = (Object.keys(modules) as ModuleKey[]).filter((k) => modules[k].owned);
  const usedOwned = ownedKeys.filter((k) => used[k]);
  const breadth = ownedKeys.length > 0 ? clampPct((usedOwned.length / ownedKeys.length) * 100) : 0;

  const recency = m.wau > 0 ? 100 : m.mau > 0 ? 55 : 0;

  const score = clampPct(0.45 * activation + 0.35 * breadth + 0.2 * recency);
  const tier: UsageTier = score >= 75 ? "thriving" : score >= 50 ? "growing" : score >= 25 ? "at_risk" : "dormant";

  return { score, tier, verdict: verdictFor(m, { activation }, modules, ownedKeys, usedOwned, tier), parts: { activation, breadth, recency }, modules };
}

function verdictFor(
  m: UsageSnapshotRow,
  parts: { activation: number },
  modules: AdoptionScore["modules"],
  ownedKeys: ModuleKey[],
  usedOwned: ModuleKey[],
  tier: UsageTier,
): string {
  if (m.total_users === 0 && m.competencies_total === 0) {
    return "No platform activity yet — the environment is provisioned but not set up.";
  }

  const seatBase = m.seats || m.total_users;
  const activationPhrase = `${m.mau.toLocaleString()} of ${seatBase.toLocaleString()} seats active in 30d (${parts.activation}%)`;
  const ownedUnused = ownedKeys.filter((k) => !modules[k].used).map((k) => MODULE_LABEL[k]);

  if (tier === "thriving") {
    return `Healthy adoption — ${activationPhrase}, and all ${ownedKeys.length} purchased module${ownedKeys.length === 1 ? "" : "s"} (${ownedKeys.map((k) => MODULE_LABEL[k]).join(", ")}) are in use.`;
  }
  if (tier === "dormant") {
    return m.wau === 0 && m.mau === 0
      ? `Dormant — no logins in the last 30 days despite ${m.total_users.toLocaleString()} provisioned users.`
      : `Very low adoption — ${activationPhrase}${ownedUnused.length ? `; ${ownedUnused.join(" and ")} unused` : ""}.`;
  }
  // growing / at_risk
  const strength = m.wau > 0 ? "users are logging in" : m.competencies_ai_generated > 0 ? "the competency framework is built" : "setup has started";
  const gap = ownedUnused.length
    ? `but ${ownedUnused.join(" and ")} ${ownedUnused.length === 1 ? "is" : "are"} not being used yet`
    : `using every module they own (${ownedKeys.map((k) => MODULE_LABEL[k]).join(", ")}) — the lever now is getting more seats active`;
  return `${activationPhrase} — ${strength}, ${gap}. Activation opportunity.`;
}

/** The Adoption Score for the Usage tab's timeline filter — same 45/35/20
 *  weighting and module-ownership rules as computeAdoptionScore(), but every
 *  input is rebounded to the selected period instead of "now":
 *
 *    activation = period active users ÷ CURRENT seats (seats have no history
 *                 to reconstruct, so the denominator stays "as of today" —
 *                 only the numerator, real usage, is period-scoped)
 *    breadth    = of the modules they own, how many had ANY activity in THIS
 *                 period (not lifetime)
 *    momentum   = did activity persist into the period's closing days, or
 *                 taper off earlier — the same "how recently, within the
 *                 window, was the last sign of life" question
 *                 computeAdoptionScore() asks of "now", rebased to the
 *                 period's own end instead of today. */
export function computePeriodAdoptionScore(p: UsagePeriodMetrics, trend: { day: string; value: number }[], seatBase: number, owned: OwnedModules): AdoptionScore {
  const activation = seatBase > 0 ? clampPct((100 * p.active_users) / seatBase) : 0;

  const hasCompetency = p.competencies_created > 0;
  const developUsed =
    p.learning_enrollments > 0 || p.pathway_enrollments > 0 || p.quiz_enrollments > 0 ||
    p.talent_assessment_enrollments > 0 || p.ai_assessment_enrollments > 0 || p.sessions_created > 0 ||
    (hasCompetency && owned.develop);
  const performUsed = p.pm_cycles_configured > 0 || (hasCompetency && owned.perform);
  // Response counts (not cycle counts, unlike computeAdoptionScore) — cycle
  // configuration has no schema-verified date to bound; a response IS the
  // real usage signal for "did Engage get used in this window".
  const engageUsed = p.enps_responses > 0 || p.survey_responses > 0;

  const used: Record<ModuleKey, boolean> = { develop: developUsed, perform: performUsed, engage: engageUsed };
  const modules: AdoptionScore["modules"] = {
    develop: { owned: owned.develop, used: developUsed },
    perform: { owned: owned.perform, used: performUsed },
    engage: { owned: owned.engage, used: engageUsed },
  };

  const ownedKeys = (Object.keys(modules) as ModuleKey[]).filter((k) => modules[k].owned);
  const usedOwned = ownedKeys.filter((k) => used[k]);
  const breadth = ownedKeys.length > 0 ? clampPct((usedOwned.length / ownedKeys.length) * 100) : 0;

  const lastActiveIndex = trend.reduce((last, d, i) => (d.value > 0 ? i : last), -1);
  const closingSliceStart = Math.floor(trend.length * 0.75);
  const recency = lastActiveIndex < 0 ? 0 : lastActiveIndex >= closingSliceStart ? 100 : 55;

  const score = clampPct(0.45 * activation + 0.35 * breadth + 0.2 * recency);
  const tier: UsageTier = score >= 75 ? "thriving" : score >= 50 ? "growing" : score >= 25 ? "at_risk" : "dormant";

  return {
    score,
    tier,
    verdict: periodVerdictFor(p, { activation }, modules, ownedKeys, usedOwned, tier, seatBase),
    parts: { activation, breadth, recency },
    modules,
  };
}

function periodVerdictFor(
  p: UsagePeriodMetrics,
  parts: { activation: number },
  modules: AdoptionScore["modules"],
  ownedKeys: ModuleKey[],
  usedOwned: ModuleKey[],
  tier: UsageTier,
  seatBase: number,
): string {
  if (p.active_users === 0) {
    return "No activity recorded in this period.";
  }
  const activationPhrase = `${p.active_users.toLocaleString()} of ${seatBase.toLocaleString()} seats active this period (${parts.activation}%)`;
  const ownedUnused = ownedKeys.filter((k) => !modules[k].used).map((k) => MODULE_LABEL[k]);

  if (tier === "thriving") {
    return `Healthy adoption this period — ${activationPhrase}, and all ${ownedKeys.length} purchased module${ownedKeys.length === 1 ? "" : "s"} (${ownedKeys.map((k) => MODULE_LABEL[k]).join(", ")}) saw use.`;
  }
  if (tier === "dormant") {
    return `Very low adoption this period — ${activationPhrase}${ownedUnused.length ? `; ${ownedUnused.join(" and ")} unused` : ""}.`;
  }
  const gap = ownedUnused.length
    ? `but ${ownedUnused.join(" and ")} ${ownedUnused.length === 1 ? "wasn't" : "weren't"} used this period`
    : `using every module they own (${ownedKeys.map((k) => MODULE_LABEL[k]).join(", ")}) this period`;
  return `${activationPhrase} — ${gap}.`;
}
