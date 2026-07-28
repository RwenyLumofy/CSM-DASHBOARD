import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLibrary } from "./use-case-library";
import { definitionStatus, STATUS_LABEL, STATUS_HELP, STATUS_TONE, DEFINITION_STATUSES } from "./use-case-status";

const entry = (o: Record<string, unknown>) => mergeLibrary({ x: o })[0];

test("status is derived from whether anything is written", () => {
  assert.equal(definitionStatus(undefined), "needs_definition");
  assert.equal(definitionStatus(entry({ goal: "x" })), "described");
});

test("metadata alone does not count as described", () => {
  // mergeLibrary drops metadata-only overrides, so nothing reaches the status.
  assert.equal(definitionStatus(entry({ modules: ["Perform"] })), "needs_definition");
});

test("there are two states, not a publishing workflow nobody maintains", () => {
  assert.deepEqual([...DEFINITION_STATUSES], ["needs_definition", "described"]);
});

test("every state has a label, an explanation and a tone", () => {
  for (const s of DEFINITION_STATUSES) {
    assert.ok(STATUS_LABEL[s], `${s} has no label`);
    assert.ok(STATUS_HELP[s].length > 20, `${s} has no usable explanation`);
    assert.ok(STATUS_TONE[s], `${s} has no tone`);
  }
});
