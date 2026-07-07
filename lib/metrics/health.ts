import type { HealthComponents, HealthScore, HealthTier, SupportSummary } from "@/lib/types";
import type { ClientHealthConfig, HealthMetricConfig } from "@/lib/metrics/health-config";
import type { OnboardingPeriod } from "@/lib/metrics/onboarding";
import type { CompletenessSeverity } from "@/lib/profile-completeness";
import { normalizeCsat } from "@/lib/metrics/portfolio";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

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
      const { csat, csatScale, csatResponses } = inputs.support;
      if (csat == null || csatResponses === 0) return null;
      return clamp(normalizeCsat(csat, csatScale));
    }

    case "nps": {
      const { nps } = inputs.support;
      if (nps == null) return null;
      return clamp((nps + 100) / 2);
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

/** Score cutoffs → tier. Thresholds are admin-configurable (ClientHealthConfig.thresholds). */
export function tierForScore(score: number, thresholds: { healthy: number; watch: number }): HealthTier {
  if (score >= thresholds.healthy) return "healthy";
  if (score >= thresholds.watch) return "watch";
  return "at_risk";
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
  return {
    score,
    tier: tierForScore(score, config.thresholds),
    components,
    trend: opts.trend ?? 0,
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  };
}

/** Brand tone token for a health tier (drives Badge / accents). */
export function tierTone(tier: HealthTier): "aurora" | "stellar" | "nova" {
  switch (tier) {
    case "healthy":
      return "aurora";
    case "watch":
      return "stellar";
    case "at_risk":
      return "nova";
  }
}

export function tierLabel(tier: HealthTier): string {
  switch (tier) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch";
    case "at_risk":
      return "At risk";
  }
}
