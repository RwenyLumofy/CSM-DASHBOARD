/* =========================================================================
   The rule that decides whether a health score means anything.

   Both cases below were real production rows on 2026-08-03, and they are the
   reason this exists: the same "no customer evidence" state was rendering as
   a green 76 on one account and a red 0 on another.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCustomerEvidence, isAssessed, CUSTOMER_EVIDENCE_METRICS } from "./health-evidence";

test("record-keeping alone is not evidence — the false GREEN", () => {
  // Masdar Building Materials: "Healthy", 76, on paperwork only.
  assert.equal(
    hasCustomerEvidence({ use_case_set: 100, profile_complete: 80, onboarding_period: 100, stakeholder_mapping: 50 }),
    false,
  );
});

test("record-keeping alone is not evidence — the false RED", () => {
  // DHL: "At risk", 0, on empty profile fields.
  assert.equal(hasCustomerEvidence({ use_case_set: 0, profile_complete: 0, stakeholder_mapping: 0 }), false);
});

test("zero usage IS evidence — it is the loudest churn signal we hold", () => {
  // 20 seats, 0 monthly actives. A gap would be the metric being ABSENT.
  assert.equal(hasCustomerEvidence({ usage: 0, profile_complete: 0 }), true);
});

test("any single customer signal is enough to assess", () => {
  for (const k of CUSTOMER_EVIDENCE_METRICS) {
    assert.equal(hasCustomerEvidence({ [k]: 50 }), true, `${k} should count as evidence`);
  }
});

test("nothing at all is not assessed", () => {
  assert.equal(hasCustomerEvidence({}), false);
  assert.equal(hasCustomerEvidence(null), false);
  assert.equal(hasCustomerEvidence(undefined), false);
});

test("isAssessed treats a missing health row as unassessed", () => {
  assert.equal(isAssessed(null), false);
  assert.equal(isAssessed(undefined), false);
  assert.equal(isAssessed({ components: {} }), false);
  assert.equal(isAssessed({ components: { cs_pulse: 70 } }), true);
});

test("an unknown metric key does not silently count as evidence", () => {
  /* A metric added to config later must be classified deliberately, not
     inherit evidence status by existing. The cast is the point: HealthComponents
     is key-constrained in TS, but these values are read back out of a JSONB
     column, so the runtime guard has to hold for keys the type forbids. */
  assert.equal(hasCustomerEvidence({ some_future_metric: 90 } as never), false);
});
