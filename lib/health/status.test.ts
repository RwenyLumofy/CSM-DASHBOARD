/* =========================================================================
   One status, read the same way everywhere. These pin the two failures that
   made surfaces disagree: re-banding from the raw score after a cap, and
   counting lifecycle states as at-risk.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { accountStatus, isAtRisk, isJudged, bandFromScore } from "./status";

const h = (tier: string, score = 0) => ({ tier, score, components: {} as never });

test("the applied status wins over the score", () => {
  // Bank of Bahrain: scored 79, capped to Watch. Re-banding read it Healthy.
  assert.equal(accountStatus(h("Watch", 79)), "watch");
  assert.equal(accountStatus(h("At Risk", 83)), "at_risk");
});

test("casing and spacing don't matter — both engines' spellings work", () => {
  assert.equal(accountStatus(h("At risk", 10)), "at_risk", "old engine's spelling");
  assert.equal(accountStatus(h("At Risk", 10)), "at_risk", "new engine's spelling");
  assert.equal(accountStatus(h("Not Assessed", 0)), "not_assessed");
});

test("lifecycle states are not judgements of health", () => {
  for (const t of ["Churned", "Implementation", "Not Assessed"]) {
    assert.equal(isJudged(h(t, 0)), false, `${t} should not be counted`);
    assert.equal(isAtRisk(h(t, 0)), false, `${t} should not read as at-risk`);
  }
});

test("a churned account scoring 0 is not an at-risk account", () => {
  // 79 of 133 accounts. Counting these is how the old dashboard reported 75
  // at-risk on a book that was mostly already gone.
  assert.equal(isAtRisk(h("Churned", 0)), false);
});

test("At Risk and Critical both need attention", () => {
  assert.equal(isAtRisk(h("At Risk", 40)), true);
  assert.equal(isAtRisk(h("Critical", 12)), true);
  assert.equal(isAtRisk(h("Healthy", 90)), false);
  assert.equal(isAtRisk(h("Watch", 60)), false);
});

test("a renamed band falls back to the score rather than vanishing", () => {
  // Bands are admin-renameable; an unknown name must still be counted.
  assert.equal(accountStatus(h("Thriving", 90)), "healthy");
  assert.equal(accountStatus(h("Danger", 30)), "at_risk");
  assert.equal(isJudged(h("Thriving", 90)), true);
});

test("no health row at all is not assessed", () => {
  assert.equal(accountStatus(null), "not_assessed");
  assert.equal(isAtRisk(undefined), false);
  assert.equal(isJudged(null), false);
});

test("bandFromScore uses the model's cutoffs, not the old 75/55", () => {
  assert.equal(bandFromScore(65), "healthy");
  assert.equal(bandFromScore(64), "watch");
  assert.equal(bandFromScore(50), "watch");
  assert.equal(bandFromScore(49), "at_risk");
  assert.equal(bandFromScore(25), "at_risk");
  assert.equal(bandFromScore(24), "critical");
  // 70 was "watch" under the old 75/55 cutoffs and is "healthy" under these.
  assert.equal(bandFromScore(70), "healthy");
});
