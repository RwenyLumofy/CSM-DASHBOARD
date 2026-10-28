import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSegment, segmentForHeadcount, segmentWriteFor } from "./segment";

/* The production state these tests exist for (2026-10-28): three accounts had
   a CSM-corrected headcount and the segment HubSpot's original number implied —
   4,400 employees tagged SMB, 250 tagged SMB, 110 tagged SMB. The segment was
   decided once inside the sync and never revisited. */

test("the thresholds: 250+ enterprise, 50+ mid-market, below that SMB", () => {
  assert.equal(segmentForHeadcount(4400), "enterprise");
  assert.equal(segmentForHeadcount(250), "enterprise"); // boundary, inclusive
  assert.equal(segmentForHeadcount(249), "mid_market");
  assert.equal(segmentForHeadcount(110), "mid_market");
  assert.equal(segmentForHeadcount(50), "mid_market"); // boundary, inclusive
  assert.equal(segmentForHeadcount(49), "smb");
  assert.equal(segmentForHeadcount(0), "smb");
});

test("an unknown headcount reads as SMB — the behaviour, not an endorsement", () => {
  // 37 accounts have no headcount and therefore sit in SMB rather than in an
  // "unknown" bucket. Documented as a known limitation; pinned here so the
  // next change to it is deliberate.
  assert.equal(segmentForHeadcount(null), "smb");
  assert.equal(segmentForHeadcount(undefined), "smb");
});

test("a corrected headcount moves the segment — the Gulf Air case", () => {
  assert.equal(nextSegment(4400, false, "smb"), "enterprise");
  assert.equal(nextSegment(110, false, "smb"), "mid_market");
});

test("a segment set by hand is never recomputed", () => {
  // The escape hatch for an account whose headcount does not describe it — a
  // local entity whose HubSpot record carries the global company's headcount.
  assert.equal(nextSegment(100000, true, "mid_market"), null);
  assert.equal(nextSegment(4400, true, "smb"), null);
});

test("nothing to write when the stored segment already agrees", () => {
  // Keeps the recompute's UPDATE free of no-op column writes.
  assert.equal(nextSegment(4400, false, "enterprise"), null);
  assert.equal(nextSegment(null, false, "smb"), null);
});

/* The Edit account drawer posts EVERY core field on every save. These pin the
   rule that keeps such a save from silently freezing an account's band. */

test("a drawer save that re-posts the same segment does not mark it, and the band follows the headcount", () => {
  const r = segmentWriteFor({ incoming: "enterprise", stored: "enterprise", employees: 120, employeesProvided: true, overridden: false });
  assert.deepEqual(r, { segment: "mid_market", markOverride: false });
});

test("a segment that differs is a human's choice, and is marked", () => {
  const r = segmentWriteFor({ incoming: "enterprise", stored: "mid_market", employees: 120, employeesProvided: true, overridden: false });
  assert.deepEqual(r, { segment: "enterprise", markOverride: true });
});

test("once marked, a later headcount correction leaves the band alone", () => {
  const r = segmentWriteFor({ incoming: "enterprise", stored: "enterprise", employees: 40, employeesProvided: true, overridden: true });
  assert.deepEqual(r, { segment: null, markOverride: false });
});

test("a save that touches neither field writes nothing", () => {
  const r = segmentWriteFor({ incoming: undefined, stored: "smb", employees: undefined, employeesProvided: false, overridden: false });
  assert.deepEqual(r, { segment: null, markOverride: false });
});
