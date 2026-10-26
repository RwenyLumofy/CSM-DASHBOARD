import { test } from "node:test";
import assert from "node:assert/strict";
import { activeOverride, effectiveStatus, overrideExpiry, statusFromRecords, validateOverride, type StatusOverride, type StatusRecord } from "./status";

const sale = (over: Partial<StatusRecord> = {}): StatusRecord => ({
  kind: "sale", start: "2025-01-01", renewal: "2026-01-01", milestones: { launch_date: "2025-03-01" }, ...over,
});
const key = (rs: StatusRecord[], today: string) => statusFromRecords(rs, today).key;

test("onboarding until launch, then active", () => {
  assert.equal(key([sale({ milestones: {} })], "2025-02-01"), "onboarding");
  assert.equal(key([sale()], "2025-02-01"), "onboarding"); // launch planned, not reached
  assert.equal(key([sale()], "2025-06-01"), "active");
  assert.equal(key([], "2025-06-01"), "onboarding");
});

test("renewal due inside 120 days; overdue the day after the date", () => {
  assert.equal(key([sale()], "2025-09-02"), "active"); // 121 days out
  assert.equal(key([sale()], "2025-09-03"), "renewal"); // 120 days out
  assert.equal(key([sale()], "2026-01-01"), "renewal"); // on the date
  assert.equal(key([sale()], "2026-01-02"), "overdue"); // 1 day past
});

test("a renewal recorded ahead settles the coming renewal; once it starts it is the contract in force", () => {
  const rs = [sale(), { kind: "renewal", start: "2026-01-01", renewal: "2027-01-01", milestones: {} } as StatusRecord];
  assert.equal(key(rs, "2025-12-01"), "active");
  assert.equal(key(rs, "2026-02-01"), "active"); // launch on the original sale still counts
  assert.equal(key(rs, "2026-11-01"), "renewal");
});

test("churn wins once it takes effect; history and voided records are ignored", () => {
  const churn: StatusRecord = { kind: "churn", start: "2025-09-01", renewal: null, milestones: {} };
  assert.equal(key([sale(), churn], "2025-08-31"), "active");
  assert.equal(key([sale(), churn], "2025-09-01"), "churned");
  assert.equal(key([sale(), { ...churn, counted: false }], "2025-09-01"), "active");
  assert.equal(key([sale({ counted: false })], "2025-06-01"), "onboarding");
});

const o: StatusOverride = { status: "active", reason: "Launch date is being confirmed.", setBy: "a@b.c", setOn: "2025-02-01", expiresOn: overrideExpiry("2025-02-01") };

test("a status set by hand needs a reason and can't be churned", () => {
  assert.equal(validateOverride("active", "  ").ok, false);
  assert.equal(validateOverride("churned", "left").ok, false);
  assert.equal(validateOverride("paused", "x").ok, false);
  assert.equal(validateOverride("overdue", "Chasing the PO").ok, true);
});

test("a status set by hand lasts 30 days", () => {
  const rs = [sale({ milestones: {} })];
  assert.equal(o.expiresOn, "2025-03-03");
  assert.equal(effectiveStatus(rs, o, "2025-02-10").key, "active");
  assert.equal(effectiveStatus(rs, o, "2025-02-10").auto, "onboarding");
  assert.equal(effectiveStatus(rs, o, "2025-03-02").key, "active");
  assert.equal(effectiveStatus(rs, o, "2025-03-03").key, "onboarding");
});

test("a renewal or churn taking effect after it was set ends it early; a churn always wins", () => {
  const late: StatusOverride = { ...o, status: "active", setOn: "2025-12-20", expiresOn: overrideExpiry("2025-12-20") };
  const renewal: StatusRecord = { kind: "renewal", start: "2026-01-01", renewal: "2027-01-01", milestones: {} };
  assert.ok(activeOverride(late, [sale(), renewal], "2025-12-25"));
  assert.equal(activeOverride(late, [sale(), renewal], "2026-01-02"), null);
  const churn: StatusRecord = { kind: "churn", start: "2025-02-05", renewal: null, milestones: {} };
  assert.equal(effectiveStatus([sale(), churn], o, "2025-02-10").key, "churned");
});
