import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProfileCompleteness } from "./profile-completeness";
import type { Client, Deal } from "@/lib/types";

/* WHICH DEALS AN ACCOUNT'S SETUP IS JUDGED ON.

   The case these tests exist for (MEP, 2026-10-22): a fully-filled account
   turned red the day a CS-pipeline renewal synced from HubSpot carrying only
   licences and price. A per-deal field counts as missing when ANY judged deal
   lacks it, so one empty renewal reported ten gaps on an account that had
   none. A renewal is a revenue movement, not a contract setup.

   The trap in the obvious fix: 17 of the 19 accounts holding a tracked CS deal
   have no tracked sale at all — the sale was untracked when its renewal
   replaced it. Ignoring CS deals outright would have turned those 17 red. */

const owner = { id: "a@x.com", name: "A", email: "a@x.com", initials: "A" };

const client = (over: Partial<Client> = {}): Client => ({
  id: "c1", name: "Acme", industry: "Tech", country: "Bahrain", employees: 50,
  csm: owner, implementationOwner: owner, arr: 1000, currency: "USD", status: "active",
  ...over,
} as Client);

/** A sale with every red per-deal field filled in. */
const sale = (over: Partial<Deal> = {}): Deal => ({
  id: "hs-deal-1", clientId: "c1", hubspotDealId: "1", name: "Sale", amount: 1000,
  closeDate: "2025-05-19T00:00:00.000Z", pipeline: "direct", referralSource: "Direct Sales",
  ownerName: null, ownerEmail: null, hubspotUrl: null, tracked: true, category: "renewal",
  numberOfUsers: 850, pricePerUser: 210, complementaryLicenses: 0, contractDuration: 3,
  products: ["Perform"], useCases: ["Onboarding New Joiner"], globalLibraryPackage: ["Go1"],
  globalLibraryLicenses: 850, aiCourseCredits: 0, contractStartDate: "2025-09-01",
  supportLevel: "Level 3", implementationLevel: "White Glove",
  createdAt: "2025-05-19T00:00:00.000Z", ...over,
} as Deal);

/** A CS renewal exactly as HubSpot held MEP's: licences, price, duration, nothing else. */
const csRenewal = (over: Partial<Deal> = {}): Deal => sale({
  id: "hs-deal-2", hubspotDealId: "2", name: "Renewal (2026)", pipeline: "cs", category: "renewal",
  referralSource: null, contractDuration: 3, complementaryLicenses: null,
  products: [], useCases: [], globalLibraryPackage: [], globalLibraryLicenses: null,
  aiCourseCredits: null, contractStartDate: null, supportLevel: null, implementationLevel: null,
  ...over,
});

const DATES = {
  "hs-deal-1": {
    launch_date: "2025-06-26", kickoff_meeting_date: "2025-05-26",
    global_library_start_date: "2025-10-12", global_library_expiry_date: "2026-10-12",
    invoice_sent_date: "2025-05-19", platform_start_date: "2025-06-01", platform_end_date: "2026-09-15",
  },
};

test("a complete sale is complete", () => {
  assert.equal(computeProfileCompleteness(client(), [sale()], DATES).severity, "none");
});

test("an empty CS renewal alongside a complete sale does NOT make the account red", () => {
  // The MEP regression. Before the scope rule this reported ten red gaps.
  const r = computeProfileCompleteness(client(), [sale(), csRenewal()], DATES);
  assert.equal(r.severity, "none", `unexpected gaps: ${r.missingRed.map((f) => f.label).join(", ")}`);
});

test("when the only tracked deal is a CS one, it is still judged — the 17-account case", () => {
  // Their sale was untracked at renewal, so the CS deal IS the current contract.
  const complete = csRenewal({
    products: ["Perform"], useCases: ["Product Knowledge"], globalLibraryPackage: ["Go1"],
    globalLibraryLicenses: 850, aiCourseCredits: 0, contractStartDate: "2026-01-01",
    supportLevel: "Level 2", implementationLevel: "Guided", complementaryLicenses: 0,
  });
  const dates = { "hs-deal-2": { ...DATES["hs-deal-1"] } };
  const r = computeProfileCompleteness(client(), [complete], dates);
  // Not red: every must-have field is read off the CS deal.
  assert.equal(r.severity, "yellow");
  assert.deepEqual(r.missingRed, []);
  // The one nice-to-have a CS deal can never carry: HubSpot records an
  // acquisition channel on the original sale, not on a renewal. Pre-existing
  // for these accounts — the scope rule neither causes nor hides it.
  assert.deepEqual(r.missingYellow.map((f) => f.label), ["Acquisition Channel"]);

  // And a genuinely empty one is still reported, rather than silently excused.
  const empty = computeProfileCompleteness(client(), [csRenewal()], {});
  assert.equal(empty.severity, "red");
  assert.ok(empty.missingRed.some((f) => f.label === "Module"));
});

test("a gap on the sale is still reported when a CS deal is present", () => {
  const r = computeProfileCompleteness(client(), [sale({ supportLevel: null }), csRenewal()], DATES);
  assert.equal(r.severity, "red");
  assert.deepEqual(r.missingRed.map((f) => f.label), ["Support level"]);
});

test("client-level gaps are unaffected by the scope rule", () => {
  const r = computeProfileCompleteness(client({ csm: null }), [sale(), csRenewal()], DATES);
  assert.equal(r.severity, "red");
  assert.deepEqual(r.missingRed.map((f) => f.label), ["CSM assignee"]);
});
