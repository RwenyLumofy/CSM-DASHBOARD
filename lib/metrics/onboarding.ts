/* =========================================================================
   Onboarding period — measured on the account's CURRENT onboarding deal: the
   tracked deal with the LATEST kick-off (the most recent engagement). Its value
   is kick-off→launch once launched, or kick-off→today while still onboarding. A
   newer deal (later kick-off) supersedes/"consumes" an older figure — the
   average is used ONLY for a true tie, i.e. 2+ deals sharing that same latest
   kick-off (onboarding concurrently). One rule, applied everywhere: the
   company-header badge (shown only while the account is onboarding) and the
   "onboarding_period" health metric (always scored) read the same value.
   Pure, no I/O — reads the same dealDates shape (lib/deal-overrides.ts
   DEAL_DATES_KEY) already used by lib/status.ts and lib/profile-completeness.ts.
   ========================================================================= */

import type { DealDatesMap } from "@/lib/deal-overrides";

export interface OnboardingPeriod {
  /** Onboarding days for the latest-kick-off deal (kick-off→launch, or
   *  kick-off→now while unlaunched); averaged across deals that share that same
   *  latest kick-off. Null when no tracked deal has a kick-off date at all. */
  days: number | null;
  /** True when the current onboarding deal hasn't launched yet (its span is
   *  kick-off→now, i.e. still in progress). */
  ongoing: boolean;
}

function parseDate(v: string | null | undefined): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeOnboardingPeriod(
  trackedDeals: { id: string }[],
  dealDates: DealDatesMap,
  now: Date = new Date(),
): OnboardingPeriod {
  // Every deal that has actually started onboarding (has a kick-off date).
  const started = trackedDeals
    .map((d) => {
      const kickoff = parseDate(dealDates[d.id]?.kickoff_meeting_date);
      if (!kickoff) return null;
      const launch = parseDate(dealDates[d.id]?.launch_date);
      const end = launch ?? now;
      const days = Math.max(0, Math.round((end.getTime() - kickoff.getTime()) / 86_400_000));
      return { kickoffMs: kickoff.getTime(), days, ongoing: launch == null };
    })
    .filter((v): v is { kickoffMs: number; days: number; ongoing: boolean } => v != null);

  if (started.length === 0) return { days: null, ongoing: false };

  // The current onboarding subject = the deal(s) with the LATEST kick-off. A
  // newer deal supersedes older ones; only a true tie (identical kick-off) is
  // averaged together.
  const latest = Math.max(...started.map((d) => d.kickoffMs));
  const subject = started.filter((d) => d.kickoffMs === latest);
  const avg = Math.round(subject.reduce((sum, d) => sum + d.days, 0) / subject.length);
  return { days: avg, ongoing: subject.some((d) => d.ongoing) };
}
