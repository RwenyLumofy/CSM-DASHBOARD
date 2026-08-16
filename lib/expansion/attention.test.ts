import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attention, needsAttention, dueState, momentum, primaryStep, isClosed,
  surfacesOnActionList, daysSince, ATTENTION_ORDER,
  STALE_DAYS, WAITING_DAYS, PROGRESSED_DAYS,
  type AttentionInput, type AttentionState,
} from "./attention";

/* Every number on the Expansion page traces back to attention(). These tests
   are the reason it lives outside the components: the rule is the feature. */

const TODAY = "2026-08-13";
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ago = (n: number) => day(-n);

/** A live opportunity: moved today, one step due in a week. Calm by default, so
 *  each test changes exactly the one thing it is about. */
const opp = (o: Partial<AttentionInput> = {}): AttentionInput => ({
  stage: "qualified",
  outcome: null,
  lastActivityAt: TODAY,
  stageChangedAt: TODAY,
  nextSteps: [{ id: "s1", text: "Chase the quote", dueDate: day(7) }],
  ...o,
});

const step = (dueDate: string, id = "s1") => ({ id, text: "step", dueDate });

/* ── The queue ────────────────────────────────────────────────────────────── */

test("next steps are a queue: the soonest due is 'next', whatever the order", () => {
  const o = opp({ nextSteps: [step(day(9), "c"), step(day(2), "a"), step(day(5), "b")] });
  assert.equal(primaryStep(o)?.id, "a");
  assert.equal(dueState(o, TODAY).label, "Due in 2 days");
});

test("several steps: the card reads the soonest even when a later one is fine", () => {
  const o = opp({ nextSteps: [step(day(30), "later"), step(ago(3), "late")] });
  assert.equal(primaryStep(o)?.id, "late");
  assert.equal(attention(o, TODAY).state, "overdue");
});

test("a tie on due date resolves the same way every time", () => {
  const a = opp({ nextSteps: [step(day(1), "b"), step(day(1), "a")] });
  const b = opp({ nextSteps: [step(day(1), "a"), step(day(1), "b")] });
  assert.equal(primaryStep(a)?.id, primaryStep(b)?.id);
});

test("no steps at all is 'No next step', not 'due today'", () => {
  assert.equal(dueState(opp({ nextSteps: [] }), TODAY).state, "none");
});

/* ── Read-out 1: due state ────────────────────────────────────────────────── */

test("due state reads the calendar, not the clock", () => {
  assert.equal(dueState(opp({ nextSteps: [step(ago(1))] }), TODAY).label, "1 day overdue");
  assert.equal(dueState(opp({ nextSteps: [step(ago(5))] }), TODAY).label, "5 days overdue");
  assert.equal(dueState(opp({ nextSteps: [step(TODAY)] }), TODAY).label, "Due today");
  assert.equal(dueState(opp({ nextSteps: [step(day(1))] }), TODAY).label, "Due tomorrow");
  assert.equal(dueState(opp({ nextSteps: [step(day(3))] }), TODAY).label, "Due in 3 days");
  assert.equal(dueState(opp({ nextSteps: [step(day(4))] }), TODAY).state, "later");
});

test("a full timestamp and a bare date are the same calendar day", () => {
  assert.equal(daysSince("2026-08-01T23:59:00.000Z", TODAY), daysSince("2026-08-01", TODAY));
});

/* ── Read-out 2: momentum ─────────────────────────────────────────────────── */

test("stalled at exactly STALE_DAYS, not a day later", () => {
  assert.equal(momentum(opp({ lastActivityAt: ago(STALE_DAYS - 1) }), TODAY).state, "progressed");
  assert.equal(momentum(opp({ lastActivityAt: ago(STALE_DAYS), stageChangedAt: ago(STALE_DAYS) }), TODAY).state, "stalled");
});

test("waiting applies only at Proposed — silence elsewhere is not the client's fault", () => {
  const quiet = { lastActivityAt: ago(WAITING_DAYS + 2), stageChangedAt: ago(WAITING_DAYS + 2) };
  assert.equal(momentum(opp({ ...quiet, stage: "proposed" }), TODAY).state, "waiting");
  for (const stage of ["identified", "qualified"] as const) {
    assert.notEqual(momentum(opp({ ...quiet, stage }), TODAY).state, "waiting");
  }
});

