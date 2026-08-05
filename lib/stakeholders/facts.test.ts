/* =========================================================================
   The stakeholder roster now answers the health engine's four relationship
   facts — but only where the CSM left the Pulse question blank.

   The precedence is the whole design. A Pulse answer is a judgement somebody
   made deliberately ("we look multi-threaded on paper, but only one of them
   takes my calls"); a headcount cannot see that, and must never overwrite it.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { stakeholderFacts, preferAnswered, isActive } from "./facts";
import { normalizeStakeholderProfile, type StakeholderProfile } from "./profile";

const person = (over: Record<string, unknown>): StakeholderProfile =>
  normalizeStakeholderProfile({ id: `sh_${Math.abs(JSON.stringify(over).length)}_${String(over.roles)}`, ...over })!;

test("no stakeholder records proves nothing — every fact stays null", () => {
  /* Absence of records is absence of evidence. Returning `false` would assert
     the account is multi-threaded and has sponsor access, which is exactly the
     failure the `ne: true` gates were written to avoid. */
  const f = stakeholderFacts([]);
  assert.equal(f.single_threaded, null);
  assert.equal(f.sponsor_access, null);
  assert.equal(f.champion_left, null);
  assert.equal(f.economic_buyer_known, null);
});

test("one mapped person is single-threaded; two are not", () => {
  assert.equal(stakeholderFacts([person({ roles: ["champion"] })]).single_threaded, true);
  assert.equal(stakeholderFacts([
    person({ roles: ["champion"] }), person({ roles: ["decision_maker"] }),
  ]).single_threaded, false);
});

test("an executive sponsor or an economic buyer is sponsor access", () => {
  assert.equal(stakeholderFacts([person({ roles: ["executive_sponsor"] })]).sponsor_access, true);
  assert.equal(stakeholderFacts([person({ roles: ["economic_buyer"] })]).sponsor_access, true);
  assert.equal(stakeholderFacts([person({ roles: ["champion"] })]).sponsor_access, false);
});

test("somebody who has left counts for nothing", () => {
  const gone = person({ roles: ["executive_sponsor", "economic_buyer"], engagementStatus: "left_company" });
  const f = stakeholderFacts([gone, person({ roles: ["champion"] })]);
  assert.equal(f.sponsor_access, false, "a departed sponsor is not sponsor access");
  assert.equal(f.economic_buyer_known, false);
  assert.equal(f.activeStakeholders, 1);
  assert.equal(f.single_threaded, true, "and the account is down to one person");
  assert.equal(isActive(gone), false);
});

test("champion_left means we HAD one and they have all gone", () => {
  /* An account that never had a champion has not lost one — that is the
     missing-role gap, a different signal with a different remedy. */
  assert.equal(stakeholderFacts([person({ roles: ["decision_maker"] })]).champion_left, false);
  assert.equal(stakeholderFacts([
    person({ roles: ["champion"], engagementStatus: "left_company" }),
  ]).champion_left, true);
  assert.equal(stakeholderFacts([
    person({ roles: ["champion"], engagementStatus: "left_company" }),
    person({ roles: ["champion"], engagementStatus: "active" }),
  ]).champion_left, false, "a replacement means the champion has not gone");
});

test("one person can satisfy several critical roles at once", () => {
  const f = stakeholderFacts([
    person({ roles: ["executive_sponsor", "economic_buyer", "decision_maker"] }),
    person({ roles: ["champion"] }),
  ]);
  assert.equal(f.criticalRolesCovered.length, 4);
  assert.equal(f.sponsor_access, true);
  assert.equal(f.economic_buyer_known, true);
});

test("missing enrichment never makes a valid role disappear", () => {
  /* A migrated stakeholder has unknown influence, sentiment and strength by
     design. That is enrichment quality, not existence. */
  const bare = person({ roles: ["economic_buyer"], influence: "unknown", sentiment: "unknown", relationshipStrength: "unknown" });
  assert.equal(stakeholderFacts([bare]).economic_buyer_known, true);
  assert.deepEqual(stakeholderFacts([bare]).criticalRolesCovered, ["economic_buyer"]);
});

test("a duplicate role on one person is not counted twice", () => {
  const f = stakeholderFacts([person({ roles: ["champion", "champion"] }), person({ roles: ["champion"] })]);
  assert.equal(f.activeStakeholders, 2);
});

test("the CSM's answer always beats the roster", () => {
  // They said single-threaded; four mapped people do not override that.
  assert.equal(preferAnswered(true, false), true);
  // They said NOT single-threaded; one mapped person does not override it either.
  assert.equal(preferAnswered(false, true), false);
});

test("the roster only fills a blank, and the old fallback stays last", () => {
  assert.equal(preferAnswered(undefined, true), true, "unanswered -> roster answers");
  assert.equal(preferAnswered(undefined, null, true), true, "no roster -> the contact-count fallback");
  assert.equal(preferAnswered(undefined, null, null), null, "nothing at all stays null");
});
