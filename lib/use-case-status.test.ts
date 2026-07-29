import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLibrary } from "./use-case-library";
import {
  reviewState, statusLine, STATUS_LABEL, STATUS_HELP, STATUS_TONE,
  REVIEW_LABEL, LIFECYCLE_STATUSES, REVIEW_INTERVAL_DAYS,
} from "./use-case-status";

const TODAY = "2026-07-29";
const entry = (o: Record<string, unknown>) => mergeLibrary({ x: { oneLiner: "x", ...o } })[0];
const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString();

test("three lifecycle states, not a five-stage workflow", () => {
  assert.deepEqual([...LIFECYCLE_STATUSES], ["draft", "published", "archived"]);
});

test("every state has a label, an explanation and a tone", () => {
  for (const s of LIFECYCLE_STATUSES) {
    assert.ok(STATUS_LABEL[s], `${s} has no label`);
    assert.ok(STATUS_HELP[s].length > 20, `${s} has no usable explanation`);
    assert.ok(STATUS_TONE[s], `${s} has no tone`);
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

test("the status line carries both axes when either needs attention", () => {
  assert.equal(statusLine(entry({}), TODAY), "Draft · Needs review");
  assert.equal(statusLine(entry({ status: "published", lastReviewedAt: daysAgo(400) }), TODAY),
    `Published · ${REVIEW_LABEL.overdue}`);
});

test("published and freshly reviewed says just 'Published' — the resting state is not news", () => {
  assert.equal(statusLine(entry({ status: "published", lastReviewedAt: daysAgo(10) }), TODAY), "Published");
});

test("a malformed review date is treated as never reviewed, not as valid", () => {
  assert.equal(reviewState(entry({ lastReviewedAt: "not-a-date" }), TODAY), "needs_review");
});
