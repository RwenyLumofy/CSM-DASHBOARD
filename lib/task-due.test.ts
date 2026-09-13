/* Due-date arithmetic for account tasks. The overdue count on the closed Tasks
   trigger and the "Push a week" action both depend on it. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, isOverdue, pushedAWeek } from "./task-due";

test("a task due today is not overdue; yesterday is", () => {
  assert.equal(isOverdue("2026-09-13", "2026-09-13"), false);
  assert.equal(isOverdue("2026-09-12", "2026-09-13"), true);
  assert.equal(isOverdue(null, "2026-09-13"), false);
});

test("a timestamp's time of day does not change which day it is due", () => {
  assert.equal(daysUntil("2026-09-13T23:59:00.000Z", "2026-09-13"), 0);
});

test("pushing a future task moves it a week from its own date", () => {
  assert.equal(pushedAWeek("2026-09-20", "2026-09-13"), "2026-09-27");
});

test("pushing a missed task lands a week from today, not still in the past", () => {
  assert.equal(pushedAWeek("2026-09-03", "2026-09-13"), "2026-09-20");
});

test("pushing a task due today, or undated, gives a week from today", () => {
  assert.equal(pushedAWeek("2026-09-13", "2026-09-13"), "2026-09-20");
  assert.equal(pushedAWeek(null, "2026-09-13"), "2026-09-20");
});

test("month and year boundaries", () => {
  assert.equal(pushedAWeek("2026-12-28", "2026-12-01"), "2027-01-04");
});
