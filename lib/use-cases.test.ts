import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUseCases, resolveUseCase, compareUseCases, unresolvedSelections,
  useCaseLabel, useCasesInGroup, USE_CASES, USE_CASE_BY_ID, USE_CASE_GROUPS,
} from "./use-cases";

/* ---- the published taxonomy, checked against the deck ------------------ */

test("23 published use cases across 26 category slots", () => {
  const published = USE_CASES.filter((u) => !u.unresolved);
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
    const inGroup = useCasesInGroup(g as never).filter((u) => !u.unresolved);
    assert.equal(inGroup.length, n, `${g} should hold ${n}, got ${inGroup.length}`);
  }
  assert.equal(USE_CASE_GROUPS.length, 6);
});

/* ---- every live database value still resolves -------------------------- */

test("all 18 live HubSpot values map to something", () => {
  // "Unclear" and "Other" are deliberately excluded — they were removed from
  // the taxonomy and are expected to read as unrecognised.
  const live = [
    "Building Job-related Skills", "Qiwa Disclosure", "Centralizing L&D under One Digital Platform",
    "Building Leadership Capabilities", "Upskilling / Reskilling", "Product Knowledge",
    "Compliance and Regulatory Requirements", "Service Knowledge", "Functional Knowledge",
    "Preparing for a New Role (Succession Development)", "Training Needs Analysis (TNA)",
    "Internal Knowledge Base Development", "Onboarding New Joiner",
    "Preparation for Certification", "Sharing Experience of Top Performers", "Talenet Assesments",
  ];
  const { unmapped } = normalizeUseCases(live);
  assert.deepEqual(unmapped, [], "no real value may be dropped");
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

test("'Unclear' and 'Other' no longer resolve — they record a gap, not a use case", () => {
  assert.equal(resolveUseCase("Unclear"), null);
  assert.equal(resolveUseCase("Other"), null);
  const { ids, unmapped } = normalizeUseCases(["Unclear", "Other", "Compliance Training"]);
  assert.deepEqual(ids, ["compliance_training"]);
  assert.deepEqual(unmapped, ["Unclear", "Other"], "surfaced as unrecognised rather than silently dropped");
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

/* ---- nothing is shipped as authored content ---------------------------- */

import { USE_CASE_LIBRARY, mergeLibrary, isCustomised, completeness } from "./use-case-library";

test("no use-case description ships with the product", () => {
  assert.equal(USE_CASE_LIBRARY.length, 0,
    "descriptions must come from the team, not the codebase — an invented one reads as doctrine");
});

test("with nothing written, there is nothing to show", () => {
  assert.deepEqual(mergeLibrary(null), []);
  assert.deepEqual(mergeLibrary({}), []);
});

test("only what the team wrote comes back", () => {
  const out = mergeLibrary({ tna: { goal: "Ours.", soundsLike: ["we don't know what to train"] } });
  assert.equal(out.length, 1);
  assert.equal(out[0].goal, "Ours.");
  assert.deepEqual(out[0].soundsLike, ["we don't know what to train"]);
  assert.deepEqual(out[0].delivers, [], "an unwritten field stays empty rather than being filled in");
});

test("an override holding only audit fields is not a description", () => {
  assert.deepEqual(mergeLibrary({ tna: { updatedAt: "2026-07-28", updatedBy: "a@b.com" } }), []);
  assert.equal(isCustomised("tna", { tna: { updatedAt: "x", updatedBy: "y" } }), false);
});

test("metadata alone is not a description either", () => {
  assert.deepEqual(mergeLibrary({ tna: { modules: ["Perform"], sourceUrl: "https://notion.so/x" } }), [],
    "a module tag tells a CSM nothing on its own");
});

test("blank strings and empty lines do not count", () => {
  assert.deepEqual(mergeLibrary({ tna: { goal: "   ", soundsLike: ["", "  "] } }), []);
});

test("a confusedWith entry without an id is dropped", () => {
  const out = mergeLibrary({
    tna: { goal: "x", confusedWith: [{ id: "", distinction: "y" }, { id: "feedback_360", distinction: "z" }] },
  });
  assert.deepEqual(out[0].confusedWith.map((c) => c.id), ["feedback_360"]);
});

test("an unknown module is filtered out", () => {
  const out = mergeLibrary({ tna: { goal: "x", modules: ["Perform", "Nonsense"] as never } });
  assert.deepEqual(out[0].modules, ["Perform"]);
});

test("completeness counts the five written fields, not metadata", () => {
  assert.equal(completeness(undefined), 0);
  const one = mergeLibrary({ tna: { goal: "x" } })[0];
  assert.equal(completeness(one), 1 / 5);
  const all = mergeLibrary({ tna: {
    goal: "x", soundsLike: ["a"], delivers: ["b"], watchFor: ["c"],
    confusedWith: [{ id: "feedback_360", distinction: "d" }],
    modules: ["Perform"], sourceUrl: "https://notion.so/x",
  } })[0];
  assert.equal(completeness(all), 1);
});
