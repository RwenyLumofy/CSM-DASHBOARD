/* What may be saved on a contract record. The rules worth pinning are the
   ownership ones: Signal never creates a sale, never records an expansion
   from the contract tab, and never overwrites a HubSpot sale's money. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { editablePatch, losesArr, validateKindForCreate, validateRecord, type ContractFields } from "./validate";

const fields = (over: Partial<ContractFields> = {}): ContractFields => ({
  name: "Renewal", currency: "USD", amount: 52_800, yearAmounts: null, supportLevel: null, supportAmount: null,
  oneTimeFees: [], licences: 440, complementary: null, pricePerUser: 120, modules: ["Develop"], startingModules: [],
  libraryDecided: true, libraryTerms: {}, implementationLevel: null, aiCredits: null, milestones: {},
  startDate: "2026-01-15", endDate: "2027-01-14", renewalDate: "2027-01-15", churnReasons: [], note: null, ...over,
});
const err = (v: ReturnType<typeof validateRecord>) => (v.ok ? null : v.error);

test("sales and expansions can't be created from the contract tab", () => {
  assert.match(err(validateKindForCreate("sale")) ?? "", /HubSpot/);
  assert.match(err(validateKindForCreate("expansion")) ?? "", /Expansion page/);
  assert.equal(validateKindForCreate("renewal").ok, true);
  assert.equal(validateKindForCreate("churn").ok, true);
});

test("a HubSpot sale's money and name are never written by Signal", () => {
  const { patch, refused } = editablePatch("hubspot", { amount: 1, licences: 5, modules: ["Perform"], startDate: "2026-02-01" });
  assert.deepEqual(patch, { modules: ["Perform"], startDate: "2026-02-01" });
  assert.deepEqual(refused.sort(), ["amount", "licences"]);
  assert.deepEqual(editablePatch("signal", { amount: 1 }).refused, []);
});

test("a valid renewal passes", () => {
  assert.equal(validateRecord("renewal", fields()).ok, true);
});

test("a churn needs a date and a reason that exists in Settings", () => {
  assert.match(err(validateRecord("churn", fields({ churnReasons: [] }))) ?? "", /reason/);
  assert.match(err(validateRecord("churn", fields({ startDate: null, churnReasons: ["low_adoption"] }))) ?? "", /date/);
  assert.match(err(validateRecord("churn", fields({ churnReasons: ["gone"] }), { reasonIds: new Set(["low_adoption"]) })) ?? "", /no longer exists/);
  assert.equal(validateRecord("churn", fields({ churnReasons: ["low_adoption"] }), { reasonIds: new Set(["low_adoption"]) }).ok, true);
});

test("a support amount needs a level and can't be negative", () => {
  assert.match(err(validateRecord("renewal", fields({ supportAmount: 3_000 }))) ?? "", /support level/);
  assert.match(err(validateRecord("renewal", fields({ supportLevel: "Level 2", supportAmount: -1 }))) ?? "", /zero or more/);
  assert.equal(validateRecord("renewal", fields({ supportLevel: "Level 2", supportAmount: 3_000 })).ok, true);
});

test("per-year ARR must start at the contract's ARR and cover at least two years", () => {
  assert.match(err(validateRecord("renewal", fields({ yearAmounts: [50_000, 55_000] }))) ?? "", /Year 1/);
  assert.match(err(validateRecord("renewal", fields({ yearAmounts: [52_800] }))) ?? "", /each year/);
  assert.equal(validateRecord("renewal", fields({ yearAmounts: [52_800, 56_000, 60_000] })).ok, true);
  assert.match(err(validateRecord("downgrade", fields({ amount: -5_000, yearAmounts: [-5_000, -4_000], churnReasons: ["low_adoption"] }))) ?? "", /Only a sale or renewal/);
});

test("dates must be in order", () => {
  assert.match(err(validateRecord("renewal", fields({ endDate: "2025-12-31" }))) ?? "", /before the start/);
  assert.match(err(validateRecord("renewal", fields({ renewalDate: "2026-01-15" }))) ?? "", /after the start/);
  assert.match(err(validateRecord("renewal", fields({ startDate: null }))) ?? "", /start date/);
});

test("amount signs follow the kind", () => {
  assert.match(err(validateRecord("renewal", fields({ amount: -1 }))) ?? "", /negative/);
  assert.match(err(validateRecord("downgrade", fields({ amount: 500 }))) ?? "", /zero or negative/);
  assert.equal(validateRecord("downgrade", fields({ amount: -500, churnReasons: ["low_adoption"] })).ok, true);
});

test("starting modules, library terms and one-time fees are checked", () => {
  assert.match(err(validateRecord("renewal", fields({ startingModules: ["Perform"] }))) ?? "", /among the contracted/);
  assert.match(err(validateRecord("renewal", fields({ libraryTerms: { Go1: { licences: 200, start: "2026-06-01", expiry: "2026-01-01" } } }))) ?? "", /expiry is before/);
  assert.match(err(validateRecord("renewal", fields({ oneTimeFees: [{ label: "", amount: 5_000 }] }))) ?? "", /label/);
  assert.equal(validateRecord("renewal", fields({ oneTimeFees: [{ label: "Implementation", amount: 5_000 }] })).ok, true);
});

test("any loss of ARR needs a reason, not only a churn", () => {
  // A downgrade always loses ARR.
  assert.match(err(validateRecord("downgrade", fields({ amount: -3_522 }))) ?? "", /reason for the downgrade/);
  assert.equal(validateRecord("downgrade", fields({ amount: -3_522, churnReasons: ["low_adoption"] })).ok, true);
  // neo space group: $17,608 renewed as 160 licences at the effective $88.04 = $14,086.
  const neo = fields({ amount: 14_086, licences: 160, pricePerUser: 88.04 });
  assert.match(err(validateRecord("renewal", neo, { replacesArr: 17_608 })) ?? "", /worth less/);
  assert.equal(validateRecord("renewal", { ...neo, churnReasons: ["low_adoption"] }, { replacesArr: 17_608 }).ok, true);
  // Flat or up needs none; nor does a renewal when the ARR it replaces isn't known.
  assert.equal(validateRecord("renewal", fields({ amount: 17_608 }), { replacesArr: 17_608 }).ok, true);
  assert.equal(validateRecord("renewal", fields({ amount: 20_000 }), { replacesArr: 17_608 }).ok, true);
  assert.equal(validateRecord("renewal", neo).ok, true);
});

test("a renewal's value counts its support and its currency", () => {
  // 13,000 licence + 4,608 support = 17,608: not a loss.
  assert.equal(losesArr("renewal", fields({ amount: 13_000, supportLevel: "Level 2", supportAmount: 4_608 }), 17_608), false);
  // SAR 66,030 is $17,608.
  assert.equal(losesArr("renewal", fields({ amount: 66_030, currency: "SAR" }), 17_608), false);
  assert.equal(losesArr("renewal", fields({ amount: 60_000, currency: "SAR" }), 17_608), true);
  assert.equal(losesArr("expansion", fields({ amount: 5_000 }), 17_608), false);
});

test("loss reasons must exist in the taxonomy", () => {
  assert.match(err(validateRecord("downgrade", fields({ amount: -500, churnReasons: ["gone"] }), { reasonIds: new Set(["low_adoption"]) })) ?? "", /no longer exists/);
});

test("an edit that leaves the money alone doesn't have to add reasons to an older downgrade", () => {
  assert.equal(validateRecord("downgrade", fields({ amount: -500, note: "Signed late" }), { skipLossReasons: true }).ok, true);
});
