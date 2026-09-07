"use client";

/* =========================================================================
   The real UsageTab dashboard, fed Bank of Bahrain's readings as a fixture.

   Built because the production tab needs a Clerk session, so it had never been
   seen in this workspace while it was being redesigned — the whole reason the
   redesign went the way it did.
   ========================================================================= */

import { useState } from "react";
import { UsageDashboard } from "@/components/clients/UsageTab";
import type { UsageSnapshot, UsageSnapshotRow } from "@/lib/usage/types";

/* Every field the row declares, zeroed, then the real BBK values on top. */
const metrics = new Proxy({
  wau: 112, mau: 317, total_users: 812, active_users: 317, seats: 757, used_licenses: 748,
  job_roles: 41, job_levels: 7, departments: 23, divisions: 6, legal_entities: 2,
  learning_enrollments: 12514, learning_completions: 9727, learning_items_count: 412,
  pathways_count: 38, pathway_enrollments: 2932, pathway_completions: 1531,
  pathway_company_enrollments: 1204, pathway_company_completions: 731,
  pathway_lumofy_enrollments: 1728, pathway_lumofy_completions: 800,
  quizzes_generated: 96, quiz_enrollments: 3140, quiz_completions: 2714,
  sessions_created: 54, enps_cycles: 1, enps_responses: 212,
  survey_cycles: 2, survey_responses: 418,
  talent_assessment_enrollments: 0, talent_assessment_completed: 0,
  ai_assessment_enrollments: 0, ai_assessment_completed: 0,
  pm_cycles_configured: 0, pm_cycles_completed: 0,
  competencies_total: 184, competencies_ai_generated: 141, ai_generation_runs: 62,
} as Record<string, number>, {
  // Any field the component reads that the fixture forgot resolves to 0 rather
  // than undefined, so a missing key cannot silently render "NaN".
  get: (t, k: string) => (k in t ? t[k] : 0),
}) as unknown as UsageSnapshotRow;

const MONTHS = ["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"];
const ACTIVE = [251, 274, 288, 241, 334, 348, 302, 341, 356, 333, 317, 96];

const snap: UsageSnapshot = {
  status: "ok",
  environmentId: "bbk-prod",
  environmentName: "Bank of Bahrain & Kuwait",
  region: "aws",
  fetchedAt: new Date().toISOString(),
  metrics,
  trends: { active_users: MONTHS.map((month, i) => ({ month, value: ACTIVE[i] })) } as never,
  /* Shapes taken from lib/usage/types.ts rather than guessed: LearningBucket is
     { enrollments, completions, items } — "items", not "courses" — and
     AdoptionScore carries parts.recency (not momentum) plus a per-module
     owned/used record. Guessing these is what made the first attempt crash. */
  learning: {
    company: { enrollments: 1127, completions: 863, items: 42 },
    lumofy: { enrollments: 8509, completions: 6702, items: 310 },
    global: { enrollments: 2878, completions: 2162, items: 60 },
    providers: [
      { provider: "Go1", enrollments: 1908, completions: 1421, items: 38 },
      { provider: "Coursera", enrollments: 970, completions: 741, items: 22 },
    ],
  },
  score: {
    score: 62,
    tier: "growing",
    verdict: "Deep use of Develop by a third of the seats, and no use of Perform at all.",
    parts: { activation: 41.9, breadth: 60, recency: 48 },
    modules: {
      develop: { owned: true, used: true },
      perform: { owned: true, used: false },
      engage: { owned: true, used: true },
    },
  },
};

export function LiveUsagePreview() {
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 p-5">
      <header className="max-w-[76ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Live component · fixture data</p>
        <h1 className="mt-1 font-display text-[21px] font-semibold text-fg">The Usage tab as it exists today</h1>
        <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">
          The real <span className="font-mono text-[11.5px]">UsageDashboard</span> from
          <span className="font-mono text-[11.5px]"> components/clients/UsageTab.tsx</span>, unmodified,
          rendered against Bank of Bahrain&rsquo;s readings. Period selection works; period-scoped data
          returns nothing, so those views show the empty state rather than fabricated numbers.
        </p>
      </header>
      <UsageDashboard
        snap={snap}
        onRefresh={() => {}}
        periodKey={periodKey}
        onPeriodChange={setPeriodKey}
        periodState={periodKey ? { phase: "done", data: { status: "error", message: "Period data is not available in this fixture preview." } as never } : null}
      />
    </div>
  );
}
