import type { HealthComponents, HealthScore, SupportSummary } from "@/lib/types";
import type { ClientHealthConfig, HealthMetricConfig, HealthTierDef } from "@/lib/metrics/health-config";
import { DEFAULT_HEALTH_TIERS } from "@/lib/metrics/health-config";
import type { OnboardingPeriod } from "@/lib/metrics/onboarding";
import type { CompletenessSeverity } from "@/lib/profile-completeness";
import { normalizeCsat } from "@/lib/metrics/portfolio";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Linear 0–100 score between two admin-set cutoffs: at/below zeroAt → 0
 *  ("nothing"), at/over fullAt → 100 ("full"), linear in between
 *  ("partial"). Guards the degenerate zeroAt === fullAt as a step function. */
const scoreWithCutoffs = (value: number, zeroAt: number, fullAt: number) =>
  fullAt === zeroAt ? (value >= fullAt ? 100 : 0) : clamp(((value - zeroAt) / (fullAt - zeroAt)) * 100);

/** Everything computeHealthScore needs, already resolved by the caller
 *  (lib/repo/drizzle.ts recomputeClientHealth) — this function itself does
 *  no I/O, so it's easy to test/tune in isolation. */
export interface HealthComputeInputs {
  support: SupportSummary;
  /** AdoptionScore.score (0–100) from getClientUsage, or null when usage is
   *  unavailable/unlinked for this account. */
  usageScore: number | null;
  profileSeverity: CompletenessSeverity;
  useCasesSet: boolean;
  stakeholderMapped: boolean;
  onboarding: OnboardingPeriod;
  /** The account's CS Pulse as a 0–100 score, or null when none is recorded.
   *  Computed from the stored ratings against the configured dimensions and
   *  tiers — see pulseScore in lib/health/pulse.ts. */
  pulseScore: number | null;
  /** Whole days since that Pulse was recorded, or null when there is none.
   *  Compared against the metric's validityDays: a Pulse older than that stops
   *  counting, because it is a judgement made on a date rather than a
   *  standing fact about the account. */
  pulseAgeDays: number | null;
  /** Pulse dimension ids the CSM rated Critical — see PULSE_CRITICAL_CAPS. */
  pulseCriticalDimensions?: string[] | null;
}

/**
 * CS Pulse dimensions where a Critical rating caps the tier at the lowest one,
 * whatever the weighted score says.
 *
 * WHY. On 2026-08-03 nine accounts carried a Critical on renewal or engagement
 * and eight of them read Healthy or Watch. YK Almoayyed & Sons was rated
 * Critical on all three — no sponsor, gone dark, active churn risk, a Pulse of
 * 0 — and showed "Healthy, 61", because five record-keeping metrics sat at 100
 * and outvoted it. A CSM recording the most alarming assessment the tool allows
 * must not be overruled by tidy paperwork.
 *
 * Renewal and engagement only. Both are statements about the CUSTOMER's
 * trajectory — "active churn risk", "gone dark; success plan stalled". A
 * Critical on stakeholder coverage ("single point of contact; no sponsor") is a
 * real risk to US, but it describes our coverage rather than their intent, and
 * it is recoverable without the customer doing anything. Capping on it would
 * fire on accounts nobody is worried about.
 *
 * The SCORE is deliberately left alone. Overwriting 61 with a lower number
 * would hide what the metrics actually said and break trend comparisons; the
 * cap is a statement about the tier, and `cappedBy` records why so the UI can
 * explain a 61 sitting next to "At risk".
 */
export const PULSE_CRITICAL_CAPS = ["renewal", "engagement"] as const;

/** The lowest configured tier — what a cap drops an account to. */
function lowestTier(tiers: HealthTierDef[]): HealthTierDef {
  const ordered = [...(tiers.length ? tiers : DEFAULT_HEALTH_TIERS)].sort((a, b) => a.minScore - b.minScore);
  return ordered[0]!;
}

/** One metric's 0–100 sub-score, or null when it has no data for this client
 *  (excluded from the weighted sum, not faked as a neutral value — see
 *  computeHealthScore). */
