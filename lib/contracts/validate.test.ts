/* What may be saved on a contract record. The rules worth pinning are the
   ownership ones: Signal never creates a sale, never records an expansion
   from the contract tab, and never overwrites a HubSpot sale's money. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { editablePatch, validateKindForCreate, validateRecord, type ContractFields } from "./validate";

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
  assert.match(err(validateRecord("churn", fields({ churnReasons: ["gone"] }), new Set(["low_adoption"]))) ?? "", /no longer exists/);
  assert.equal(validateRecord("churn", fields({ churnReasons: ["low_adoption"] }), new Set(["low_adoption"])).ok, true);
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
  assert.match(err(validateRecord("downgrade", fields({ amount: -5_000, yearAmounts: [-5_000, -4_000] }))) ?? "", /Only a sale or renewal/);
});

test("dates must be in order", () => {
  assert.match(err(validateRecord("renewal", fields({ endDate: "2025-12-31" }))) ?? "", /before the start/);
  assert.match(err(validateRecord("renewal", fields({ renewalDate: "2026-01-15" }))) ?? "", /after the start/);
  assert.match(err(validateRecord("renewal", fields({ startDate: null }))) ?? "", /start date/);
});

test("amount signs follow the kind", () => {
  assert.match(err(validateRecord("renewal", fields({ amount: -1 }))) ?? "", /negative/);
  assert.match(err(validateRecord("downgrade", fields({ amount: 500 }))) ?? "", /zero or negative/);
  assert.equal(validateRecord("downgrade", fields({ amount: -500 })).ok, true);
});

test("starting modules, library terms and one-time fees are checked", () => {
  assert.match(err(validateRecord("renewal", fields({ startingModules: ["Perform"] }))) ?? "", /among the contracted/);
  assert.match(err(validateRecord("renewal", fields({ libraryTerms: { Go1: { licences: 200, start: "2026-06-01", expiry: "2026-01-01" } } }))) ?? "", /expiry is before/);
  assert.match(err(validateRecord("renewal", fields({ oneTimeFees: [{ label: "", amount: 5_000 }] }))) ?? "", /label/);
  assert.equal(validateRecord("renewal", fields({ oneTimeFees: [{ label: "Implementation", amount: 5_000 }] })).ok, true);
});
