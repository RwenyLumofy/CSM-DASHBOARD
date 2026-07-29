import { test } from "node:test";
import assert from "node:assert/strict";
import { USE_CASES } from "./use-cases";
import {
  normalizeOverlay, resolveTaxonomy, resolveGroups, resolveThroughMerges,
  newUseCaseId, isShippedGroup, type TaxonomyOverlay,
} from "./use-case-overlay";

test("an empty overlay is exactly the shipped list", () => {
  const t = resolveTaxonomy({});
  assert.equal(t.length, USE_CASES.length);
  assert.deepEqual(t.map((u) => u.id), USE_CASES.map((u) => u.id));
});

test("renaming a shipped entry changes the label but not the id", () => {
  const t = resolveTaxonomy({ renamed: { tna: { label: "Skills Gap Analysis" } } });
  const tna = t.find((u) => u.id === "tna")!;
  assert.equal(tna.label, "Skills Gap Analysis");
  assert.equal(tna.id, "tna", "the id must survive a rename — accounts are recorded against it");
  assert.equal(tna.edited, true);
});

test("recategorising replaces the categories rather than adding to them", () => {
  const t = resolveTaxonomy({ renamed: { tna: { groups: ["assessment"] } } });
  assert.deepEqual(t.find((u) => u.id === "tna")!.groups, ["assessment"]);
});

test("an added use case appears and is flagged as custom", () => {
  const t = resolveTaxonomy({
    added: { uc_qiwa: { id: "uc_qiwa", label: "Qiwa Disclosure", summary: "Saudi disclosure.", groups: ["readiness"] } },
  });
  const q = t.find((u) => u.id === "uc_qiwa")!;
  assert.equal(q.label, "Qiwa Disclosure");
  assert.equal(q.custom, true);
  assert.equal(t.length, USE_CASES.length + 1);
});

test("a retired entry leaves the live list but is still retrievable", () => {
  const o: TaxonomyOverlay = { retired: { tna: { reason: "folded into discovery" } } };
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

/* ---- categories ------------------------------------------------------- */

test("team categories are appended to the shipped six", () => {
  const g = resolveGroups({ groups: { grp_x: { id: "grp_x", label: "Someone is moving", blurb: "trigger" } } });
  assert.equal(g.length, 7);
  assert.equal(g[g.length - 1].label, "Someone is moving");
});

/* ---- normalisation ---------------------------------------------------- */

test("an added entry with no label is dropped rather than rendering blank", () => {
  const o = normalizeOverlay({ added: { x: { id: "x", summary: "no name" } } });
  assert.equal(Object.keys(o.added ?? {}).length, 0);
});

test("malformed overlays never throw", () => {
  for (const bad of [null, undefined, "nope", 7, { renamed: "wrong" }, { added: [1, 2] }]) {
    assert.doesNotThrow(() => resolveTaxonomy(normalizeOverlay(bad)));
  }
});

test("generated ids are unique and cannot collide with a shipped id", () => {
  const ids = new Set(Array.from({ length: 200 }, newUseCaseId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.equal(USE_CASES.some((u) => u.id === id), false);
});

/* ---- categories are fully editable, shipped ones included -------------- */

test("a shipped category can be renamed, keeping its id", () => {
  const g = resolveGroups({ groups: { enablement: { id: "enablement", label: "Operating model", blurb: "how L&D runs" } } });
  const e = g.find((x) => x.id === "enablement")!;
  assert.equal(e.label, "Operating model");
  assert.equal(g.length, 6, "renaming must not create a duplicate");
});

test("renaming without a blurb keeps the shipped one", () => {
  const g = resolveGroups({ groups: { enablement: { id: "enablement", label: "Operating model", blurb: "" } } });
  assert.ok(g.find((x) => x.id === "enablement")!.blurb.length > 0);
});

test("a removed shipped category disappears but its id still exists in code", () => {
  const g = resolveGroups({ hiddenGroups: ["engagement"] });
  assert.equal(g.length, 5);
  assert.equal(g.some((x) => x.id === "engagement"), false);
});

test("renaming a removed category brings it back", () => {
  // saveCategoryAction clears the hidden flag; this asserts the resolver agrees.
  const g = resolveGroups({ hiddenGroups: [], groups: { engagement: { id: "engagement", label: "People", blurb: "" } } });
  assert.equal(g.find((x) => x.id === "engagement")!.label, "People");
});

test("team categories sit after the shipped ones and are removable", () => {
  const withCustom = resolveGroups({ groups: { grp_a: { id: "grp_a", label: "Someone is moving", blurb: "" } } });
  assert.equal(withCustom.length, 7);
  assert.equal(withCustom[6].id, "grp_a");
  assert.equal(resolveGroups({ groups: { grp_a: { id: "grp_a", label: "X", blurb: "" } }, hiddenGroups: ["grp_a"] }).length, 6);
});

test("isShippedGroup tells the two apart", () => {
  assert.equal(isShippedGroup("enablement"), true);
  assert.equal(isShippedGroup("grp_whatever"), false);
});
