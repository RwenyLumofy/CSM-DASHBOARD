/* =========================================================================
   Onboarding period — the time between an account's kickoff meeting and its
   launch, across its tracked deals. Feeds the "onboarding_period" health
   metric and the ClientsTable "Onboarding" column. Pure, no I/O — reads the
   same dealDates shape (lib/deal-overrides.ts DEAL_DATES_KEY) already used
   by lib/status.ts and lib/profile-completeness.ts.
   ========================================================================= */

import type { DealDatesMap } from "@/lib/deal-overrides";

export interface OnboardingPeriod {
  /** Days from the earliest tracked-deal kickoff to the earliest tracked-deal
   *  launch (or to `now` when no launch date is known yet). Null when no
   *  tracked deal has a kickoff date at all — onboarding hasn't started. */
  days: number | null;
  /** True when `days` counts kickoff→now because no launch date exists yet
   *  (still in progress), as opposed to a completed kickoff→launch span. */
  ongoing: boolean;
}

function hasValue(v: string | null | undefined): v is string {
  return v != null && v !== "";
}

function earliest(dates: (string | null | undefined)[]): Date | null {
  const times = dates.filter(hasValue).map((d) => new Date(d).getTime()).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

export function computeOnboardingPeriod(
  trackedDeals: { id: string }[],
  dealDates: DealDatesMap,
  now: Date = new Date(),
): OnboardingPeriod {
  const kickoff = earliest(trackedDeals.map((d) => dealDates[d.id]?.kickoff_meeting_date));
  if (!kickoff) return { days: null, ongoing: false };

  const launch = earliest(trackedDeals.map((d) => dealDates[d.id]?.launch_date));
  const end = launch ?? now;
  const days = Math.max(0, Math.round((end.getTime() - kickoff.getTime()) / 86_400_000));
  return { days, ongoing: launch == null };
}
