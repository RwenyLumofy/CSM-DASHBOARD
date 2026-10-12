import { test } from "node:test";
import assert from "node:assert/strict";
import { compareAccount, sortForReview, summarize } from "./compare";
import type { ContractView } from "./view";

const rec = (over: Partial<ContractView>): ContractView => ({
  id: "r", kind: "sale", source: "hubspot", name: "Sale", amount: 10000, licences: 10, complementary: null, pricePerUser: null,
  modules: [], library: [], start: "2026-01-01", end: "2026-12-31", renewal: "2027-01-01", milestones: { launch_date: "2026-02-01" }, oneTimeFees: [], ...over,
});
const today = "2026-06-01";

test("same ARR and status is not a difference", () => {
  const row = compareAccount({ id: "a", name: "A", status: "active", arr: 10000.4 }, [rec({})], today);
  assert.equal(row.arrDiffers, false);
  assert.equal(row.statusDiffers, false);
});

test("support on the record, a voided record and a churn all show in the comparison", () => {
  assert.equal(compareAccount({ id: "a", name: "A", status: "active", arr: 10000 }, [rec({ supportLevel: "Level 1", supportAmount: 2000 })], today).arrDiff, 2000);
  const voided = compareAccount({ id: "a", name: "A", status: "active", arr: 10000 }, [rec({ counted: false, voided: { on: "2026-03-01", by: null, reason: "x" } })], today);
  assert.equal(voided.recordArr, 0);
  assert.equal(voided.counted, 0);
  assert.equal(voided.total, 1);
  const churned = compareAccount({ id: "a", name: "A", status: "churned", arr: 10000 },
    [rec({}), rec({ id: "c", kind: "churn", amount: 0, start: "2026-05-01", renewal: null, end: null, milestones: {} })], today);
  assert.equal(churned.recordArr, 0);
  assert.equal(churned.statusDiffers, false);
});

test("an overdue renewal is a status difference, since today's status has no such label", () => {
  const row = compareAccount({ id: "a", name: "A", status: "active", arr: 10000 }, [rec({})], "2027-02-01");
  assert.equal(row.recordStatus, "overdue");
  assert.equal(row.statusDiffers, true);
});

test("totals split live and churned accounts; review order puts the biggest ARR gap first", () => {
  const rows = [
    compareAccount({ id: "a", name: "A", status: "active", arr: 10000 }, [rec({})], today),
    compareAccount({ id: "b", name: "B", status: "active", arr: 9000 }, [rec({})], today),
    compareAccount({ id: "c", name: "C", status: "churned", arr: 500 }, [], today),
    compareAccount({ id: "d", name: "D", status: "active", arr: 4000 }, [rec({})], today),
  ];
  const s = summarize(rows);
  assert.deepEqual([s.accounts, s.withoutRecords, s.arrDiffers], [4, 1, 3]);
  assert.deepEqual([s.liveArr, s.recordArrForLive, s.churnedLiveArr, s.churnedRecordArr], [23000, 30000, 500, 0]);
  assert.deepEqual(sortForReview(rows).map((r) => r.id), ["d", "b", "c", "a"]);
});
