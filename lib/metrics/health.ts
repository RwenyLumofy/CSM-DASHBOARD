import type { HealthComponents, HealthScore, HealthTier } from "@/lib/types";

/**
 * Composite health weighting. Usage and sentiment carry the most signal for a
 * learning-platform account; relationship/renewal proximity is a tie-breaker.
 * Weights sum to 1.
 */
export const HEALTH_WEIGHTS: Record<keyof HealthComponents, number> = {
  usage: 0.3,
  sentiment: 0.25,
  support: 0.2,
  engagement: 0.15,
  relationship: 0.1,
};

export function tierForScore(score: number): HealthTier {
  if (score >= 75) return "healthy";
  if (score >= 55) return "watch";
  return "at_risk";
}

export function scoreFromComponents(c: HealthComponents): number {
  const raw =
    c.usage * HEALTH_WEIGHTS.usage +
    c.sentiment * HEALTH_WEIGHTS.sentiment +
    c.support * HEALTH_WEIGHTS.support +
    c.engagement * HEALTH_WEIGHTS.engagement +
    c.relationship * HEALTH_WEIGHTS.relationship;
  return Math.round(raw);
}

export function buildHealth(
  components: HealthComponents,
  opts: { trend?: number; updatedAt?: string } = {},
): HealthScore {
  const score = scoreFromComponents(components);
  return {
    score,
    tier: tierForScore(score),
    components,
    trend: opts.trend ?? 0,
    updatedAt: opts.updatedAt ?? new Date(0).toISOString(),
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
