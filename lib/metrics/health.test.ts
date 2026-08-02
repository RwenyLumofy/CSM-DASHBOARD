/* =========================================================================
   CS Pulse as a health metric.

   The rules worth pinning are the ones that were argued over: a missing or
   stale Pulse must be SKIPPED rather than scored zero, and skipping must
   renormalise the remaining weights so an unassessed account is not punished
   for being unassessed. Getting that wrong is not a rounding error — it is the
   difference between "we have not looked at this account" and "this account is
   in trouble".
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHealthScore } from "./health";
import { DEFAULT_CLIENT_HEALTH_CONFIG, CS_PULSE_HEALTH_WEIGHT, HEALTH_METRIC_ORDER } from "./health-config";
import type { ClientHealthConfig } from "./health-config";
import type { HealthComputeInputs } from "./health";

const inputs = (over: Partial<HealthComputeInputs> = {}): HealthComputeInputs => ({
  support: { csat: null, csatScale: undefined, csatResponses: 0, nps: null, openBreaches: null, level: null } as never,
  usageScore: null,
  profileSeverity: "none",
  useCasesSet: true,
  stakeholderMapped: true,
  onboarding: { days: null, launched: true } as never,
  pulseScore: null,
  pulseAgeDays: null,
  ...over,
});

/** Only the two metrics named, so the arithmetic is checkable by hand. */
const configWith = (keys: { key: string; weight: number }[]): ClientHealthConfig => ({
  metrics: HEALTH_METRIC_ORDER.map((key) => {
    const on = keys.find((k) => k.key === key);
    return { key, enabled: !!on, weight: on?.weight ?? 0, params: key === "cs_pulse" ? { validityDays: 30 } : undefined };
  }),
  tiers: DEFAULT_CLIENT_HEALTH_CONFIG.tiers,
});

test("cs_pulse ships in the default formula, weighted for a 25% share", () => {
  const pulse = DEFAULT_CLIENT_HEALTH_CONFIG.metrics.find((m) => m.key === "cs_pulse");
  assert.ok(pulse, "cs_pulse is one of the default metrics");
  assert.equal(pulse.enabled, true);
  assert.equal(pulse.weight, CS_PULSE_HEALTH_WEIGHT);

  const total = DEFAULT_CLIENT_HEALTH_CONFIG.metrics.filter((m) => m.enabled).reduce((s, m) => s + m.weight, 0);
  assert.equal(Math.round((pulse.weight / total) * 100), 25, "a 25% share, per MODEL_V1_1");
});

test("a recorded Pulse contributes at its weight", () => {
  // use_case_set is a flat 100; pulse 0 at equal weight ⇒ 50.
  const cfg = configWith([{ key: "use_case_set", weight: 50 }, { key: "cs_pulse", weight: 50 }]);
  const out = computeHealthScore(inputs({ pulseScore: 0, pulseAgeDays: 1 }), cfg);
  assert.equal(out.score, 50);
  assert.equal(out.components.cs_pulse, 0);
});

test("NO PULSE is skipped, not scored zero — the account is not punished for being unassessed", () => {
  const cfg = configWith([{ key: "use_case_set", weight: 50 }, { key: "cs_pulse", weight: 50 }]);
  const out = computeHealthScore(inputs({ pulseScore: null }), cfg);
  // Renormalised onto use_case_set alone. Scoring it 0 would give 50 and read
  // as a half-healthy account purely because nobody has recorded a judgement.
  assert.equal(out.score, 100);
  assert.equal("cs_pulse" in out.components, false, "absent, not a faked zero");
});

test("a Pulse past its validity window stops counting", () => {
  const cfg = configWith([{ key: "use_case_set", weight: 50 }, { key: "cs_pulse", weight: 50 }]);
  const fresh = computeHealthScore(inputs({ pulseScore: 0, pulseAgeDays: 30 }), cfg);
  const stale = computeHealthScore(inputs({ pulseScore: 0, pulseAgeDays: 31 }), cfg);
  assert.equal(fresh.score, 50, "30 days is still inside the window");
  assert.equal(stale.score, 100, "31 is outside, so the metric drops out");
  /* The known cost of a hard cut-off, asserted so nobody "fixes" it by
     accident: a BAD Pulse lapsing makes the score go UP. Weight decay is the
     alternative if that ever becomes unacceptable. */
  assert.ok(stale.score > fresh.score, "a lapsing bad Pulse raises the score — deliberate, documented");
});

test("a disabled cs_pulse contributes nothing even when a Pulse exists", () => {
  const cfg = configWith([{ key: "use_case_set", weight: 50 }]);
  const out = computeHealthScore(inputs({ pulseScore: 0, pulseAgeDays: 1 }), cfg);
  assert.equal(out.score, 100);
  assert.equal("cs_pulse" in out.components, false);
});

test("with no validityDays configured, age never disqualifies a Pulse", () => {
  const cfg: ClientHealthConfig = {
    metrics: HEALTH_METRIC_ORDER.map((key) => ({
      key, enabled: key === "cs_pulse" || key === "use_case_set", weight: 50, params: undefined,
    })),
    tiers: DEFAULT_CLIENT_HEALTH_CONFIG.tiers,
  };
  const out = computeHealthScore(inputs({ pulseScore: 0, pulseAgeDays: 9999 }), cfg);
  assert.equal(out.score, 50, "no window set ⇒ the Pulse still counts");
});
