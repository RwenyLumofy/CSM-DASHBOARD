/* =========================================================================
   Admin overrides on the health model. These decide every account's status,
   so the tests pin the guarantees the engine relies on: weights that always
   total 1, bands with no gaps, and rules that can be retuned but not rewritten.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyModelOverrides, editableThreshold } from "./model-overrides";
import { normalizeOverrides } from "./model-overrides-store";
import { MODEL_V1_1 } from "./model-v1";

const sum = (m: typeof MODEL_V1_1) =>
  m.components.filter((c) => c.isEnabled).reduce((s, c) => s + c.weight, 0);

test("no overrides leaves the shipped model untouched", () => {
  assert.equal(applyModelOverrides(MODEL_V1_1, null), MODEL_V1_1);
});

test("weights are renormalised to total 1, whatever the admin typed", () => {
  // A half-finished edit totalling 60% would otherwise inflate every score.
  const m = applyModelOverrides(MODEL_V1_1, { componentWeights: { product: 30, pulse: 20, support: 10, sentiment: 0 } });
  assert.ok(Math.abs(sum(m) - 1) < 1e-9, `weights should total 1, got ${sum(m)}`);
  assert.ok(m.components.find((c) => c.id === "product")!.weight > m.components.find((c) => c.id === "pulse")!.weight);
});

test("bands are rebuilt contiguous, so no score falls between two bands", () => {
  const m = applyModelOverrides(MODEL_V1_1, {
    bands: [{ name: "Good", minScore: 70 }, { name: "Poor", minScore: 0 }],
  });
  assert.deepEqual(m.bands.map((b) => b.name), ["Good", "Poor"]);
  assert.equal(m.bands[0].maxScore, 100);
  assert.ok(m.bands[1].maxScore < 70 && m.bands[1].maxScore > 69.9, "second band must butt against the first");
});

test("a gate can be turned off", () => {
  const m = applyModelOverrides(MODEL_V1_1, { gates: { q_multithreaded: { enabled: false } } });
  assert.equal(m.qualificationRules.find((g) => g.id === "q_multithreaded")!.isEnabled, false);
  // and the original is untouched — applyModelOverrides must not mutate the seed
  assert.equal(MODEL_V1_1.qualificationRules.find((g) => g.id === "q_multithreaded")!.isEnabled, true);
});

test("a gate's threshold can be moved", () => {
  const m = applyModelOverrides(MODEL_V1_1, { gates: { q_pulse: { threshold: 60 } } });
  const when = m.qualificationRules.find((g) => g.id === "q_pulse")!.when as Record<string, { gte?: number }>;
  assert.equal(when.cs_pulse_score.gte, 60);
});

test("a status rule can be retuned and retargeted", () => {
  const m = applyModelOverrides(MODEL_V1_1, { rules: { r_pulse_below_60: { threshold: 50, targetStatus: "Watch" } } });
  const r = m.statusRules.find((x) => x.id === "r_pulse_below_60")!;
  assert.equal((r.when as Record<string, { lt?: number }>).cs_pulse_score.lt, 50);
  assert.equal(r.targetStatus, "Watch");
});

test("editableThreshold finds exactly one number, or refuses", () => {
  assert.equal(editableThreshold({ cs_pulse_score: { gte: 75 } }), 75);
  assert.equal(editableThreshold({ single_threaded: { ne: true } }), null, "no number to edit");
  assert.equal(
    editableThreshold({ renewal_within_90d: { isTrue: true }, economic_buyer_known: { isFalse: true } }),
    null,
    "no number in a two-signal condition",
  );
});

test("minCoverage is clamped to 0..1", () => {
  assert.equal(applyModelOverrides(MODEL_V1_1, { minCoverage: 5 }).minCoverageForAssessment, 1);
  assert.equal(applyModelOverrides(MODEL_V1_1, { minCoverage: -1 }).minCoverageForAssessment, 0);
});

test("stored junk is dropped rather than reaching the model", () => {
  const o = normalizeOverrides({
    componentWeights: { product: 40, nonsense: 10, pulse: "high" },
    gates: { q_pulse: { threshold: 60 }, made_up_gate: { enabled: false } },
    rules: { r_churned: { enabled: false }, also_fake: { threshold: 1 } },
    bands: [{ name: "", minScore: 10 }, { name: "OK", minScore: 50 }],
    minCoverage: 0.8,
  })!;
  assert.deepEqual(o.componentWeights, { product: 40 }, "unknown ids and non-numbers dropped");
  assert.deepEqual(Object.keys(o.gates!), ["q_pulse"], "unknown gate id dropped");
  assert.deepEqual(Object.keys(o.rules!), ["r_churned"], "unknown rule id dropped");
  assert.deepEqual(o.bands, [{ name: "OK", minScore: 50 }], "unnamed band dropped");
  assert.equal(o.minCoverage, 0.8);
});

test("an empty override object stores as nothing, not as a model of zeros", () => {
  assert.equal(normalizeOverrides({}), null);
  assert.equal(normalizeOverrides(null), null);
  assert.equal(normalizeOverrides({ componentWeights: {} }), null);
});
