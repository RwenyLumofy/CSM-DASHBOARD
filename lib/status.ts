/* =========================================================================
   Account lifecycle status — fully auto-derived from deal activity. The only
   lever a CSM has is manually marking an account churned (and reversing
   that); onboarding / active / renewal are computed, never chosen.

   Precedence (highest wins):
     churned    — CSM has manually marked the account churned. Stored as
                  client.properties[STATUS_OVERRIDE_KEY] = "churned" so it
                  survives HubSpot sync's `||` properties merge, mirroring
                  the __deal_overrides pattern (app wins over HubSpot).
     renewal    — any TRACKED deal's renewal date (contract start + 1yr,
                  falling back to close date + 1yr) is upcoming — due in the
                  next 90 days. NOT triggered by an overdue renewal date:
                  most deals never get a HubSpot contract-start-date, so the
                  close-date fallback is often years stale for a long-tenured
                  account (it renews without that field ever being updated),
                  and treating "overdue" as "approaching" would mislabel most
                  of the book as perpetually up for renewal.
     active     — any TRACKED deal has a known launch date. Two sources count,
                  since the per-deal milestone system is new (as of this
                  writing only one deal in the whole book uses it):
                    - client.properties.__deal_dates[dealId].launch_date
                      (current, per-deal)
                    - client.properties.launch_date (legacy, account-level,
                      predates the per-deal system — still genuine launch
                      data, just filed under the old key)
                  OR the client has ARR but no deal rows at all (e.g. a
                  legacy account brought in via bulk CSV import, which
                  carries an ARR-ledger baseline but never gets a
                  client_deals row — there is no deal to ever attach a
                  launch date to, so requiring one would be a dead end).
     onboarding — default: no tracked deals and no ARR yet, or a tracked deal
                  exists but its launch date genuinely hasn't been entered —
                  intentionally strict (not backfilled from ARR/tenure) so
                  the label prompts the CSM to record the real launch date
                  rather than silently assuming an established deal launched.

   Recomputed by recomputeClient() on every HubSpot sync, property edit,
   bulk import, and ARR-ledger append — so it's always current and can never
   drift the way a CSM-picked value could.
   ========================================================================= */

import type { AccountStatus } from "@/lib/types";

export const STATUS_OVERRIDE_KEY = "__status_override";

const RENEWAL_WINDOW_DAYS = 90;

export interface StatusDeal {
  id: string;
  tracked: boolean;
  contractStartDate: Date | null;
  closeDate: Date | null;
}

function hasValue(v: unknown): boolean {
  return v != null && v !== "";
}

function dealRenewalDate(d: StatusDeal): Date | null {
  const base = d.contractStartDate ?? d.closeDate;
  if (!base) return null;
  const r = new Date(base);
  r.setUTCFullYear(r.getUTCFullYear() + 1);
  return r;
}

export function computeClientStatus(
  deals: StatusDeal[],
  launchDateByDealId: Record<string, string | null | undefined>,
  legacyLaunchDate: string | null | undefined,
  manualOverride: string | undefined,
  arr: number,
  now: Date = new Date(),
): AccountStatus {
  if (manualOverride === "churned") return "churned";

  const tracked = deals.filter((d) => d.tracked !== false);
  if (tracked.length === 0) return arr > 0 ? "active" : "onboarding";

  const nowMs = now.getTime();
  const renewalCutoff = nowMs + RENEWAL_WINDOW_DAYS * 86_400_000;
  const anyRenewalApproaching = tracked.some((d) => {
    const r = dealRenewalDate(d);
    return r != null && r.getTime() >= nowMs && r.getTime() <= renewalCutoff;
  });
  if (anyRenewalApproaching) return "renewal";

  const anyLaunchKnown = hasValue(legacyLaunchDate) || tracked.some((d) => hasValue(launchDateByDealId[d.id]));
  return anyLaunchKnown ? "active" : "onboarding";
}
