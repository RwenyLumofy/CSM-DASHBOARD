/* =========================================================================
   Account lifecycle status (lib/status.ts).

   The case worth pinning is the renewal one: launch belongs to the account, so
   when a renewal deal arrives and CS unticks the original sale (which carries
   the launch date), the account must stay Active — not fall back to
   Onboarding, which is what happened to the Ministry of Economy and Planning
   in October 2026.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeClientStatus, type StatusDeal } from "./status";

const NOW = new Date("2026-10-08T00:00:00Z");
const deal = (id: string, tracked: boolean, start: string): StatusDeal =>
  ({ id, tracked, contractStartDate: new Date(`${start}T00:00:00Z`), closeDate: null });

test("a renewal does not send a launched account back to onboarding", () => {
  const deals = [deal("sale", false, "2025-05-19"), deal("renewal", true, "2026-03-01")];
  const launch = { sale: "2025-06-26" }; // the launch date lives on the original, now unticked, sale
  assert.equal(computeClientStatus(deals, launch, undefined, 181_110, NOW), "active");
});

test("an account with no launch date on any deal is onboarding", () => {
  assert.equal(computeClientStatus([deal("sale", true, "2026-03-01")], {}, undefined, 50_000, NOW), "onboarding");
});

test("a launch date on the tracked deal still counts", () => {
  assert.equal(computeClientStatus([deal("sale", true, "2026-03-01")], { sale: "2026-04-01" }, undefined, 50_000, NOW), "active");
});

test("a renewal due within 90 days wins over active", () => {
  const deals = [deal("sale", true, "2025-11-14")]; // renews 2026-11-14, 37 days away
  assert.equal(computeClientStatus(deals, { sale: "2025-11-30" }, undefined, 17_608, NOW), "renewal");
});

test("marking an account churned wins over everything", () => {
  assert.equal(computeClientStatus([deal("sale", true, "2026-03-01")], { sale: "2026-04-01" }, "churned", 50_000, NOW), "churned");
});

test("with no tracked deals, ARR alone decides active vs onboarding", () => {
  assert.equal(computeClientStatus([deal("sale", false, "2024-01-01")], {}, undefined, 10_000, NOW), "active");
  assert.equal(computeClientStatus([], {}, undefined, 0, NOW), "onboarding");
});
