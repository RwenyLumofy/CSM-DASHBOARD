/* =========================================================================
   ONE definition of usage risk, for every surface that claims to show it.

   There were two, and they disagreed:

     Insights → "Early warnings"   month-over-month change
                                   dormant: previous > 0 and now 0
                                   declined: pctChange <= -25%

     Today   → focus-area signals  absolute adoption rate
                                   activeUsers / seats < 40%, seats >= 3

   Those measure different things, so the two lists could never match. An
   account that fell 40% month-over-month but still sits at 80% adoption was an
   early warning on Insights and invisible on Today; one flat at 30% adoption
   for a year was flagged on Today and absent from Insights. A CSM working Today
   and a lead reading Insights were looking at different books.

   Both rules are legitimate and they answer different questions — "is this
   getting worse?" versus "was this ever really adopted?" — so neither is
   dropped. They're just defined once, here, and every surface reports the same
   set with the same thresholds and the same wording.
   ========================================================================= */

import type { UsageMovement } from "@/lib/metrics/movement";

export type UsageRiskKind = "dormant" | "declined" | "low_adoption";

export interface UsageRisk {
  kind: UsageRiskKind;
  /** dormant is terminal-ish; a decline is urgent; low adoption is chronic. */
  severity: "high" | "medium";
  /** One line, already written for a human. Same wording on every surface. */
  note: string;
}

/** Minimum decline before it counts. Matches the Insights threshold that was
 *  tuned against real output — see MIN_BASE_FOR_PCT / FLAT_BAND in movement.ts
 *  for why small accounts and ±10% noise are excluded upstream. */
export const DECLINE_THRESHOLD = -0.25;

/** Adoption floor, and the seat count below which the ratio is meaningless —
 *  1 of 2 seats idle is not a portfolio signal. */
export const ADOPTION_FLOOR = 0.4;
export const MIN_SEATS_FOR_ADOPTION = 3;

/** "Is it getting worse?" — needs usage HISTORY (month over month). */
export function usageTrendRisk(u: UsageMovement | null | undefined): UsageRisk | null {
  if (!u) return null;
  if (u.direction === "dormant" && (u.previous ?? 0) > 0) {
    return { kind: "dormant", severity: "high", note: `Went dormant — ${u.previous} → 0 monthly actives` };
  }
  if (u.direction === "declined" && u.pctChange != null && u.pctChange <= DECLINE_THRESHOLD) {
    return {
      kind: "declined",
      severity: "high",
      note: `Usage down ${Math.round(Math.abs(u.pctChange) * 100)}% — ${u.previous} → ${u.current}`,
    };
  }
  return null;
}

/** "Was it ever really adopted?" — needs only the current snapshot. */
export function usageAdoptionRisk(usage: { seats?: number | null; activeUsers?: number | null } | null | undefined): UsageRisk | null {
  const seats = usage?.seats ?? 0;
  const active = usage?.activeUsers ?? 0;
  if (!seats || seats < MIN_SEATS_FOR_ADOPTION) return null;
  const rate = active / seats;
  if (rate >= ADOPTION_FLOOR) return null;
  return {
    kind: "low_adoption",
    severity: "medium",
    note: `Low licence adoption (${Math.round(rate * 100)}%) — ${active} of ${seats} seats active`,
  };
}

/**
 * Every usage risk on an account, worst first.
 *
 * Dormant supersedes the others: an account with zero actives is trivially also
 * "low adoption", and reporting both is noise. A decline and low adoption CAN
 * co-exist and both are reported — "dropped 40% AND only 30% ever used it" is
 * strictly more informative than either alone.
 */
export function usageRisks(
  usage: { seats?: number | null; activeUsers?: number | null } | null | undefined,
  movement: UsageMovement | null | undefined,
): UsageRisk[] {
  const trend = usageTrendRisk(movement);
  if (trend?.kind === "dormant") return [trend];
  const adoption = usageAdoptionRisk(usage);
  return [trend, adoption].filter((r): r is UsageRisk => r !== null);
}
