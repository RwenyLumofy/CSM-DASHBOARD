import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUseCases, resolveUseCase, compareUseCases, isProvisionalOnly, unresolvedSelections,
  useCaseLabel, useCasesInGroup, USE_CASES, USE_CASE_BY_ID, USE_CASE_GROUPS,
} from "./use-cases";

/* ---- the published taxonomy, checked against the deck ------------------ */

test("23 published use cases across 26 category slots", () => {
  const published = USE_CASES.filter((u) => !u.unresolved && !u.provisional);
  assert.equal(published.length, 23, "the deck defines 23 use cases");
  const slots = published.reduce((n, u) => n + u.groups.length, 0);
  assert.equal(slots, 26, "26 slots — three use cases are cross-listed");
});

test("the three cross-listed use cases sit in two categories each", () => {
  for (const id of ["feedback_360", "certification_prep", "tna"]) {
    assert.equal(USE_CASE_BY_ID.get(id)!.groups.length, 2, `${id} should be in two categories`);
  }
});

test("category counts match the deck exactly", () => {
  const expected: Record<string, number> = {
    enablement: 2, readiness: 9, capability: 6, performance: 5, assessment: 3, engagement: 1,
  };
  for (const [g, n] of Object.entries(expected)) {
    const inGroup = useCasesInGroup(g as never).filter((u) => !u.unresolved && !u.provisional);
    assert.equal(inGroup.length, n, `${g} should hold ${n}, got ${inGroup.length}`);
  }
  assert.equal(USE_CASE_GROUPS.length, 6);
});

/* ---- every live database value still resolves -------------------------- */

test("all 18 live HubSpot values map to something", () => {
  const live = [
    "Building Job-related Skills", "Qiwa Disclosure", "Centralizing L&D under One Digital Platform",
    "Building Leadership Capabilities", "Upskilling / Reskilling", "Product Knowledge",
    "Compliance and Regulatory Requirements", "Service Knowledge", "Unclear", "Functional Knowledge",
    "Preparing for a New Role (Succession Development)", "Training Needs Analysis (TNA)",
    "Internal Knowledge Base Development", "Onboarding New Joiner", "Other",
    "Preparation for Certification", "Sharing Experience of Top Performers", "Talenet Assesments",
  ];
  const { unmapped } = normalizeUseCases(live);
  assert.deepEqual(unmapped, [], "no live value may be dropped");
});

test("Product Knowledge and Service Knowledge collapse into one published use case", () => {
  const { ids } = normalizeUseCases(["Product Knowledge", "Service Knowledge"]);
  assert.deepEqual(ids, ["products_services_knowledge"]);
});

test("the HubSpot typo resolves to the assessment hub", () => {
  assert.equal(resolveUseCase("Talenet Assesments"), "internal_assessment_hub");
  assert.equal(useCaseLabel("internal_assessment_hub"), "Building Internal Assessment Hub");
});

test("both expertise-sharing options fold into one entry", () => {
  const { ids } = normalizeUseCases([
    "Sharing Experience of Top Performers",
    "Sharing Experience of a Subject Matter Expert (SME)",
  ]);
  assert.deepEqual(ids, ["expertise_sharing"]);
});

/* ---- the discrepancy is visible, not silently resolved ----------------- */

test("Qiwa Disclosure keeps working but is flagged as outside the published 23", () => {
  const id = resolveUseCase("Qiwa Disclosure")!;
  assert.equal(id, "qiwa_disclosure");
  assert.equal(USE_CASE_BY_ID.get(id)!.unresolved, true,
    "8 deals use it and the deck has no home for it — that must stay visible");
  assert.deepEqual(unresolvedSelections([id]).map((u) => u.id), ["qiwa_disclosure"]);
});

test("published use cases are not flagged unresolved", () => {
  assert.deepEqual(unresolvedSelections(["compliance_training", "tna"]), []);
});

