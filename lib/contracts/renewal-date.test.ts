import { test } from "node:test";
import assert from "node:assert/strict";
import { renewalFromRecords, type RenewalDateRecord } from "./renewal-date";

const rec = (p: Partial<RenewalDateRecord> & { id: string }): RenewalDateRecord => ({ kind: "sale", start: null, renewal: null, milestones: {}, ...p });
const today = "2026-10-28";

test("the contract in force holds the renewal date", () => {
  const records = [
    rec({ id: "old", start: "2024-12-01", renewal: "2025-11-30" }),
    rec({ id: "cur", kind: "renewal", start: "2025-12-01", renewal: "2026-11-30" }),
  ];
  assert.deepEqual(renewalFromRecords(records, today), { date: "2026-11-30", recordId: "cur" });
});

test("a renewal recorded ahead of time holds the next date", () => {
  const records = [
    rec({ id: "cur", start: "2026-01-01", renewal: "2026-12-31" }),
    rec({ id: "next", kind: "renewal", start: "2027-01-01", renewal: "2027-12-31" }),
  ];
  assert.deepEqual(renewalFromRecords(records, today), { date: "2027-12-31", recordId: "next" });
});

test("history-only records and expansions don't hold it", () => {
  const records = [
    rec({ id: "cur", start: "2026-01-01", renewal: "2026-12-31" }),
    rec({ id: "hist", kind: "renewal", start: "2026-06-01", renewal: "2027-05-31", counted: false }),
    rec({ id: "exp", kind: "expansion", start: "2026-07-01" }),
  ];
  assert.equal(renewalFromRecords(records, today)?.recordId, "cur");
});

test("none once churned, or with no contract", () => {
  assert.equal(renewalFromRecords([rec({ id: "cur", start: "2026-01-01", renewal: "2026-12-31" }), rec({ id: "c", kind: "churn", start: "2026-09-01" })], today), null);
  assert.equal(renewalFromRecords([], today), null);
});
