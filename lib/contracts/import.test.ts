/* =========================================================================
   Import rules: today's deals → contract records, then ARR read from them.
   Fixtures mirror real cases found in the dry run (2026-10-05) and on
   2026-10-08, without customer names.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "@/lib/types";
import { buildContractRecords, type ImportInput } from "./import";
import { arrOn } from "./ledger";

const deal = (p: Partial<Deal> & Pick<Deal, "hubspotDealId" | "amount">): Deal => ({
  id: `hs-deal-${p.hubspotDealId}`, clientId: "c1", name: p.name ?? `Deal ${p.hubspotDealId}`,
  closeDate: null, pipeline: "direct", referralSource: "Direct Sales", ownerName: null, ownerEmail: null,
  hubspotUrl: null, tracked: true, createdAt: "2026-01-01T00:00:00Z", category: "renewal", ...p,
});
const client = (over: Partial<ImportInput["client"]> = {}): ImportInput["client"] =>
  ({ id: "c1", status: "active", churnedAt: null, currency: "USD", properties: {}, ...over });
const asLedger = (recs: ReturnType<typeof buildContractRecords>["records"]) =>
  recs.map((r) => ({ id: r.id, kind: r.kind, start: r.startDate, amount: r.amount, licences: r.licences, currency: r.currency, counted: r.counted }));

test("a renewal replaces the expansion it already includes (counted twice today)", () => {
  const { records } = buildContractRecords({
    client: client(),
    deals: [
      deal({ hubspotDealId: "1", amount: 17_490, contractStartDate: "2025-04-13", tracked: false }),
      deal({ hubspotDealId: "2", amount: 2_595, pipeline: "cs", category: "expansion", contractStartDate: "2025-04-13" }),
      deal({ hubspotDealId: "3", amount: 31_402.5, pipeline: "cs", category: "renewal", contractStartDate: "2026-04-13", contractDuration: 3 }),
    ],
    wonOpportunities: [],
  });
  assert.equal(arrOn(asLedger(records), "2026-10-08"), 31_402.5);
  assert.equal(records.find((r) => r.hubspotDealId === "3")?.renewalDate, "2029-04-13");
});

test("a won expansion just before a renewal is kept and flagged for a person to confirm", () => {
  const result = buildContractRecords({
    client: client(),
    deals: [
      deal({ hubspotDealId: "1", amount: 181_110, closeDate: "2025-05-19", tracked: false }),
      deal({ hubspotDealId: "2", amount: 181_110, pipeline: "cs", category: "renewal", closeDate: "2026-10-07" }),
    ],
    wonOpportunities: [{ id: "opp1", name: "Support fees", finalArr: 20_000, currency: "USD", outcomeDate: "2026-09-21", arrRecorded: true, product: null }],
  });
  const { records } = result;
  // The expansion predates the renewal's start, so the renewal resets the base — the ledger rule.
  // A person must confirm whether the renewal amount already includes it, so it is flagged.
  assert.ok(records.some((r) => r.source === "expansion" && r.opportunityId === "opp1"));
  assert.ok(result.flags.some((f) => f.includes("Support fees") && f.includes("replaces it")));
});

test("a churned account with no churn deal gets a churn record and ARR 0", () => {
  const { records, flags } = buildContractRecords({
    client: client({ status: "churned", churnedAt: "2026-07-01T00:00:00Z" }),
    deals: [deal({ hubspotDealId: "1", amount: 16_903, contractStartDate: "2025-05-21" })],
    wonOpportunities: [],
  });
  assert.equal(arrOn(asLedger(records), "2026-10-08"), 0);
  assert.ok(flags.some((f) => f.includes("no churn reasons")));
});

test("a churned account with no churn date still ends at zero", () => {
  const { records, flags } = buildContractRecords({
    client: client({ status: "churned", churnedAt: null }),
    deals: [deal({ hubspotDealId: "1", amount: 1_518, contractStartDate: "2025-03-01" })],
    wonOpportunities: [],
  });
  assert.equal(arrOn(asLedger(records), "2026-10-08"), 0);
  assert.ok(flags.some((f) => f.includes("no churn date")));
});

test("HubSpot owns a sale's amount: a CS edit is flagged, not imported", () => {
  const { records, flags } = buildContractRecords({
    client: client({ properties: { __deal_overrides: { "hs-deal-1": { amount: 50_000, products: ["Develop"], supportLevel: "Level 2" } } } }),
    deals: [deal({ hubspotDealId: "1", amount: 48_000, contractStartDate: "2026-01-15" })],
    wonOpportunities: [],
  });
  const sale = records[0];
  assert.equal(sale.amount, 48_000);
  assert.deepEqual(sale.modules, ["Develop"]); // CS-owned edits carry over
  assert.equal(sale.supportLevel, "Level 2");
  assert.ok(flags.some((f) => f.includes("amount is 50000 in Signal but 48000 in HubSpot")));
});

test("a CS value fills a money field HubSpot left blank, without a flag", () => {
  const { records, flags } = buildContractRecords({
    client: client({ properties: { __deal_overrides: { "hs-deal-1": { pricePerUser: 120, complementaryLicenses: 0 } } } }),
    deals: [deal({ hubspotDealId: "1", amount: 48_000, pricePerUser: null, complementaryLicenses: null, contractStartDate: "2026-01-15" })],
    wonOpportunities: [],
  });
  assert.equal(records[0].pricePerUser, 120);
  assert.equal(records[0].complementary, 0);
  assert.equal(flags.length, 0);
});

test("contract length over 5 is months, and 'None' is a global library decision", () => {
  const { records, flags } = buildContractRecords({
    client: client(),
    deals: [deal({ hubspotDealId: "1", amount: 13_713, contractStartDate: "2025-05-28", contractDuration: 24, globalLibraryPackage: ["None"] })],
    wonOpportunities: [],
  });
  assert.equal(records[0].renewalDate, "2027-05-28");
  assert.equal(records[0].libraryDecided, true);
  assert.deepEqual(records[0].libraryTerms, {});
  assert.ok(flags.some((f) => f.includes("read as months")));
});

test("unticked deals are history; churn deals count even though the sync stored them unticked", () => {
  const { records } = buildContractRecords({
    client: client(),
    deals: [
      deal({ hubspotDealId: "1", amount: 16_903, contractStartDate: "2025-05-21" }),
      deal({ hubspotDealId: "2", amount: 16_903, pipeline: "cs", category: "confirmed_churn", contractStartDate: "2026-07-01", tracked: false }),
      deal({ hubspotDealId: "3", amount: 5_000, pipeline: "cs", category: "expansion", contractStartDate: "2025-08-01", tracked: false }),
    ],
    wonOpportunities: [],
  });
  assert.equal(records.find((r) => r.hubspotDealId === "2")?.counted, true);
  assert.equal(records.find((r) => r.hubspotDealId === "3")?.counted, false);
  assert.equal(arrOn(asLedger(records), "2026-10-08"), 0);
});
