"use client";

import { HealthSignals } from "@/components/clients/HealthSignals";
import { buildHealthBreakdown } from "@/lib/health/breakdown";
import { assembleModel } from "@/lib/health/model-assembly";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS } from "@/lib/health/pulse";

/* Bank of Bahrain & Kuwait, production, 5 Aug 2026. */
const HEALTH = {
  score: 73, tier: "Watch", tierColor: "#C99A14", trend: 0, updatedAt: "",
  band: "Healthy", coverage: 1, momentum: "Stable",
  components: { product: 77, reach: 99, progress: 78, outcomes: 52, breadth: 35,
    pulse: 63, stakeholder: 40, engagement: 75, renewal: 75,
    support: 78, sla: 67, incidents: 75, aged: 100, sentiment: 72 },
  reasons: ["CS Pulse below the Healthy minimum of 75", "Account is single-threaded"],
  reasonDetails: [
    { id: "q_pulse", text: "CS Pulse below the Healthy minimum of 75", shortfall: { metric: "cs_pulse_score", actual: 63, target: 75 } },
    { id: "q_multithreaded", text: "Account is single-threaded" },
  ],
  evidence: {
    reach: [{ key: "meaningfully_active_users", value: 748 }, { key: "target_cohort", value: 757 }],
    progress: [{ key: "actual_progress", value: 9727 }, { key: "expected_progress", value: 12514 }],
    outcomes: [{ key: "completed_matured_workflows", value: 1531 }, { key: "total_matured_workflows", value: 2932 }],
    breadth: [{ key: "live_use_cases", value: 1 }],
    sla: [{ key: "tickets_resolved_within_target", value: 2 }, { key: "eligible_resolved_tickets", value: 3 }],
    incidents: [{ key: "resolved_high_severity_incidents", value: 1 }],
    aged: [{ key: "aged_or_reopened_tickets", value: 0 }],
    sentiment: [{ key: "sentiment_nps", value: 72 }],
  },
} as never;

export function HealthCardPreview() {
  const breakdown = buildHealthBreakdown(
    HEALTH,
    assembleModel(CS_PULSE_DIMENSIONS, CS_PULSE_TIERS),
    { stakeholder: "Weak", engagement: "Moderate", renewal: "Moderate" },
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <header>
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-sirius">Dev preview</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold text-fg">Health signals — Bank of Bahrain &amp; Kuwait</h1>
        <p className="mt-1 font-body text-[13px] text-fg-muted">Real production readings. Click any signal to open it.</p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-5">
        <HealthSignals breakdown={breakdown} onRecalculate={() => {}} recalculating={false} />
      </div>
    </div>
  );
}
