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
  const tier = resolveTier(score, config.tiers);
  return {
    score,
    tier: tier.name,
    tierColor: tier.color,
    components,
    trend: opts.trend ?? 0,
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  };
}
