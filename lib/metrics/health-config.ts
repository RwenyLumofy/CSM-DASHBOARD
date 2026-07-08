/* =========================================================================
   Client health formula configuration — a super-admin selects which of the
   8 available metrics count, assigns weights among the ones turned on, sets
   a couple of per-metric tunables, and picks the tier thresholds.

   PURE data/types/constants ONLY — no DB or server imports, so this file is
   safe to import from client components (WorkflowManager, ClientProfileTabs).
   The DB-backed accessors (getClientHealthConfig / setClientHealthConfig)
   live in the server-only lib/assignment/config.ts, alongside the assignment
   workflow config accessors that share the same workspace_config mechanism.
   ========================================================================= */

import type { HealthMetricKey } from "@/lib/types";

export const CLIENT_HEALTH_CONFIG_KEY = "client_health_formula";

export interface HealthMetricConfig {
  key: HealthMetricKey;
  /** Whether this metric counts toward the formula at all. A disabled metric
   *  is excluded from every client unconditionally — unlike a metric with no
   *  data for one particular client, which is excluded only for that client
   *  (see computeHealthScore in lib/metrics/health.ts). */
  enabled: boolean;
  /** 0–100, admin-set. Renormalized against the other enabled weights so the
   *  enabled set always sums to 100% of the score — meaningless while
   *  !enabled. */
  weight: number;
  /** Per-metric tunables — only sla_breaches and onboarding_period use these. */
  params?: {
    /** sla_breaches: open-breach count at which the sub-score bottoms out at 0. */
    maxBreaches?: number;
    /** onboarding_period: days at/under which the sub-score is 100. */
    targetDays?: number;
    /** onboarding_period: days at/over which the sub-score is 0. */
    maxDays?: number;
  };
}

export interface ClientHealthConfig {
  /** Always all 8 keys, in display order — enabled flags/weights vary. */
  metrics: HealthMetricConfig[];
  /** Score cutoffs: score >= healthy -> "healthy" tier, >= watch -> "watch", else "at_risk". */
  thresholds: { healthy: number; watch: number };
}

export const HEALTH_METRIC_LABELS: Record<HealthMetricKey, string> = {
  usage: "Usage",
  csat: "CSAT",
  nps: "NPS",
  sla_breaches: "Breached SLA tickets",
  onboarding_period: "Onboarding period",
  use_case_set: "Use case set",
  profile_complete: "Profile complete",
  stakeholder_mapping: "Stakeholder mapping",
};

export const HEALTH_METRIC_ORDER: HealthMetricKey[] = [
  "usage",
  "csat",
  "nps",
  "sla_breaches",
  "onboarding_period",
  "use_case_set",
  "profile_complete",
  "stakeholder_mapping",
];

/** Equal weight across all 8, all enabled — a neutral starting point the
 *  admin tunes from Settings → Workflows → Client health. Thresholds match
 *  the tiers this app has always used. */
export const DEFAULT_CLIENT_HEALTH_CONFIG: ClientHealthConfig = {
  metrics: HEALTH_METRIC_ORDER.map((key) => ({
    key,
    enabled: true,
    weight: 12.5,
    params:
      key === "sla_breaches"
        ? { maxBreaches: 5 }
        : key === "onboarding_period"
          ? { targetDays: 30, maxDays: 90 }
          : undefined,
  })),
  thresholds: { healthy: 75, watch: 55 },
};
