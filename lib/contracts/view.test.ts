import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFields, toFields, toView } from "./view";
import type { ContractRecord } from "./repo";

const record: ContractRecord = {
  id: "ctr-hs-1", clientId: "c1", kind: "sale", source: "hubspot", hubspotDealId: "1", opportunityId: null, channel: "Direct Sales",
  name: "Platform", currency: "SAR", amount: 100000, yearAmounts: null, supportLevel: "Level 2", supportAmount: 20000,
  oneTimeFees: [{ label: "Implementation", amount: 5000 }], licences: 400, complementary: 20, pricePerUser: 250,
  modules: ["Develop", "Engage"], startingModules: ["Develop"], libraryDecided: true,
  libraryTerms: { Go1: { licences: 400, start: "2026-01-01", expiry: "2026-12-31" } },
  implementationLevel: "Guided", aiCredits: null, milestones: { launch_date: "2026-03-01" },
  startDate: "2026-01-01", endDate: "2026-12-31", renewalDate: "2027-01-01", counted: true, churnReasons: [], note: null,
  voidedAt: null, voidedBy: null, voidReason: null, createdBy: "import", createdAt: "2026-10-08T00:00:00.000Z", updatedBy: "import", updatedAt: "2026-10-08T00:00:00.000Z",
};

test("an untouched record sends an empty patch", () => {
  const f = toFields(toView(record));
  const stored = toFields(toView(record));
  assert.deepEqual(changedFields(stored, f), {});
  assert.equal(f.supportAmount, 20000);
  assert.deepEqual(f.libraryTerms, record.libraryTerms);
});

test("a Save sends only what changed", () => {
  const v = toView(record);
  const patch = changedFields(toFields(v), toFields({ ...v, renewal: "2027-02-01", oneTimeFees: [...v.oneTimeFees, { label: " Content ", amount: 3000 }] }));
  assert.deepEqual(Object.keys(patch).sort(), ["oneTimeFees", "renewalDate"]);
  assert.equal(patch.oneTimeFees?.[1].label, "Content");
});

test("adding a library gives it the contract's term; removing one drops its terms", () => {
  const v = toView(record);
  const added = toFields({ ...v, library: ["Go1", "Udemy"] });
  assert.deepEqual(added.libraryTerms.Udemy, { licences: null, start: "2026-01-01", expiry: "2026-12-31" });
  const none = toFields({ ...v, library: [], libraryDecided: true });
  assert.deepEqual(none.libraryTerms, {});
  assert.equal(none.libraryDecided, true);
});

test("clearing the support level clears its amount; dropping a module drops it from the starting modules", () => {
  const v = toView(record);
  assert.equal(toFields({ ...v, supportLevel: null }).supportAmount, null);
  assert.deepEqual(toFields({ ...v, modules: ["Engage"] }).startingModules, []);
});

test("a voided record doesn't count, and a HubSpot sale links to its deal", () => {
  const v = toView({ ...record, voidedAt: "2026-10-09T10:00:00.000Z", voidedBy: "a@b.c", voidReason: "Duplicate" }, "999");
  assert.equal(v.counted, false);
  assert.equal(v.voided?.reason, "Duplicate");
  assert.equal(v.hubspotUrl, "https://app.hubspot.com/contacts/999/record/0-3/1");
});
