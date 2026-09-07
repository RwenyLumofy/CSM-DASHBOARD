import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capabilitiesInUse,
  capabilityAdoptionCount,
  modulesInUse,
  CAPABILITIES,
} from "@/lib/metrics/capability-adoption";

/* =========================================================================
   These cases ARE the product decision, not incidental coverage.

   Two calls are pinned here. Courses/pathways/quizzes count ONCE between them,
   because they co-occur on 99/94/88 of 121 accounts and represent one adoption
   decision; splitting them inflated 54 of 121 accounts to a perfect score for
   depth inside a single module. And every capability that genuinely varies
   across the book stays separate, because counting whole modules instead put
   67 of 121 accounts in one bucket and threw the signal away.
   ========================================================================= */

test("counts a capability only when something actually happened in it", () => {
  assert.deepEqual(capabilitiesInUse({ learning_enrollments: 12 }), ["Core learning"]);
  assert.deepEqual(capabilitiesInUse({ learning_enrollments: 0 }), []);
  assert.deepEqual(capabilitiesInUse({ survey_responses: 3, pm_cycles_completed: 1 }).sort(), [
    "Performance cycles",
    "Surveys",
  ]);
});

test("courses, pathways and quizzes are one capability, not three", () => {
  // They co-occur across the book — a customer who bought Develop and started
  // using it. Counting them separately rewards depth inside one module as if it
  // were breadth across the platform.
  const allThree = {
    learning_enrollments: 900, learning_completions: 700,
    pathway_enrollments: 400, pathway_completions: 300,
    quiz_enrollments: 250, quiz_completions: 200,
  };
  assert.deepEqual(capabilitiesInUse(allThree), ["Core learning"]);
  assert.equal(capabilityAdoptionCount(allThree), 1);
});

test("capabilities inside one module still count separately", () => {
  // The correction to counting whole modules: an account running core learning,
  // AI authoring and talent assessments is more entrenched than one running a
  // single quiz, even though both are Develop-only.
  const deepDevelop = {
    learning_enrollments: 40, ai_generation_runs: 12, talent_assessment_completed: 8,
  };
  assert.equal(capabilityAdoptionCount(deepDevelop), 3);
  assert.deepEqual(modulesInUse(deepDevelop), ["Develop"]); // concentration, reported separately
});

test("catalogue size is not adoption", () => {
  // A library someone uploaded and nobody opened, plus bought seats. Counting
  // either would re-introduce record-keeping-as-health (docs/decisions/0013).
  const shelfware = {
    learning_items_count: 4000, pathways_count: 120,
    competencies_total: 300, seats: 500, total_users: 480,
  };
  assert.deepEqual(capabilitiesInUse(shelfware), []);
  assert.equal(capabilityAdoptionCount(shelfware), 0);
});

test("no usage snapshot is null, not zero", () => {
  // The distinction the old input could not express: use_cases_rollup.length is
  // always a number, so an unmeasured account scored a hard 0 and the
  // dimension's redistribute_weight policy could never fire.
  assert.equal(capabilityAdoptionCount(null), null);
  assert.equal(capabilityAdoptionCount(undefined), null);
  assert.equal(capabilityAdoptionCount({}), 0); // measured, and nothing is happening
});

test("non-numeric and negative values never count as activity", () => {
  assert.equal(capabilityAdoptionCount({ learning_enrollments: null }), 0);
  assert.equal(capabilityAdoptionCount({ learning_enrollments: Number.NaN }), 0);
  assert.equal(capabilityAdoptionCount({ learning_enrollments: -5 }), 0);
});

test("the top of the scale is reachable — four capabilities, one module", () => {
  // At module grain it was not: three modules exist and the table's top step
  // needs four, so no account could ever score 100.
  const four = {
    learning_completions: 1, ai_generation_runs: 1,
    talent_assessment_completed: 1, ai_assessment_completed: 1,
  };
  assert.equal(capabilityAdoptionCount(four), 4);
});

test("every capability maps to a real module and no metric is claimed twice", () => {
  const seen = new Set<string>();
  for (const [name, cap] of Object.entries(CAPABILITIES)) {
    assert.ok(["Develop", "Perform", "Engage"].includes(cap.module), `${name} has no valid module`);
    assert.ok(cap.metrics.length > 0, `${name} proves nothing`);
    for (const k of cap.metrics) {
      assert.ok(!seen.has(k), `${k} is claimed by more than one capability`);
      seen.add(k);
    }
  }
});
