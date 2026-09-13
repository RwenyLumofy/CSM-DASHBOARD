/* Task activity — which edits are recorded in a task's thread, and how they
   read. The point of the feature is that a slipped task leaves a trace. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { activityFor, decodeActivity, describeActivity, encodeActivity } from "./task-activity";

const before = { status: "open", ownerEmail: "zainab@lumofy.com", dueDate: "2026-09-04T00:00:00.000Z" };
const name = (e: string) => ({ "zainab@lumofy.com": "Zainab", "ahmed@lumofy.com": "Ahmed" } as Record<string, string>)[e] ?? e;

test("pushing a date is recorded with where it was and where it went", () => {
  assert.deepEqual(activityFor(before, { dueDate: "2026-09-20" }), [
    { kind: "due_date_changed", from: "2026-09-04", to: "2026-09-20" },
  ]);
});

test("re-saving the same day is not activity, whatever the time format", () => {
  assert.deepEqual(activityFor(before, { dueDate: "2026-09-04" }), []);
});

test("fields the write does not set are not activity", () => {
  assert.deepEqual(activityFor(before, {}), []);
});

test("reassignment ignores case, and records both owners", () => {
  assert.deepEqual(activityFor(before, { ownerEmail: "Zainab@Lumofy.com" }), []);
  assert.deepEqual(activityFor(before, { ownerEmail: "ahmed@lumofy.com" }), [
    { kind: "reassigned", from: "zainab@lumofy.com", to: "ahmed@lumofy.com" },
  ]);
});

test("completing and reopening are recorded; re-completing a done task is not", () => {
  assert.deepEqual(activityFor(before, { status: "done" }), [{ kind: "status_changed", from: "open", to: "done" }]);
  assert.deepEqual(activityFor({ ...before, status: "done" }, { status: "done" }), []);
});

test("one edit can produce several rows", () => {
  assert.equal(activityFor(before, { dueDate: null, ownerEmail: "ahmed@lumofy.com" }).length, 2);
});

test("round-trips through the stored body", () => {
  const a = { kind: "due_date_changed" as const, from: "2026-09-04", to: "2026-09-20" };
  assert.deepEqual(decodeActivity(a.kind, encodeActivity(a)), a);
});

test("a comment or a malformed body is not decoded as activity", () => {
  assert.equal(decodeActivity("comment", '{"from":"a","to":"b"}'), null);
  assert.equal(decodeActivity("reassigned", "not json"), null);
});

test("reads as a sentence", () => {
  assert.equal(describeActivity({ kind: "due_date_changed", from: "2026-09-04", to: "2026-09-20" }, name),
    "moved the due date from 4 Sep to 20 Sep");
  assert.equal(describeActivity({ kind: "due_date_changed", from: null, to: "2026-09-20" }, name), "set the due date to 20 Sep");
  assert.equal(describeActivity({ kind: "due_date_changed", from: "2026-09-04", to: null }, name), "removed the due date (was 4 Sep)");
  assert.equal(describeActivity({ kind: "reassigned", from: "zainab@lumofy.com", to: "ahmed@lumofy.com" }, name),
    "handed this from Zainab to Ahmed");
  assert.equal(describeActivity({ kind: "status_changed", from: "open", to: "done" }, name), "marked this done");
  assert.equal(describeActivity({ kind: "status_changed", from: "done", to: "open" }, name), "reopened this");
});