test("waiting starts at exactly WAITING_DAYS", () => {
  const at = (n: number) => momentum(opp({ stage: "proposed", lastActivityAt: ago(n), stageChangedAt: ago(n) }), TODAY).state;
  assert.notEqual(at(WAITING_DAYS - 1), "waiting");
  assert.equal(at(WAITING_DAYS), "waiting");
});

test("stalled outranks waiting — 20 days of silence is not a client politely thinking", () => {
  const o = opp({ stage: "proposed", lastActivityAt: ago(20), stageChangedAt: ago(20) });
  assert.equal(momentum(o, TODAY).state, "stalled");
});

test("a stage move stays news for PROGRESSED_DAYS, then stops", () => {
  const at = (n: number) => momentum(opp({ stageChangedAt: ago(n), lastActivityAt: ago(n) }), TODAY).state;
  assert.equal(at(0), "progressed");
  assert.equal(at(PROGRESSED_DAYS), "progressed");
  assert.equal(at(PROGRESSED_DAYS + 1), "moving");
});

/* ── Precedence: exactly one primary state ────────────────────────────────── */

test("no_next_step outranks everything, including overdue-by-absence", () => {
  const o = opp({ nextSteps: [], lastActivityAt: ago(20), stageChangedAt: ago(20) });
  assert.equal(attention(o, TODAY).state, "no_next_step");
});

test("overdue outranks stalled", () => {
  const o = opp({ nextSteps: [step(ago(2))], lastActivityAt: ago(20), stageChangedAt: ago(20) });
  assert.equal(attention(o, TODAY).state, "overdue");
});

test("stalled outranks waiting", () => {
  const o = opp({ stage: "proposed", nextSteps: [step(day(9))], lastActivityAt: ago(20), stageChangedAt: ago(20) });
  assert.equal(attention(o, TODAY).state, "stalled");
});

test("waiting outranks due_soon", () => {
  const o = opp({ stage: "proposed", nextSteps: [step(day(1))], lastActivityAt: ago(6), stageChangedAt: ago(6) });
  assert.equal(attention(o, TODAY).state, "waiting");
});

test("due_soon outranks progressed", () => {
  const o = opp({ nextSteps: [step(TODAY)], stageChangedAt: TODAY, lastActivityAt: TODAY });
  assert.equal(attention(o, TODAY).state, "due_soon");
});

test("progressed outranks normal", () => {
  const o = opp({ nextSteps: [step(day(30))], stageChangedAt: ago(2), lastActivityAt: ago(2) });
  assert.equal(attention(o, TODAY).state, "progressed");
});

test("nothing true at all is normal", () => {
  const o = opp({ nextSteps: [step(day(30))], stageChangedAt: ago(9), lastActivityAt: ago(9) });
  assert.equal(attention(o, TODAY).state, "normal");
});

test("every state in the precedence list is reachable and unique", () => {
  assert.equal(new Set(ATTENTION_ORDER).size, ATTENTION_ORDER.length);
  const reached: AttentionState[] = [
    attention(opp({ nextSteps: [] }), TODAY).state,
    attention(opp({ nextSteps: [step(ago(2))] }), TODAY).state,
    attention(opp({ nextSteps: [step(day(9))], lastActivityAt: ago(20), stageChangedAt: ago(20) }), TODAY).state,
    attention(opp({ stage: "proposed", nextSteps: [step(day(9))], lastActivityAt: ago(6), stageChangedAt: ago(6) }), TODAY).state,
    attention(opp({ nextSteps: [step(TODAY)] }), TODAY).state,
    attention(opp({ nextSteps: [step(day(30))], stageChangedAt: ago(2), lastActivityAt: ago(2) }), TODAY).state,
    attention(opp({ nextSteps: [step(day(30))], stageChangedAt: ago(9), lastActivityAt: ago(9) }), TODAY).state,
    attention(opp({ outcome: "won", stage: "closed" }), TODAY).state,
  ];
  assert.deepEqual([...reached].sort(), [...ATTENTION_ORDER].sort());
});

