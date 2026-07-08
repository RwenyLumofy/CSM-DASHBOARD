/* =========================================================================
   Onboarding period — the time between a deal's kickoff meeting and its
   launch. Per deal: kickoff→launch (or kickoff→today while not launched yet).
   Across an account's tracked deals, the value is the AVERAGE of each deal's
   period, so one slow deal doesn't dominate and one fast deal doesn't hide a
   problem. Feeds the "onboarding_period" health metric (always scored) and the
   company-header onboarding badge (shown only while the account is onboarding).
   Pure, no I/O — reads the same dealDates shape (lib/deal-overrides.ts
   DEAL_DATES_KEY) already used by lib/status.ts and lib/profile-completeness.ts.
   ========================================================================= */

import type { DealDatesMap } from "@/lib/deal-overrides";

export interface OnboardingPeriod {
  /** Average, across every tracked deal that has a kickoff date, of that deal's
   *  kickoff→launch span (or kickoff→now while it hasn't launched). Null when no
   *  tracked deal has a kickoff date at all — onboarding hasn't started. */
  days: number | null;
  /** True when at least one deal is still onboarding (has a kickoff but no
   *  launch), i.e. the average includes an in-progress span rather than being
   *  entirely completed kickoff→launch durations. */
  ongoing: boolean;
}

function parseDate(v: string | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One deal's onboarding span in days, or null when it has no kickoff date. */
function dealOnboardingDays(dates: Record<string, string | null> | undefined, now: Date): { days: number; ongoing: boolean } | null {
  const kickoff = parseDate(dates?.kickoff_meeting_date);
  if (!kickoff) return null;
  const launch = parseDate(dates?.launch_date);
  const end = launch ?? now;
  const days = Math.max(0, Math.round((end.getTime() - kickoff.getTime()) / 86_400_000));
  return { days, ongoing: launch == null };
}

export function computeOnboardingPeriod(
  trackedDeals: { id: string }[],
  dealDates: DealDatesMap,
  now: Date = new Date(),
): OnboardingPeriod {
  const perDeal = trackedDeals
    .map((d) => dealOnboardingDays(dealDates[d.id], now))
    .filter((v): v is { days: number; ongoing: boolean } => v != null);

  if (perDeal.length === 0) return { days: null, ongoing: false };

  const avg = Math.round(perDeal.reduce((sum, p) => sum + p.days, 0) / perDeal.length);
  return { days: avg, ongoing: perDeal.some((p) => p.ongoing) };
}
