import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  daysUntilDue, selectForToday, surfacesOnToday, type TodayCandidate,
} from "./today-rule";

const TODAY = "2026-08-08";
const t = (id: string, status: TodayCandidate["status"], dueDate: string | null): TodayCandidate =>
  ({ id, status, dueDate });

/* ── the three ways in ──────────────────────────────────────────────────── */

test("blocked surfaces regardless of a distant due date", () => {
  const v = surfacesOnToday(t("a", "blocked", "2026-12-31"), TODAY);
  assert.equal(v.surfaces, true);
  assert.equal(v.reason, "blocked");
});

test("blocked surfaces with no due date at all", () => {
  const v = surfacesOnToday(t("a", "blocked", null), TODAY);
  assert.equal(v.surfaces, true);
  assert.equal(v.reason, "blocked");
  assert.equal(v.daysUntil, null);
});

test("due today surfaces", () => {
  const v = surfacesOnToday(t("a", "todo", TODAY), TODAY);
  assert.equal(v.surfaces, true);
  assert.equal(v.reason, "due_today");
  assert.equal(v.daysUntil, 0);
});

test("overdue surfaces, and reports negative days", () => {
  const v = surfacesOnToday(t("a", "in_progress", "2026-08-01"), TODAY);
  assert.equal(v.surfaces, true);
  assert.equal(v.reason, "overdue");
  assert.equal(v.daysUntil, -7);
});

/* ── the ways out ───────────────────────────────────────────────────────── */

test("due tomorrow does not surface — the boundary is today, not soon", () => {
  assert.equal(surfacesOnToday(t("a", "todo", "2026-08-09"), TODAY).surfaces, false);
});

test("no due date and not blocked does not surface", () => {
  assert.equal(surfacesOnToday(t("a", "todo", null), TODAY).surfaces, false);
});

test("done never surfaces, even when overdue", () => {
  const v = surfacesOnToday(t("a", "done", "2026-01-01"), TODAY);
  assert.equal(v.surfaces, false);
  assert.equal(v.reason, null);
});

test("done beats blocked — a completed task left flagged blocked stays off Today", () => {
  assert.equal(surfacesOnToday(t("a", "done", null), TODAY).surfaces, false);
});

/* ── the clock-time trap ────────────────────────────────────────────────── */

test("a task due today is not overdue because of a timestamp on the date", () => {
  // Both sides carry a time component; only the date part may be compared.
  const v = surfacesOnToday(t("a", "todo", "2026-08-08T23:30:00Z"), "2026-08-08T01:00:00Z");
  assert.equal(v.reason, "due_today");
  assert.equal(v.daysUntil, 0);
});

test("daysUntilDue is null for an unparseable date", () => {
  assert.equal(daysUntilDue("not-a-date", TODAY), null);
});

test("an unparseable due date does not surface the task", () => {
  assert.equal(surfacesOnToday(t("a", "todo", "not-a-date"), TODAY).surfaces, false);
});

/* ── selection and ordering ─────────────────────────────────────────────── */

test("selectForToday returns only qualifying tasks", () => {
  const board = [
    t("blocked", "blocked", "2026-09-30"),
    t("today", "todo", TODAY),
    t("late", "todo", "2026-08-05"),
    t("future", "todo", "2026-09-01"),
    t("nodate", "in_progress", null),
    t("finished", "done", "2026-07-01"),
  ];
  const picked = selectForToday(board, TODAY).map((r) => r.task.id);
  assert.deepEqual(picked, ["blocked", "late", "today"]);
});

test("blocked ranks first, then most overdue, then due today", () => {
  const board = [
    t("today", "todo", TODAY),
    t("late2", "todo", "2026-08-06"),
    t("late9", "todo", "2026-07-30"),
    t("blocked", "blocked", null),
  ];
  const picked = selectForToday(board, TODAY);
  assert.deepEqual(picked.map((r) => r.task.id), ["blocked", "late9", "late2", "today"]);
  assert.deepEqual(picked.map((r) => r.reason), ["blocked", "overdue", "overdue", "due_today"]);
});

test("an empty board yields nothing", () => {
  assert.deepEqual(selectForToday([], TODAY), []);
});

test("the rule is narrow — a realistic board surfaces one row, not the plan", () => {
  const board = [
    t("1", "done", "2026-03-04"), t("2", "done", "2026-03-10"),
    t("3", "done", "2026-04-14"), t("4", "done", "2026-04-28"),
    t("5", "done", "2026-07-20"), t("6", "in_progress", "2026-08-11"),
    t("7", "blocked", "2026-08-22"), t("8", "todo", "2026-09-05"),
    t("9", "todo", "2026-09-19"), t("10", "todo", "2026-10-15"),
  ];
  assert.deepEqual(selectForToday(board, TODAY).map((r) => r.task.id), ["7"]);
});
