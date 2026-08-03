/* =========================================================================
   A Critical on renewal or engagement caps the tier.

   The case these pin, from production on 2026-08-03: YK Almoayyed & Sons was
   rated Critical on all three dimensions — no sponsor, gone dark, active churn
   risk, a CS Pulse of 0 — and read "Healthy, 61", because five record-keeping
   metrics sat at 100 and outvoted the CSM. Eight of the nine accounts with a
   Critical showed Healthy or Watch.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHealthScore, PULSE_CRITICAL_CAPS } from "./health";
import type { HealthComputeInputs } from "./health";
import type { ClientHealthConfig } from "@/lib/metrics/health-config";

/* Production weights for the metrics YK Almoayyed actually scored on. The
   record-keeping four plus onboarding come to 50 weight at 100 each, against
   CS Pulse's 33.3 at 0: 5000 / 83.3 = 60. Exactly the situation reported —
   just over the Healthy line, carried entirely by paperwork. */
const CONFIG: ClientHealthConfig = {
  metrics: [
    { key: "cs_pulse", weight: 33.3, enabled: true, params: { validityDays: 30 } },
    { key: "profile_complete", weight: 10.4, enabled: true },
    { key: "use_case_set", weight: 10, enabled: true },
    { key: "stakeholder_mapping", weight: 9.6, enabled: true },
    { key: "sla_breaches", weight: 10, enabled: true },
    { key: "onboarding_period", weight: 10, enabled: true },
  ],
  tiers: [
    { id: "healthy", name: "Healthy", minScore: 60, color: "#1E8F61" },
    { id: "watch", name: "Watch", minScore: 40, color: "#C99A14" },
    { id: "at_risk", name: "At risk", minScore: 0, color: "#B23A57" },
  ],
};

/** The YK Almoayyed shape: paperwork perfect, the CSM's read at rock bottom. */
const base = (over: Partial<HealthComputeInputs> = {}): HealthComputeInputs => ({
  support: { csat: null, csatScale: undefined, csatResponses: 0, nps: null, slaBreaches: [], supportLevelUsed: "standard" } as never,
  usageScore: null,
  profileSeverity: "none",
  useCasesSet: true,
  stakeholderMapped: true,
  onboarding: { days: 10, launched: true } as never,
  pulseScore: 0,
  pulseAgeDays: 6,
  pulseCriticalDimensions: null,
  ...over,
});

test("without the cap, paperwork outvotes a rock-bottom Pulse", () => {
  const r = computeHealthScore(base(), CONFIG);
  assert.ok(r.score >= 60, `expected the weighted score to still read healthy, got ${r.score}`);
  assert.equal(r.tier, "Healthy");
  assert.equal(r.cappedBy, undefined);
});

test("a Critical on renewal drops the tier to the lowest, score untouched", () => {
  const r = computeHealthScore(base({ pulseCriticalDimensions: ["renewal"] }), CONFIG);
  assert.equal(r.tier, "At risk");
  assert.deepEqual(r.cappedBy, ["renewal"]);
  assert.ok(r.score >= 60, "the score must NOT be rewritten — only the tier is capped");
});

test("a Critical on engagement caps too", () => {
  assert.equal(computeHealthScore(base({ pulseCriticalDimensions: ["engagement"] }), CONFIG).tier, "At risk");
});

test("Critical on all three records both capping dimensions", () => {
  const r = computeHealthScore(base({ pulseCriticalDimensions: ["stakeholder", "engagement", "renewal"] }), CONFIG);
  assert.equal(r.tier, "At risk");
  assert.deepEqual(r.cappedBy, ["engagement", "renewal"]);
});

test("stakeholder alone does NOT cap — it describes our coverage, not their intent", () => {
  const r = computeHealthScore(base({ pulseCriticalDimensions: ["stakeholder"] }), CONFIG);
  assert.equal(r.tier, "Healthy");
  assert.equal(r.cappedBy, undefined);
});

test("a LAPSED Pulse stops capping at the same moment it stops counting", () => {
  // 90 days old, past validityDays: cs_pulse contributes nothing, so a
  // judgement made three months ago must not pin the account to At risk.
  const r = computeHealthScore(base({ pulseAgeDays: 90, pulseCriticalDimensions: ["renewal"] }), CONFIG);
  assert.equal(r.components.cs_pulse, undefined, "a lapsed Pulse should not contribute");
  assert.equal(r.tier, "Healthy");
  assert.equal(r.cappedBy, undefined);
});

test("no Pulse at all cannot cap", () => {
  const r = computeHealthScore(base({ pulseScore: null, pulseAgeDays: null, pulseCriticalDimensions: ["renewal"] }), CONFIG);
  assert.equal(r.cappedBy, undefined);
  assert.equal(r.tier, "Healthy");
});

test("only renewal and engagement are capping dimensions", () => {
  assert.deepEqual([...PULSE_CRITICAL_CAPS], ["renewal", "engagement"]);
});
