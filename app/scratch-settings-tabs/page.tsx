import { notFound } from "next/navigation";
import { ClientHealthEditor, type ModelOverview } from "@/components/settings/ClientHealthEditor";
import { HealthModelRules, type RuleView } from "@/components/settings/HealthModelRules";
import { MODEL_V1_1 } from "@/lib/health/model-v1";
import { describeCondition, describeGateEffect, describeRuleEffect, editableThreshold } from "@/lib/health/rule-language";
import { DEFAULT_CLIENT_HEALTH_CONFIG } from "@/lib/metrics/health-config";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS } from "@/lib/health/pulse";

/* Same shape the real page derives from assembleModel(). */
const MOCK_OVERVIEW: ModelOverview = {
  components: [
    { name: "Product Adoption and Value Realization", weight: 0.5, mandatory: true, children: [
      { name: "Meaningful Reach", weight: 0.4, source: "active_users ÷ seats" },
      { name: "Workflow Progress", weight: 0.3, source: "learning_completions ÷ enrollments" },
    ] },
    { name: "Customer Success Pulse", weight: 0.25, mandatory: true, children: [
      { name: "Stakeholder Coverage", weight: 0.35, source: "CS Pulse rating" },
      { name: "Engagement and Execution", weight: 0.3, source: "CS Pulse rating" },
      { name: "Renewal Readiness", weight: 0.35, source: "CS Pulse rating" },
    ] },
    { name: "Support and Reliability", weight: 0.15, mandatory: false, children: [] },
    { name: "Client Sentiment", weight: 0.1, mandatory: false, children: [] },
  ],
  bands: [{ name: "Healthy", min: 65 }, { name: "Watch", min: 50 }, { name: "At Risk", min: 25 }, { name: "Critical", min: 0 }],
};


/* =========================================================================
   Dev preview — Settings → Client health.

   Settings needs a signed-in admin, so this renders the real component
   against REPO DEFAULTS. Those are not production's values: the defaults put
   CS Pulse at 37.5 with a 150% total and Healthy at ≥75, where production
   runs 33.3, ~133% and ≥60. Read this for layout, not for numbers.

   This page also previewed Settings → Automations until the assignment engine
   was removed. Tracked (Tailwind skips gitignored paths) and 404s outside
   development.
   ========================================================================= */

export const metadata = { title: "Preview · Client health settings" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 sm:p-8">
      <header>
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-sirius">Dev preview</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">Settings → Client health</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          The real component against <strong>repo defaults</strong> — CS Pulse 37.5, total 150%,
          Healthy ≥75. Production runs 33.3, ~133% and ≥60. Layout is accurate; the numbers are not.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-bg p-5">
        <p className="font-body text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sirius">
          Settings ▸ Client health
        </p>
        <h2 className="mt-1 font-display text-base font-semibold text-fg">Client health</h2>
        <p className="mb-5 mt-1 max-w-[70ch] font-body text-sm text-fg-muted">
          Everything that decides an account&rsquo;s health score: which signals count and how they are
          weighted, the tier cutoffs, and the CS Pulse the CSM records each month. Saving the formula
          re-scores every account immediately.
        </p>
        <ClientHealthEditor
          initialDimensions={CS_PULSE_DIMENSIONS}
          initialTiers={CS_PULSE_TIERS}
          formula={DEFAULT_CLIENT_HEALTH_CONFIG} overview={MOCK_OVERVIEW}
        />
        <div style={{marginTop:32}}>
          <HealthModelRules
            gates={MODEL_V1_1.qualificationRules.map((g) => ({
              id: g.id, name: g.name,
              reads: describeCondition(g.when as Record<string, Record<string, unknown>>),
              effect: describeGateEffect(g.capTo),
              shippedEnabled: g.isEnabled,
              shippedThreshold: editableThreshold(g.when as Record<string, Record<string, unknown>>),
              when: g.when as Record<string, Record<string, unknown>>,
            })) as RuleView[]}
            rules={[...MODEL_V1_1.statusRules].sort((a,b)=>a.priority-b.priority).map((r) => ({
              id: r.id, name: r.name, priority: r.priority,
              reads: describeCondition(r.when as Record<string, Record<string, unknown>>),
              effect: describeRuleEffect(r.action, r.targetStatus),
              shippedEnabled: r.isEnabled,
              shippedThreshold: editableThreshold(r.when as Record<string, Record<string, unknown>>),
              when: r.when as Record<string, Record<string, unknown>>,
            })) as RuleView[]}
            initial={{}}
            minCoverage={MODEL_V1_1.minCoverageForAssessment}
          />
        </div>
      </section>
    </div>
  );
}
