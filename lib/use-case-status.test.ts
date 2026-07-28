import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLibrary } from "./use-case-library";
import {
  definitionStatus, publishBlockers, completenessLabel,
  STATUS_LABEL, STATUS_HELP, STATUS_TONE, DEFINITION_STATUSES,
} from "./use-case-status";

const entry = (o: Record<string, unknown>) => mergeLibrary({ x: o })[0];

test("nothing written reads 'Needs definition', never 'Draft'", () => {
  assert.equal(definitionStatus(undefined), "needs_definition");
  assert.equal(definitionStatus(entry({ goal: "x" })), "draft");
});

test("an explicitly set status wins over the derived one", () => {
  assert.equal(definitionStatus(undefined, "published"), "published");
  assert.equal(definitionStatus(entry({ goal: "x" }), "archived"), "archived");
});

test("a nonsense stored status falls back to derivation rather than rendering blank", () => {
  assert.equal(definitionStatus(undefined, "banana"), "needs_definition");
});

test("every status has a label, an explanation and a tone", () => {
  for (const s of DEFINITION_STATUSES) {
    assert.ok(STATUS_LABEL[s], `${s} has no label`);
    assert.ok(STATUS_HELP[s].length > 20, `${s} has no usable explanation`);
    assert.ok(STATUS_TONE[s], `${s} has no tone`);
  }
});

test("publish blockers name what is missing", () => {
  assert.deepEqual(publishBlockers(undefined),
    ["the goal", "how a client describes it", "what we deliver", "at least one module"]);
  const full = entry({ goal: "g", soundsLike: ["s"], delivers: ["d"], modules: ["Perform"] });
  assert.deepEqual(publishBlockers(full), []);
});

test("the completeness label always states the gap, never a bare percentage", () => {
  const label = completenessLabel(entry({ goal: "g" }));
  assert.match(label, /^Definition \d+% complete · missing /);
  assert.ok(label.includes("what we deliver"));
});

test("a complete definition drops the 'missing' clause", () => {
  const full = entry({
    goal: "g", soundsLike: ["s"], delivers: ["d"], watchFor: ["w"],
    confusedWith: [{ id: "tna", distinction: "x" }], modules: ["Perform"],
  });
  assert.equal(completenessLabel(full), "Definition 100% complete");
});
