/* =========================================================================
   The explainer is generated so it cannot describe a model that no longer
   exists. These tests hold that line: they assert the summary tracks the
   CONFIG rather than any value written down here.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_V1_1 } from "./model-v1";
import { describeModel } from "./describe-model";
import type { HealthModelVersion } from "./model";

test("weights are the model's own and add up to the whole score", () => {
  const s = describeModel(MODEL_V1_1);
  const total = s.components.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.001, `weights sum to ${total}, not 1`);
  assert.deepEqual(
    s.components.map((c) => c.id),
    MODEL_V1_1.components.filter((c) => c.isEnabled).map((c) => c.id),
  );
});

test("retuning a weight retunes the explainer — nothing is written down", () => {
  /* The whole point. A hand-written "50% product adoption" would still read
     50% here; the summary has to move with the config. */
  const retuned: HealthModelVersion = {
    ...MODEL_V1_1,
    components: MODEL_V1_1.components.map((c) =>
      c.id === "product" ? { ...c, weight: 0.3 } : c.id === "support" ? { ...c, weight: 0.35 } : c),
  };
  const s = describeModel(retuned);
  assert.equal(s.components.find((c) => c.id === "product")?.weight, 0.3);
});

test("a disabled component or gate is not described to the CSM", () => {
  const off: HealthModelVersion = {
    ...MODEL_V1_1,
    components: MODEL_V1_1.components.map((c) => (c.id === "sentiment" ? { ...c, isEnabled: false } : c)),
    qualificationRules: MODEL_V1_1.qualificationRules.map((q) => (q.id === "q_pulse" ? { ...q, isEnabled: false } : q)),
  };
  const s = describeModel(off);
  const disabledGate = MODEL_V1_1.qualificationRules.find((q) => q.id === "q_pulse")!.name;
  assert.ok(!s.components.some((c) => c.id === "sentiment"));
  assert.ok(!s.gates.some((g) => g.name === disabledGate), `${disabledGate} is disabled and must not be listed`);
  // The OTHER pulse gate is still on and must survive — q_pulse_valid shares
  // the words but not the rule.
  assert.ok(s.gates.some((g) => g.name === MODEL_V1_1.qualificationRules.find((q) => q.id === "q_pulse_valid")!.name));
});

test("bands read most healthy first, whatever order they are configured in", () => {
  const s = describeModel(MODEL_V1_1);
  for (let i = 1; i < s.bands.length; i++) assert.ok(s.bands[i - 1].min > s.bands[i].min);
});

test("escalations group by where they land, most severe first", () => {
  const s = describeModel(MODEL_V1_1);
  assert.ok(s.escalations.length > 0);
  const named = s.escalations.map((e) => e.status);
  assert.ok(named.indexOf("Critical") < named.indexOf("Watch"), "Critical must be listed before Watch");
  // Every enabled rule reaches the reader exactly once.
  const listed = s.escalations.flatMap((e) => e.triggers).length;
  assert.equal(listed, MODEL_V1_1.statusRules.filter((r) => r.isEnabled).length);
});
