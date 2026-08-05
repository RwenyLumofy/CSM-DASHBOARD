/* =========================================================================
   The profile explains a capped status by printing the reason and, beneath it,
   what clears it. That second line is written by hand and keyed by rule id, so
   it can drift from the model in two directions — a rule shipped with no
   remedy, or a remedy keyed to a rule id that no longer exists. Both fail
   silently: the card still renders, just with the useful half missing.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_V1_1 } from "./model-v1";
import { REMEDY_BY_RULE, REMEDY_BY_REASON } from "./signal-language";

const RULE_IDS = [
  ...MODEL_V1_1.qualificationRules.map((r) => r.id),
  ...MODEL_V1_1.statusRules.map((r) => r.id),
];

test("every gate and rule the engine can fire has a remedy", () => {
  const missing = RULE_IDS.filter((id) => !REMEDY_BY_RULE[id]);
  assert.deepEqual(missing, [], `no remedy for: ${missing.join(", ")}`);
});

test("no remedy is keyed to a rule that no longer exists", () => {
  const orphaned = Object.keys(REMEDY_BY_RULE).filter((id) => !RULE_IDS.includes(id));
  assert.deepEqual(orphaned, [], `remedy for unknown rule: ${orphaned.join(", ")}`);
});

test("the text fallback matches the model's shipped wording exactly", () => {
  /* Only reached for health rows scored before rule ids were stored, so an
     approximate match is worth nothing — it either matches the template
     character-for-character or the remedy never appears. "Champion gone
     without a replacement" was written here while the model said "Champion has
     left without a replacement", and that near-miss rendered a blank line. */
  const templates = new Set([
    ...MODEL_V1_1.qualificationRules.map((r) => r.reasonTemplate),
    ...MODEL_V1_1.statusRules.map((r) => r.reasonTemplate),
  ]);
  const unmatched = Object.keys(REMEDY_BY_REASON).filter((t) => !templates.has(t));
  assert.deepEqual(unmatched, [], `not a reason the model emits: ${unmatched.join(" | ")}`);
});
