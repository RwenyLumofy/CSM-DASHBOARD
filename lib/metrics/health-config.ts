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

/** One admin-defined health tier. Tiers are ordered high→low by minScore; a
 *  score lands in the highest tier whose minScore it meets. The lowest tier
 *  should have minScore 0 so every score has a home. */
export interface HealthTierDef {
  /** Stable key for React lists + config diffing — not shown to users. */
  id: string;
  /** Display label, admin-set (e.g. "Healthy", "Champion", "Critical"). */
  name: string;
  /** Inclusive lower score bound. */
  minScore: number;
  /** Hex color driving the score dial, dot, and badge for this tier. */
  color: string;
}

export interface ClientHealthConfig {
  /** Always all 8 keys, in display order — enabled flags/weights vary. */
  metrics: HealthMetricConfig[];
  /** Admin-defined tiers (add/remove/rename), ordered high→low by minScore. */
  tiers: HealthTierDef[];
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

/** Plain-language "how this is measured" guide shown under each metric in the
 *  builder, so a super-admin knows exactly what they're weighting. */
export const HEALTH_METRIC_HELP: Record<HealthMetricKey, string> = {
  usage: "Product adoption score (0–100) from the Usage tab — activation, breadth of modules used, and recent momentum. Skipped if the account isn't linked to a Lumofy environment.",
  csat: "Latest CSAT — the % of Intercom conversation ratings that were satisfied (4–5★). Skipped if the account has no ratings yet.",
  nps: "Latest NPS, rescaled to 0–100 as (NPS + 100) ÷ 2. Skipped until an NPS source is connected (none today).",
  sla_breaches: "How many currently-open tickets have blown their SLA target. Scores 100 at zero breaches, sliding to 0 once the count hits the ‘breaches → 0’ ceiling. Skipped if the account has no support level set.",
  onboarding_period: "Days from the deal's Kick-off meeting to Launch (or to today if not launched yet). Scores 100 at/under the target days and 0 at/over the max days, linear between. Skipped if no kick-off date is recorded.",
  use_case_set: "100 if at least one Use Case is set across the account's deals, otherwise 0.",
  profile_complete: "100 if the account has no missing required profile fields (no red alert), otherwise 0.",
  stakeholder_mapping: "100 if at least one stakeholder role has a contact assigned in the Communication tab, otherwise 0.",
};

/** The tiers this app has always shown — the default until an admin edits them. */
export const DEFAULT_HEALTH_TIERS: HealthTierDef[] = [
  { id: "healthy", name: "Healthy", minScore: 75, color: "#2DB47A" },
  { id: "watch", name: "Watch", minScore: 55, color: "#C99A14" },
  { id: "at_risk", name: "At risk", minScore: 0, color: "#D14B6B" },
];

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
  tiers: DEFAULT_HEALTH_TIERS,
};
