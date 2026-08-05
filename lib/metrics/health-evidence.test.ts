/* =========================================================================
   The rule that decides whether a health score means anything.

   Both cases below were real production rows on 2026-08-03, and they are the
   reason this exists: the same "no customer evidence" state was rendering as
   a green 76 on one account and a red 0 on another.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCustomerEvidence, isAssessed, CUSTOMER_EVIDENCE_METRICS } from "./health-evidence";

test("our own record of what they run is not evidence about them", () => {
  /* `breadth` is Signal's use-case rollup — present on 96% of accounts, so
     counting it would mark almost everything assessed. `product` is excluded
     for the same reason: it is present whenever breadth alone is. */
  assert.equal(hasCustomerEvidence({ breadth: 35 } as never), false);
  assert.equal(hasCustomerEvidence({ product: 35, breadth: 35 } as never), false);
});

test("zero usage IS evidence — it is the loudest churn signal we hold", () => {
  // 20 seats, 0 monthly actives. A gap would be the metric being ABSENT.
  assert.equal(hasCustomerEvidence({ reach: 0, breadth: 35 } as never), true);
});

test("the engine's keys are what the data actually holds", () => {
  /* The set previously held the retired formula's keys, which share not one
     name with the engine's — so every account rendered "Not assessed" on a
     perfectly good score. */
  for (const k of ["usage", "csat", "nps", "sla_breaches", "cs_pulse"]) {
    assert.equal(hasCustomerEvidence({ [k]: 80 } as never), false, `${k} is a retired key`);
  }
  assert.equal(hasCustomerEvidence({ ticket_sat: 96 } as never), true);
  assert.equal(hasCustomerEvidence({ stakeholder: 100 } as never), true);
});

test("any single customer signal is enough to assess", () => {
  for (const k of CUSTOMER_EVIDENCE_METRICS) {
    assert.equal(hasCustomerEvidence({ [k]: 50 } as never), true, `${k} should count as evidence`);
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
  assert.equal(isAssessed({ components: { pulse: 70 } } as never), false, "the parent aggregate is not evidence");
  assert.equal(isAssessed({ components: { renewal: 70 } } as never), true);
});

test("an unknown metric key does not silently count as evidence", () => {
  /* A metric added to config later must be classified deliberately, not
     inherit evidence status by existing. The cast is the point: HealthComponents
     is key-constrained in TS, but these values are read back out of a JSONB
     column, so the runtime guard has to hold for keys the type forbids. */
  assert.equal(hasCustomerEvidence({ some_future_metric: 90 } as never), false);
});