function subscoreFor(m: HealthMetricConfig, inputs: HealthComputeInputs): number | null {
  switch (m.key) {
    case "usage":
      return inputs.usageScore != null ? clamp(inputs.usageScore) : null;

    case "csat": {
      // Tickets CSAT — Intercom conversation ratings (post-support-interaction).
      const { csat, csatScale, csatResponses } = inputs.support;
      if (csat == null || csatResponses === 0) return null;
      const value = normalizeCsat(csat, csatScale);
      return scoreWithCutoffs(value, m.params?.zeroAt ?? 0, m.params?.fullAt ?? 100);
    }

    case "platform_csat": {
      // Platform CSAT — the outbound survey's satisfaction question. Already
      // stored as a 0–100 "% satisfied" figure (see summarizeSurveys in
      // lib/integrations/intercom-surveys.ts), so no scale normalization
      // needed, unlike csat above.
      const { platformCsat, platformCsatResponses } = inputs.support;
      if (platformCsat == null || platformCsatResponses === 0) return null;
      return scoreWithCutoffs(platformCsat, m.params?.zeroAt ?? 0, m.params?.fullAt ?? 100);
    }

    case "nps": {
      const { nps } = inputs.support;
      if (nps == null) return null;
      return scoreWithCutoffs(nps, m.params?.zeroAt ?? -100, m.params?.fullAt ?? 100);
    }

    case "sla_breaches": {
      if (inputs.support.supportLevelUsed == null) return null; // SLA not evaluated for this account
      const max = Math.max(1, m.params?.maxBreaches ?? 5);
      return clamp(100 - (Math.min(max, inputs.support.slaBreaches.length) / max) * 100);
    }

    case "onboarding_period": {
      const { days } = inputs.onboarding;
      if (days == null) return null;
      const target = m.params?.targetDays ?? 30;
      const max = Math.max(target + 1, m.params?.maxDays ?? 90);
      if (days <= target) return 100;
      if (days >= max) return 0;
      return clamp(100 - ((days - target) / (max - target)) * 100);
    }

    case "use_case_set":
      return inputs.useCasesSet ? 100 : 0;

    case "profile_complete":
      // Binary, per how this metric was described when the formula was
      // scoped: "incomplete profile if yes or not" — not the 3-tier
      // red/yellow/none gradation profile-completeness normally shows.
      return inputs.profileSeverity === "none" ? 100 : 0;

    case "stakeholder_mapping":
      return inputs.stakeholderMapped ? 100 : 0;

    /* The CSM's own read of the account, scored like any other signal.
       NULL, NOT ZERO, when there is no Pulse or the Pulse has lapsed — the
       same rule every other metric follows here, so an unassessed account is
       excluded from this metric rather than punished by it. Zeroing would
       repeat what stakeholder_mapping already does to the portfolio in
       lib/metrics/health-drag.ts, where a field almost nobody fills in drags
       every score down for a reason that has nothing to do with the account. */
    case "cs_pulse": {
      if (inputs.pulseScore == null) return null;
      const days = m.params?.validityDays;
      if (days != null && inputs.pulseAgeDays != null && inputs.pulseAgeDays > days) return null;
      return clamp(inputs.pulseScore);
    }
  }
}

/** Resolve a 0–100 score to its tier: the highest tier whose minScore it meets.
 *  Tiers are admin-defined (ClientHealthConfig.tiers) and may be any set of
 *  names/cutoffs. Falls back to a sane default if the config somehow has none. */
export function resolveTier(score: number, tiers: HealthTierDef[]): HealthTierDef {
  const ordered = [...(tiers.length ? tiers : DEFAULT_HEALTH_TIERS)].sort((a, b) => b.minScore - a.minScore);
  return ordered.find((t) => score >= t.minScore) ?? ordered[ordered.length - 1]!;
}

/**
 * Weighted sum of whichever enabled metrics have data for this client. A
 * disabled metric never participates; an enabled metric with no data for
 * THIS client is skipped and the other enabled weights are renormalized —
 * so one universally-empty signal (e.g. NPS today) never drags every
 * client's score down, and no metric is ever faked with a neutral filler
 * value. A client with zero available metrics gets score 0.
 */
export function computeHealthScore(
  inputs: HealthComputeInputs,
  config: ClientHealthConfig,
  opts: { trend?: number; updatedAt?: string } = {},
): HealthScore {
  const components: HealthComponents = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const m of config.metrics) {
    if (!m.enabled) continue;
    const sub = subscoreFor(m, inputs);
    if (sub == null) continue;
    components[m.key] = sub;
    weightedSum += sub * m.weight;
    weightTotal += m.weight;
  }

  const score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  let tier = resolveTier(score, config.tiers);

  /* A Critical on renewal or engagement caps the tier — but only when the Pulse
     is actually counting. `components.cs_pulse` is present exactly when the
     Pulse was fresh and complete enough to score, so keying off it means a
     lapsed Pulse stops capping at the same moment it stops contributing. A
     judgement made 90 days ago should not pin an account to At risk forever. */
  const capped = components.cs_pulse != null
    ? (inputs.pulseCriticalDimensions ?? []).filter((d) => (PULSE_CRITICAL_CAPS as readonly string[]).includes(d))
    : [];
  if (capped.length) tier = lowestTier(config.tiers);

  return {
    score,
    tier: tier.name,
    tierColor: tier.color,
    components,
    trend: opts.trend ?? 0,
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
    ...(capped.length ? { cappedBy: capped } : {}),
  };
}
