/* =========================================================================
   Map the engine's full result onto the shape stored in clients.health.

   WHY AN ADAPTER. The engine answers a richer question than the old formula
   did: an account has both a calculated score AND an applied status, and those
   can legitimately differ (a 90 capped to Watch because the CSM said the
   account is single-threaded). The stored shape has one `score` and one
   `tier`, and every surface reads them.

   `tier` therefore carries the APPLIED status, not the band. If it carried the
   band, the clients list would show Healthy for an account the profile calls
   Watch, and the cap would exist only in a drawer nobody opens. The score is
   stored unmodified, so nothing is hidden — the two simply mean different
   things, which is why `band` is stored alongside them.

   Everything else is additive. clients.health is JSONB, so the new fields need
   no migration and older rows keep working: readers that only know `score`,
   `tier`, `components` and `trend` are unaffected.
   ========================================================================= */

import type { AccountHealthResult } from "./model";
import type { HealthScore } from "@/lib/types";

/** Applied statuses the engine can produce, and the colour each renders in.
 *  Bands are admin-nameable, so an unknown name falls back to neutral grey
 *  rather than a colour that implies a severity nobody chose. */
const STATUS_COLOR: Record<string, string> = {
  Healthy: "#1F9D63",
  Watch: "#C99A14",
  "At Risk": "#C2610E",
  Critical: "#B23A57",
  Churned: "#6E6E6E",
  Implementation: "#4C6FFF",
  "Not Assessed": "#8A8A8A",
};
const NEUTRAL = "#8A8A8A";

/** Statuses that are a lifecycle fact rather than a judgement of health.
 *  Surfaces that count "how many accounts are at risk" must skip these. */
export const NON_SCORING_STATUSES = new Set(["Churned", "Implementation", "Not Assessed"]);

export interface StoredHealthExtras {
  /** The band the raw score fell in, before caps. Differs from `tier` whenever
   *  a qualification gate or status rule moved the account. */
  band?: string | null;
  /** 0–1 share of the enabled weight that had data. */
  coverage?: number;
  confidence?: string;
  momentum?: string;
  primaryRisk?: string | null;
  nextAction?: string | null;
  /** Why the applied status differs from the band, in the engine's own words. */
  reasons?: string[];
  notAssessed?: boolean;
  notAssessedReason?: string | null;
  modelVersion?: string;
}

export type StoredHealth = HealthScore & StoredHealthExtras;

/**
 * Flatten the component tree to the `{ id: score }` map the existing drawer
 * and the Not-assessed evidence rule already read. Children are included under
 * their own ids so a CS Pulse dimension stays inspectable, and components with
 * no data are omitted entirely — an absent key means "no reading", which is
 * the distinction lib/metrics/health-evidence.ts depends on.
 */
function flattenComponents(result: AccountHealthResult): HealthScore["components"] {
  const out: Record<string, number> = {};
  const walk = (list: AccountHealthResult["components"]) => {
    for (const c of list ?? []) {
      if (c.score != null) out[c.id] = Math.round(c.score);
      if (c.children?.length) walk(c.children as AccountHealthResult["components"]);
    }
  };
  walk(result.components);
  return out as HealthScore["components"];
}

export function toStoredHealth(result: AccountHealthResult): StoredHealth {
  const applied = result.appliedStatus || "Not Assessed";
  return {
    // Round for storage; the engine keeps one decimal internally.
    score: result.calculatedScore != null ? Math.round(result.calculatedScore) : 0,
    tier: applied,
    tierColor: STATUS_COLOR[applied] ?? NEUTRAL,
    components: flattenComponents(result),
    trend: result.scoreDelta != null ? Math.round(result.scoreDelta) : 0,
    updatedAt: result.calculationTimestamp,

    band: result.calculatedBand,
    coverage: result.dataCoverage,
    confidence: result.dataConfidence,
    momentum: result.momentum,
    primaryRisk: result.primaryRisk,
    nextAction: result.nextAction,
    reasons: (result.activeStatusRules ?? []).map((r) => r.reason),
    notAssessed: result.notAssessed,
    notAssessedReason: result.notAssessedReason ?? null,
    modelVersion: result.modelVersion,
  };
}
