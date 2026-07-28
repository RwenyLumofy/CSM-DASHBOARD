import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUseCases, resolveUseCase, compareUseCases, isProvisionalOnly,
  useCaseLabel, USE_CASES, USE_CASE_BY_ID,
} from "./use-cases";

test("the HubSpot typo resolves to the correct use case", () => {
  assert.equal(resolveUseCase("Talenet Assesments"), "talent_assessments");
  assert.equal(useCaseLabel("talent_assessments"), "Talent assessments");
});

test("every live value in the database maps to something", () => {
  // The 18 distinct values actually present on client_deals today.
  const live = [
    "Building Job-related Skills", "Qiwa Disclosure", "Centralizing L&D under One Digital Platform",
    "Building Leadership Capabilities", "Upskilling / Reskilling", "Product Knowledge",
    "Compliance and Regulatory Requirements", "Service Knowledge", "Unclear", "Functional Knowledge",
    "Preparing for a New Role (Succession Development)", "Training Needs Analysis (TNA)",
    "Internal Knowledge Base Development", "Onboarding New Joiner", "Other",
    "Preparation for Certification", "Sharing Experience of Top Performers", "Talenet Assesments",
  ];
  const { ids, unmapped } = normalizeUseCases(live);
  assert.deepEqual(unmapped, [], "no live value may be dropped");
  assert.equal(ids.length, 18);
});

test("an unrecognised value is surfaced, never silently dropped", () => {
  const { ids, unmapped } = normalizeUseCases(["Product Knowledge", "Something Nobody Defined"]);
  assert.deepEqual(ids, ["product_knowledge"]);
  assert.deepEqual(unmapped, ["Something Nobody Defined"]);
});

test("aliases collapse duplicates that differ only by spelling", () => {
  const { ids } = normalizeUseCases(["Talenet Assesments", "Talent Assessments", "talent_assessments"]);
  assert.deepEqual(ids, ["talent_assessments"]);
});

test("results come back in taxonomy order, not input order", () => {
  const { ids } = normalizeUseCases(["Qiwa Disclosure", "Onboarding New Joiner"]);
  assert.deepEqual(ids, ["onboarding_new_joiner", "qiwa_disclosure"]);
});

test("'answered we-don't-know' is distinguishable from 'unanswered'", () => {
  assert.equal(isProvisionalOnly([]), false, "no answer is not the same as a provisional one");
  assert.equal(isProvisionalOnly(["unclear"]), true);
  assert.equal(isProvisionalOnly(["unclear", "product_knowledge"]), false);
});

test("sales-declared and CS-confirmed are compared, not merged", () => {
  const c = compareUseCases(
    ["Product Knowledge", "360 Degree Feedback"],          // CS confirmed
    ["Product Knowledge", "Qiwa Disclosure"],              // sales declared
  );
  assert.deepEqual(c.unconfirmed, ["qiwa_disclosure"], "sold but never validated");
  assert.deepEqual(c.emergent, ["feedback_360"], "found by CS, never sold");
  assert.deepEqual(c.confirmed, ["product_knowledge", "feedback_360"]);
});

test("every option has a unique id and a group", () => {
  const ids = USE_CASES.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in the taxonomy");
  for (const u of USE_CASES) assert.ok(u.group, `${u.id} has no group`);
  assert.equal(USE_CASE_BY_ID.size, USE_CASES.length);
});

test("empty and malformed input is handled without throwing", () => {
  for (const bad of [null, undefined, "not an array", 42, [null, 7, ""]]) {
    assert.deepEqual(normalizeUseCases(bad).ids, []);
  }
});
