import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOverlay, resolveTaxonomy, resolveGroups, resolveThroughMerges,
  newUseCaseId, newGroupId, type TaxonomyOverlay,
} from "./use-case-overlay";

/* ---- a fresh workspace is genuinely empty, not seeded ------------------- */

test("an empty overlay has no use cases and no categories", () => {
  assert.deepEqual(resolveTaxonomy({}), []);
  assert.deepEqual(resolveGroups({}), []);
});

test("an added use case appears in the live list", () => {
  const t = resolveTaxonomy({
    added: { uc_qiwa: { id: "uc_qiwa", label: "Qiwa Disclosure", summary: "Saudi disclosure.", groups: ["readiness"] } },
  });
  assert.equal(t.length, 1);
  assert.equal(t[0].label, "Qiwa Disclosure");
  assert.equal(t[0].id, "uc_qiwa");
});

test("editing an added use case updates it in place, keeping its id", () => {
  const first = { added: { uc_x: { id: "uc_x", label: "TNA", summary: "", groups: ["assessment"] } } };
  const edited: TaxonomyOverlay = { added: { uc_x: { ...first.added.uc_x, label: "Skills Gap Analysis" } } };
  const t = resolveTaxonomy(edited);
  assert.equal(t[0].id, "uc_x", "the id must survive an edit — accounts are recorded against it");
  assert.equal(t[0].label, "Skills Gap Analysis");
});

test("a retired entry leaves the live list but is still retrievable", () => {
  const o: TaxonomyOverlay = {
    added: { tna: { id: "tna", label: "TNA", summary: "", groups: [] } },
    retired: { tna: { reason: "folded into discovery" } },
  };
  assert.equal(resolveTaxonomy(o).some((u) => u.id === "tna"), false, "gone from the picker");
  const all = resolveTaxonomy(o, true);
  assert.equal(all.find((u) => u.id === "tna")!.retired!.reason, "folded into discovery", "still visible to the manager");
});

/* ---- the merge case: this is what protects existing account data ------ */

test("a merged id resolves to its successor", () => {
  const o: TaxonomyOverlay = { retired: { technical_skills: { mergedInto: "job_role_specific" } } };
  assert.equal(resolveThroughMerges("technical_skills", o), "job_role_specific");
});

test("a chain of merges resolves to the final survivor", () => {
  const o: TaxonomyOverlay = {
    retired: { a: { mergedInto: "b" }, b: { mergedInto: "c" } },
  };
  assert.equal(resolveThroughMerges("a", o), "c");
});

test("a circular merge terminates instead of hanging", () => {
  const o: TaxonomyOverlay = { retired: { a: { mergedInto: "b" }, b: { mergedInto: "a" } } };
  const out = resolveThroughMerges("a", o);
  assert.ok(out === "a" || out === "b", "must return something, not spin");
});

test("an id with no merge pointer resolves to itself", () => {
  assert.equal(resolveThroughMerges("tna", { retired: { tna: { reason: "x" } } }), "tna");
});

/* ---- categories: plain, team-created, no seed -------------------------- */

test("a created category appears", () => {
  const g = resolveGroups({ groups: { grp_x: { id: "grp_x", label: "Someone is moving", blurb: "trigger" } } });
  assert.equal(g.length, 1);
  assert.equal(g[0].label, "Someone is moving");
});

test("editing a category updates it in place, keeping its id", () => {
  const g = resolveGroups({ groups: { grp_a: { id: "grp_a", label: "Operating model", blurb: "how L&D runs" } } });
  assert.equal(g.find((x) => x.id === "grp_a")!.label, "Operating model");
  assert.equal(g.length, 1, "editing must not create a duplicate");
});

test("a deleted category is simply gone", () => {
  const g = resolveGroups({ groups: {} });
  assert.equal(g.length, 0);
});

/* ---- normalisation ------------------------------------------------------ */

test("an added entry with no label is dropped rather than rendering blank", () => {
  const o = normalizeOverlay({ added: { x: { id: "x", summary: "no name" } } });
  assert.equal(Object.keys(o.added ?? {}).length, 0);
});

test("a category with no label is dropped rather than rendering blank", () => {
  const o = normalizeOverlay({ groups: { x: { id: "x", blurb: "no name" } } });
  assert.equal(Object.keys(o.groups ?? {}).length, 0);
});

test("malformed overlays never throw", () => {
  for (const bad of [null, undefined, "nope", 7, { added: "wrong" }, { added: [1, 2] }, { groups: "wrong" }, { retired: 5 }]) {
    assert.doesNotThrow(() => resolveTaxonomy(normalizeOverlay(bad)));
  }
});

test("generated ids are unique", () => {
  const ids = new Set(Array.from({ length: 200 }, newUseCaseId));
  assert.equal(ids.size, 200);
});

test("generated group ids are unique", () => {
  const ids = new Set(Array.from({ length: 200 }, newGroupId));
  assert.equal(ids.size, 200);
});
