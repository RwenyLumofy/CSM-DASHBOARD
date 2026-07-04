import type { HealthComponents, SupportSummary, UsageMetrics } from "@/lib/types";
import { normalizeCsat } from "@/lib/metrics/portfolio";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Derive the five health components (0–100 each) from the merged signals so
 * synced accounts get a real composite score. Heuristics are intentionally
 * transparent and easy to tune.
 */
export function deriveComponents(args: {
  support: SupportSummary;
  usage: UsageMetrics;
  hasCsm: boolean;
  daysToRenewal: number | null;
  tags?: string[];
}): HealthComponents {
  const { support, usage, hasCsm, daysToRenewal, tags = [] } = args;

  // Usage: adoption weighted higher than stickiness.
  const usageScore = clamp(usage.adoptionRate * 70 + usage.stickiness * 30 + (usage.adoptionRate > 0 ? 0 : 0));

  // Sentiment: blend CSAT and NPS where available.
  const csat = support.csat != null ? normalizeCsat(support.csat, support.csatScale) : null;
  const npsScaled = support.nps != null ? (support.nps + 100) / 2 : null;
  let sentiment: number;
  if (csat != null && npsScaled != null) sentiment = clamp(csat * 0.6 + npsScaled * 0.4);
  else if (csat != null) sentiment = clamp(csat);
  else if (npsScaled != null) sentiment = clamp(npsScaled);
  else sentiment = 60;

  // Support: start healthy, subtract penalties for load and slowness.
  let supportScore = 100;
  supportScore -= Math.min(40, support.openTickets * 6);
  if ((support.oldestOpenDays ?? 0) > 14) supportScore -= 20;
  if ((support.medianFirstResponseHours ?? 0) > 8) supportScore -= 15;
  supportScore = clamp(supportScore);

  // Engagement: stickiness + recency of last activity.
  const recency = recencyScore(usage.lastActiveAt);
  const engagement = clamp(usage.stickiness * 100 * 0.5 + recency * 0.5);

  // Relationship: ownership + renewal proximity + advocacy.
  let relationship = 60 + (hasCsm ? 15 : -12);
  if (daysToRenewal != null && daysToRenewal <= 30) relationship -= 6;
  if (tags.includes("advocate") || tags.includes("reference-able")) relationship += 10;
  relationship = clamp(relationship);

  return { usage: usageScore, sentiment, support: supportScore, engagement, relationship };
}

function recencyScore(lastActiveAt: string | null): number {
  if (!lastActiveAt) return 20;
  const days = (Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000;
  if (days <= 7) return 100;
  if (days <= 30) return 60;
  if (days <= 60) return 35;
  return 15;
}
