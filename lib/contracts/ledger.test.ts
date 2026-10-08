/* =========================================================================
   Contract ledger rules. The first test is the one most worth pinning: a
   renewal REPLACES the term before it. Summing every ticked deal is how
   today's Signal counted GCCIA's expansion twice, and summing a one-year deal
   with its renewal would double an account's ARR on every anniversary.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { arrOn, contractValueUSD, withArr, type LedgerRecord } from "./ledger";

const rec = (r: Partial<LedgerRecord> & Pick<LedgerRecord, "id" | "kind" | "start" | "amount">): LedgerRecord =>
  ({ licences: null, ...r });

test("a one-year deal renewed for a second year is the second year's value, not the sum", () => {
  const records = [
    rec({ id: "y1", kind: "sale", start: "2025-01-15", amount: 48_000 }),
    rec({ id: "y2", kind: "renewal", start: "2026-01-15", amount: 52_800 }),
  ];
  assert.equal(arrOn(records, "2025-06-01"), 48_000);
  assert.equal(arrOn(records, "2026-06-01"), 52_800);
  assert.notEqual(arrOn(records, "2026-06-01"), 100_800);
});

test("a renewal signed early does not count until its term starts", () => {
  const records = [
    rec({ id: "y1", kind: "sale", start: "2025-11-14", amount: 17_608 }),
    rec({ id: "y2", kind: "renewal", start: "2026-11-14", amount: 19_000 }),
  ];
  assert.equal(arrOn(records, "2026-10-08"), 17_608);
  assert.equal(arrOn(records, "2026-11-14"), 19_000);
});

test("support is part of a contract's annual value", () => {
  const sale = rec({ id: "s", kind: "sale", start: "2025-01-15", amount: 48_000, supportAmount: 6_000 });
  assert.equal(contractValueUSD(sale), 54_000);
  assert.equal(arrOn([sale], "2025-06-01"), 54_000);
});

test("a renewal's support replaces the previous term's support rather than adding to it", () => {
  const records = [
    rec({ id: "y1", kind: "sale", start: "2025-01-15", amount: 48_000, supportAmount: 6_000 }),
    rec({ id: "y2", kind: "renewal", start: "2026-01-15", amount: 52_800, supportAmount: 4_000 }),
  ];
  assert.equal(arrOn(records, "2026-06-01"), 56_800);
});

test("expansions add and downgrades subtract until the next renewal resets the base", () => {
  const records = [
    rec({ id: "s", kind: "sale", start: "2025-01-15", amount: 48_000 }),
    rec({ id: "e", kind: "expansion", start: "2025-05-01", amount: 14_400 }),
    rec({ id: "d", kind: "downgrade", start: "2025-08-01", amount: -6_000 }),
    rec({ id: "r", kind: "renewal", start: "2026-01-15", amount: 60_000 }),
  ];
  assert.equal(arrOn(records, "2025-09-01"), 56_400);
  // The renewal is the whole new contract, so the earlier expansion is not added again.
  assert.equal(arrOn(records, "2026-02-01"), 60_000);
});

test("contracts starting the same day are one contract split across deals", () => {
  const records = [
    rec({ id: "a", kind: "sale", start: "2024-08-27", amount: 71_650 }),
    rec({ id: "b", kind: "sale", start: "2024-08-27", amount: 8_000 }),
  ];
  assert.equal(arrOn(records, "2024-09-01"), 79_650);
});

test("a churn takes ARR to zero, and a churn deal a few dollars short counts as full", () => {
  const records = [
    rec({ id: "s", kind: "sale", start: "2025-04-24", amount: 3_578 }),
    rec({ id: "c", kind: "churn", start: "2026-07-19", amount: 3_577.5 }),
  ];
  assert.equal(arrOn(records, "2026-08-01"), 0);
  assert.equal(arrOn([records[0], rec({ id: "c0", kind: "churn", start: "2026-07-19", amount: 0 })], "2026-08-01"), 0);
});

test("a multi-year contract priced per year steps on each anniversary", () => {
  const records = [rec({ id: "m", kind: "renewal", start: "2026-11-14", amount: 17_608, yearAmounts: [17_608, 19_500, 21_500] })];
  assert.equal(arrOn(records, "2027-01-10"), 17_608);
  assert.equal(arrOn(records, "2028-01-10"), 19_500);
  assert.equal(arrOn(records, "2029-01-10"), 21_500);
});

test("a multi-year contract stops stepping once a churn ends it", () => {
  const records = [
    rec({ id: "m", kind: "sale", start: "2025-01-01", amount: 10_000, yearAmounts: [10_000, 12_000, 14_000] }),
    rec({ id: "c", kind: "churn", start: "2025-06-01", amount: 0 }),
  ];
  assert.equal(arrOn(records, "2027-06-01"), 0);
});

test("records CS unticked are history and move nothing", () => {
  const records = [
    rec({ id: "old", kind: "sale", start: "2024-10-30", amount: 28_111, counted: false }),
    rec({ id: "r", kind: "renewal", start: "2025-11-14", amount: 17_608 }),
    rec({ id: "x", kind: "expansion", start: "2026-05-17", amount: 58_098, counted: false }),
  ];
  assert.equal(arrOn(records, "2026-10-08"), 17_608);
});

test("amounts in BHD and SAR are summed in dollars at the peg", () => {
  const records = [
    rec({ id: "s", kind: "sale", start: "2025-01-01", amount: 3_760, currency: "BHD" }),
    rec({ id: "e", kind: "expansion", start: "2025-03-01", amount: 37_500, currency: "SAR" }),
  ];
  assert.equal(Math.round(arrOn(records, "2025-06-01")), 20_000); // 10,000 + 10,000
});

test("withArr rows carry the before and after of every change", () => {
  const rows = withArr([
    rec({ id: "s", kind: "sale", start: "2025-01-15", amount: 48_000 }),
    rec({ id: "r", kind: "renewal", start: "2026-01-15", amount: 52_800 }),
  ]);
  assert.deepEqual(rows.map((x) => [x.r.id, x.before, x.after]), [["s", 0, 48_000], ["r", 48_000, 52_800]]);
});
