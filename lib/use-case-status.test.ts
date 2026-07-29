import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLibrary } from "./use-case-library";
import {
  reviewState, statusLine, statusTone, STATUS_LABEL, STATUS_HELP, STATUS_TONE,
  REVIEW_LABEL, REVIEW_TONE, REVIEW_STATES, LIFECYCLE_STATUSES, REVIEW_INTERVAL_DAYS,
} from "./use-case-status";

const TODAY = "2026-07-29";
const entry = (o: Record<string, unknown>) => mergeLibrary({ x: { oneLiner: "x", ...o } })[0];
const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString();

test("draft is gone — a use case is offered or it is not", () => {
  assert.deepEqual([...LIFECYCLE_STATUSES], ["active", "archived"]);
});

test("every state has a label, an explanation and a tone", () => {
  for (const s of LIFECYCLE_STATUSES) {
    assert.ok(STATUS_LABEL[s], `${s} has no label`);
    assert.ok(STATUS_HELP[s].length > 20, `${s} has no usable explanation`);
    assert.ok(STATUS_TONE[s], `${s} has no tone`);
  }
  for (const r of REVIEW_STATES) {
    assert.ok(REVIEW_LABEL[r], `${r} has no label`);
    assert.ok(REVIEW_TONE[r], `${r} has no tone`);
  }
});

test("never reviewed reads 'Needs review', not 'Reviewed' by default", () => {
  assert.equal(reviewState(entry({}), TODAY), "needs_review");
  assert.equal(reviewState(undefined, TODAY), "needs_review");
});

test("review goes overdue only past the interval", () => {
  assert.equal(reviewState(entry({ lastReviewedAt: daysAgo(REVIEW_INTERVAL_DAYS - 1) }), TODAY), "reviewed");
  assert.equal(reviewState(entry({ lastReviewedAt: daysAgo(REVIEW_INTERVAL_DAYS + 1) }), TODAY), "overdue");
});

test("the status line says the one thing worth saying", () => {
  assert.equal(statusLine(entry({}), TODAY), REVIEW_LABEL.needs_review);
  assert.equal(statusLine(entry({ lastReviewedAt: daysAgo(400) }), TODAY), REVIEW_LABEL.overdue);
});

test("an active, freshly reviewed entry says nothing at all", () => {
  assert.equal(statusLine(entry({ lastReviewedAt: daysAgo(10) }), TODAY), "",
    "a chip every page wears is a chip nobody reads");
});

test("archived outranks review state — it changes whether to use the entry at all", () => {
  assert.equal(statusLine(entry({ status: "archived", lastReviewedAt: daysAgo(400) }), TODAY), "Archived");
  assert.equal(statusTone(entry({ status: "archived" }), TODAY), STATUS_TONE.archived);
});

test("tone follows whatever the line decided to show", () => {
  assert.equal(statusTone(entry({}), TODAY), REVIEW_TONE.needs_review);
  assert.equal(statusTone(entry({ lastReviewedAt: daysAgo(400) }), TODAY), REVIEW_TONE.overdue);
});

test("a malformed review date is treated as never reviewed, not as valid", () => {
  assert.equal(reviewState(entry({ lastReviewedAt: "not-a-date" }), TODAY), "needs_review");
});
