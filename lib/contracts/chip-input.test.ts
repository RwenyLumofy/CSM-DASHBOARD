import { test } from "node:test";
import assert from "node:assert/strict";
import { addTypedChip, sameChip } from "./chip-input";

const SUGGESTED = ["Go1", "Udemy", "EdX", "Other"];

test("a typed provider the list doesn't have is added as typed", () => {
  assert.deepEqual(addTypedChip(SUGGESTED, ["Go1"], "Coursera"), ["Go1", "Coursera"]);
});

test("a typed value matching a suggestion takes the suggestion's spelling", () => {
  // Otherwise one account reads "edx" and the next "EdX", and neither groups.
  assert.deepEqual(addTypedChip(SUGGESTED, [], "edx"), ["EdX"]);
  assert.deepEqual(addTypedChip(SUGGESTED, [], "  GO1 "), ["Go1"]);
});

test("a provider already selected is not added twice, whatever the casing", () => {
  assert.equal(addTypedChip(SUGGESTED, ["EdX"], "edx"), null);
  assert.equal(addTypedChip(SUGGESTED, ["Coursera"], " coursera"), null);
});

test("blank input changes nothing", () => {
  assert.equal(addTypedChip(SUGGESTED, ["Go1"], ""), null);
  assert.equal(addTypedChip(SUGGESTED, ["Go1"], "   "), null);
});

test("the typed value is trimmed, so a stray space never creates a second provider", () => {
  assert.deepEqual(addTypedChip(SUGGESTED, [], " Coursera "), ["Coursera"]);
});

test("sameChip ignores case and surrounding space only", () => {
  assert.equal(sameChip("EdX", " edx "), true);
  assert.equal(sameChip("Ed X", "EdX"), false);
});
