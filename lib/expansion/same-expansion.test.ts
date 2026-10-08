/* A Won expansion must not be added to ARR when HubSpot already counts it. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { findSameHubspotExpansion } from "./same-expansion";

const deal = (closeDate: string | null, tracked = true) =>
  ({ name: "Expanded", amount: 20_000, closeDate: closeDate ? new Date(`${closeDate}T00:00:00Z`) : null, tracked });

test("a ticked HubSpot expansion closed within 60 days is the same expansion", () => {
  assert.ok(findSameHubspotExpansion([deal("2026-10-15")], "2026-09-21"));
  assert.ok(findSameHubspotExpansion([deal("2026-07-24")], "2026-09-21"));
});

test("one closed more than 60 days away is a different expansion", () => {
  assert.equal(findSameHubspotExpansion([deal("2026-06-01")], "2026-09-21"), undefined);
});

test("an unticked HubSpot deal is not counted in ARR, so it never blocks", () => {
  assert.equal(findSameHubspotExpansion([deal("2026-09-21", false)], "2026-09-21"), undefined);
});

test("a deal with no close date never matches", () => {
  assert.equal(findSameHubspotExpansion([deal(null)], "2026-09-21"), undefined);
});