test("deck labels resolve even though HubSpot cannot yet offer them", () => {
  for (const [label, id] of [
    ["AI Readiness", "ai_readiness"],
    ["Digital Transformation", "digital_transformation"],
    ["Career Transition Readiness", "career_transition"],
    ["End-to-End Talent Strategy Activation", "talent_strategy_activation"],
  ] as const) {
    assert.equal(resolveUseCase(label), id, `${label} should resolve`);
  }
});

/* ---- general behaviour -------------------------------------------------- */

test("an unrecognised value is surfaced, never silently dropped", () => {
  const { ids, unmapped } = normalizeUseCases(["Product Knowledge", "Something Nobody Defined"]);
  assert.deepEqual(ids, ["products_services_knowledge"]);
  assert.deepEqual(unmapped, ["Something Nobody Defined"]);
});

test("'answered we-don't-know' differs from 'unanswered'", () => {
  assert.equal(isProvisionalOnly([]), false);
  assert.equal(isProvisionalOnly(["unclear"]), true);
  assert.equal(isProvisionalOnly(["unclear", "tna"]), false);
});

test("sales-declared and CS-confirmed are compared, not merged", () => {
  const c = compareUseCases(["Product Knowledge", "360 Degree Feedback"], ["Product Knowledge", "Qiwa Disclosure"]);
  assert.deepEqual(c.unconfirmed, ["qiwa_disclosure"]);
  assert.deepEqual(c.emergent, ["feedback_360"]);
});

test("ids are unique and every use case has at least one category", () => {
  const ids = USE_CASES.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  for (const u of USE_CASES) assert.ok(u.groups.length > 0, `${u.id} has no category`);
});

test("malformed input never throws", () => {
  for (const bad of [null, undefined, "not an array", 42, [null, 7, ""]]) {
    assert.deepEqual(normalizeUseCases(bad).ids, []);
  }
});

/* ---- the editorial library stays in step with the taxonomy -------------- */

import { USE_CASE_LIBRARY, LIBRARY_BY_ID, mergeLibrary, isCustomised } from "./use-case-library";

test("every use case in the taxonomy has a library entry, and vice versa", () => {
  for (const u of USE_CASES) {
    assert.ok(LIBRARY_BY_ID.has(u.id), `${u.id} has no definition in the library`);
  }
  for (const e of USE_CASE_LIBRARY) {
    assert.ok(USE_CASE_BY_ID.has(e.id), `library entry ${e.id} is not in the taxonomy`);
  }
});

test("no library entry is left as a stub", () => {
  for (const e of USE_CASE_LIBRARY) {
    assert.ok(e.definition.length > 20, `${e.id}: definition too thin`);
    assert.ok(e.inPractice.length > 20, `${e.id}: inPractice too thin`);
    assert.ok(e.examples.length > 0, `${e.id}: no examples`);
    assert.ok(e.evidence.length > 0, `${e.id}: no evidence`);
    assert.ok(e.pitfall.length > 20, `${e.id}: no pitfall`);
  }
});

test("a team override replaces only the field it touches", () => {
  const merged = mergeLibrary({ tna: { pitfall: "Our own wording." } });
  const tna = merged.find((e) => e.id === "tna")!;
  const base = LIBRARY_BY_ID.get("tna")!;
  assert.equal(tna.pitfall, "Our own wording.");
  assert.equal(tna.definition, base.definition, "an untouched field must survive the edit");
  assert.deepEqual(tna.examples, base.examples);
});

test("an empty override falls back to the baseline rather than blanking it", () => {
  const merged = mergeLibrary({ tna: { definition: "   ", examples: [] } });
  const tna = merged.find((e) => e.id === "tna")!;
  assert.equal(tna.definition, LIBRARY_BY_ID.get("tna")!.definition);
  assert.deepEqual(tna.examples, LIBRARY_BY_ID.get("tna")!.examples);
});

test("customisation is detectable, and audit fields alone don't count", () => {
  assert.equal(isCustomised("tna", { tna: { pitfall: "x" } }), true);
  assert.equal(isCustomised("tna", { tna: { updatedAt: "2026-07-28", updatedBy: "a@b.com" } }), false);
  assert.equal(isCustomised("tna", null), false);
});