/* ── Never two competing warnings ─────────────────────────────────────────── */

test("a second true condition becomes quiet context, not a second warning", () => {
  const o = opp({ stage: "proposed", nextSteps: [step(ago(5))], lastActivityAt: ago(8), stageChangedAt: ago(8) });
  const a = attention(o, TODAY);
  assert.equal(a.label, "5 days overdue");
  assert.equal(a.secondary, "waiting 8d");
  assert.equal(a.tone, "danger");
});

test("secondary is null when there is nothing else to say", () => {
  assert.equal(attention(opp({ nextSteps: [step(ago(1))] }), TODAY).secondary, null);
});

/* ── Closed ───────────────────────────────────────────────────────────────── */

test("a closed opportunity never needs attention, whatever else is true of it", () => {
  for (const outcome of ["won", "lost", "dropped"] as const) {
    const o = opp({ stage: "closed", outcome, nextSteps: [], lastActivityAt: ago(400), stageChangedAt: ago(400) });
    assert.equal(isClosed(o), true);
    assert.equal(attention(o, TODAY).state, "closed");
    assert.equal(needsAttention(o, TODAY), false);
    assert.equal(surfacesOnActionList(o, TODAY), false);
  }
});

/* ── The count, and the Action list ───────────────────────────────────────── */

test("needs attention is exactly no_next_step, overdue and stalled", () => {
  const needs: Record<string, boolean> = {};
  for (const [label, o] of [
    ["no_next_step", opp({ nextSteps: [] })],
    ["overdue", opp({ nextSteps: [step(ago(1))] })],
    ["stalled", opp({ nextSteps: [step(day(9))], lastActivityAt: ago(20), stageChangedAt: ago(20) })],
    ["waiting", opp({ stage: "proposed", nextSteps: [step(day(9))], lastActivityAt: ago(6), stageChangedAt: ago(6) })],
    ["due_soon", opp({ nextSteps: [step(TODAY)] })],
    ["progressed", opp({ nextSteps: [step(day(30))], stageChangedAt: ago(2), lastActivityAt: ago(2) })],
    ["normal", opp({ nextSteps: [step(day(30))], stageChangedAt: ago(9), lastActivityAt: ago(9) })],
  ] as [string, AttentionInput][]) {
    needs[label] = needsAttention(o, TODAY);
  }
  assert.deepEqual(needs, {
    no_next_step: true, overdue: true, stalled: true,
    waiting: false, due_soon: false, progressed: false, normal: false,
  });
});

test("the Action list adds due-today and nothing else", () => {
  assert.equal(surfacesOnActionList(opp({ nextSteps: [step(TODAY)] }), TODAY), true);
  assert.equal(surfacesOnActionList(opp({ nextSteps: [step(day(1))] }), TODAY), false);
  assert.equal(surfacesOnActionList(opp({ nextSteps: [step(day(30))] }), TODAY), false);
  assert.equal(surfacesOnActionList(opp({ nextSteps: [] }), TODAY), true);
  assert.equal(surfacesOnActionList(opp({ nextSteps: [step(ago(1))] }), TODAY), true);
});

/* ── The seven imported rows ──────────────────────────────────────────────── */

test("the imported pipeline reads 7 of 7 needing attention — no owner, no step", () => {
  // The real 13 Aug 2026 import: no owner, no next step, no close date, because
  // the source spreadsheet has none. That is the gap the page exists to close.
  const imported = (stage: AttentionInput["stage"]) =>
    opp({ stage, nextSteps: [], lastActivityAt: TODAY, stageChangedAt: TODAY });
  const rows = (["proposed", "proposed", "qualified", "qualified", "identified", "identified", "identified"] as const)
    .map(imported);
  assert.equal(rows.filter((o) => needsAttention(o, TODAY)).length, 7);
  assert.ok(rows.every((o) => attention(o, TODAY).state === "no_next_step"));
});
