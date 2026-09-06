/* =========================================================================
   Wording and direction for health tier moves.

   These rules decide what a CSM reads in their notifications first thing in
   the morning, and one of them — "level" — exists for a case that is easy to
   assume impossible: the Pulse cap can change an account's band without
   changing its score at all. Calling that a drop would be a guess; calling it
   a rise would be wrong.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { direction, describeTransition, type TierMove } from "./health-change-phrasing";

const move = (over: Partial<TierMove> = {}): TierMove => ({
  clientName: "Almarai",
  fromTier: "Healthy",
  toTier: "At risk",
  fromScore: 74,
  toScore: 58,
  ...over,
});

test("a falling score is a drop", () => {
  assert.equal(direction(move()), "down");
});

test("a rising score is an improvement", () => {
  assert.equal(direction(move({ fromTier: "At risk", toTier: "Healthy", fromScore: 61, toScore: 78 })), "up");
});

test("an unchanged score is level, not a drop — the Pulse cap moves the tier alone", () => {
  assert.equal(direction(move({ fromScore: 70, toScore: 70 })), "level");
});

test("an unknown previous score is level rather than a guessed direction", () => {
  assert.equal(direction(move({ fromScore: null })), "level");
});

test("direction is read off the score, never off the tier names", () => {
  // Tiers are admin-renameable, so a move INTO a tier called "Healthy" is not
  // evidence of improvement. Only the score settles it.
  assert.equal(direction(move({ fromTier: "Poor", toTier: "Healthy", fromScore: 80, toScore: 40 })), "down");
});

test("the title carries the direction in words, not only in colour", () => {
  assert.equal(describeTransition(move()).title, "Almarai dropped to At risk");
  assert.equal(
    describeTransition(move({ fromTier: "At risk", toTier: "Healthy", fromScore: 61, toScore: 78 })).title,
    "Almarai improved to Healthy",
  );
  assert.equal(describeTransition(move({ fromScore: 70, toScore: 70 })).title, "Almarai moved to At risk");
});

test("the body names both tiers and both scores", () => {
  assert.equal(
    describeTransition(move()).body,
    "Health tier changed from Healthy to At risk. Score 74 → 58.",
  );
});

test("a missing previous score reports the new one instead of a fake delta", () => {
  assert.equal(
    describeTransition(move({ fromScore: null })).body,
    "Health tier changed from Healthy to At risk. Now scoring 58.",
  );
});
