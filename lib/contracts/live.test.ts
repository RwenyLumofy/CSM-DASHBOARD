import { test } from "node:test";
import assert from "node:assert/strict";
import { liveFromRecords, type LiveRecord } from "./live";

const rec = (over: Partial<LiveRecord>): LiveRecord => ({
  id: "s", kind: "sale", startDate: "2026-01-01", renewalDate: "2027-01-01", amount: 10000, currency: "USD", yearAmounts: null,
  supportAmount: null, licences: 10, milestones: { launch_date: "2026-02-01" }, counted: true, voidedAt: null, ...over,
});
const opts = { override: null, legacyChurned: false, today: "2026-06-01", quarterStart: "2026-04-01" };

test("a launched contract: ARR with support, renewal date and Active", () => {
  const live = liveFromRecords([rec({ supportAmount: 2000 })], opts);
  assert.deepEqual(live, { arr: 12000, previousArr: 12000, renewalDate: "2027-01-01", status: "active" });
});

test("an expansion this quarter raises ARR but not previous ARR; BHD is converted", () => {
  const live = liveFromRecords([rec({}), rec({ id: "e", kind: "expansion", startDate: "2026-05-01", renewalDate: null, amount: 376, currency: "BHD", milestones: {} })], opts);
  assert.equal(Math.round(live.arr), 11000);
  assert.equal(live.previousArr, 10000);
});

test("history and voided records don't count", () => {
  const live = liveFromRecords([rec({}), rec({ id: "x", startDate: "2026-03-01", amount: 50000, counted: false }), rec({ id: "v", startDate: "2026-03-01", amount: 70000, voidedAt: new Date() })], opts);
  assert.equal(live.arr, 10000);
});

test("a renewal recorded ahead gives the next renewal date; overdue is stored as renewal", () => {
  const ahead = liveFromRecords([rec({}), rec({ id: "r", kind: "renewal", startDate: "2027-01-01", renewalDate: "2028-01-01", milestones: {} })], { ...opts, today: "2026-12-01" });
  assert.equal(ahead.renewalDate, "2028-01-01");
  assert.equal(ahead.status, "active");
  const overdue = liveFromRecords([rec({})], { ...opts, today: "2027-03-01" });
  assert.equal(overdue.status, "renewal");
  assert.equal(overdue.renewalDate, "2027-01-01");
});

test("a churn record: churned, zero ARR, no renewal date, previous ARR kept", () => {
  const live = liveFromRecords([rec({}), rec({ id: "c", kind: "churn", startDate: "2026-05-15", renewalDate: null, amount: 0, milestones: {} })], opts);
  assert.deepEqual(live, { arr: 0, previousArr: 10000, renewalDate: null, status: "churned" });
});

test("marked churned the old way with no churn record: still churned, zero ARR", () => {
  const live = liveFromRecords([rec({})], { ...opts, legacyChurned: true });
  assert.equal(live.status, "churned");
  assert.equal(live.arr, 0);
  assert.equal(live.renewalDate, null);
});

test("a status set by hand applies, but never over a churn", () => {
  const override = { status: "onboarding" as const, reason: "Relaunching.", setBy: null, setOn: "2026-05-20", expiresOn: "2026-06-19" };
  assert.equal(liveFromRecords([rec({})], { ...opts, override }).status, "onboarding");
  assert.equal(liveFromRecords([rec({}), rec({ id: "c", kind: "churn", startDate: "2026-05-25", renewalDate: null, amount: 0, milestones: {} })], { ...opts, override }).status, "churned");
});

test("a churn record for less than the contract still leaves the churned account at zero ARR", () => {
  const live = liveFromRecords([rec({}), rec({ id: "c", kind: "churn", startDate: "2026-05-15", renewalDate: null, amount: 4000, milestones: {} })], opts);
  assert.equal(live.status, "churned");
  assert.equal(live.arr, 0);
});
