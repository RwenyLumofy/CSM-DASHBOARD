import { test } from "node:test";
import assert from "node:assert/strict";
import { renewalDisplay, computeRenewal } from "@/lib/deal-overrides";

/* =========================================================================
   renewalDisplay — what the deal card may honestly say about a renewal.

   These cases ARE the product rule, not incidental coverage: the card used to
   assert "Auto · +1yr" on every deal regardless of what was known, and the
   brief's standing instruction is to say "needs confirmation" rather than
   infer a term. If someone later makes contractDuration drive arithmetic
   without normalising its unit first, the 36-month/36-year case below is what
   should stop them.
   ========================================================================= */

test("assumes one year when no term is recorded — and says it is an assumption", () => {
  const r = renewalDisplay("2026-04-13T00:00:00.000Z", null);
  assert.equal(r.kind, "assumed");
  assert.equal(r.date, computeRenewal("2026-04-13T00:00:00.000Z"));
  assert.match(r.note, /assumed/i);
  assert.doesNotMatch(r.note, /auto/i); // the old badge claimed derivation, not assumption
});

test("treats a recorded term of 1 as annual — it is one year under either unit", () => {
  const r = renewalDisplay("2026-01-01T00:00:00.000Z", 1);
  assert.equal(r.kind, "assumed");
  assert.equal(r.date, "2027-01-01T00:00:00.000Z");
});

test("refuses to derive a date when the term is not annual", () => {
  // GCCIA: duration 3. Three years, or three months? The column holds both.
  const r = renewalDisplay("2026-04-13T00:00:00.000Z", 3);
  assert.equal(r.kind, "term_unknown");
  assert.equal(r.date, null);
  assert.match(r.note, /confirmation/i);
});

test("12 is unresolvable, not annual — 12 months reads as a year, 12 years does not", () => {
  const r = renewalDisplay("2026-01-01T00:00:00.000Z", 12);
  assert.equal(r.kind, "term_unknown");
  assert.equal(r.date, null);
});

test("36 never silently becomes a 36-year renewal", () => {
  // Total CX: HubSpot wrote 36 (months). Honouring the field as written would
  // put this account's renewal in 2062.
  const r = renewalDisplay("2026-11-01T00:00:00.000Z", 36);
  assert.equal(r.kind, "term_unknown");
  assert.equal(r.date, null);
});

test("no contract start date yields no date and asks for one", () => {
  for (const missing of [null, undefined, ""]) {
    const r = renewalDisplay(missing, null);
    assert.equal(r.kind, "no_start");
    assert.equal(r.date, null);
    assert.match(r.note, /contract start/i);
  }
});

test("an unparseable contract start date is treated as missing, not as a date", () => {
  const r = renewalDisplay("not-a-date", null);
  assert.equal(r.kind, "no_start");
  assert.equal(r.date, null);
});

test("a missing start date wins over a declared term", () => {
  // Nothing to count from, so the term is moot — the CSM's next action is to
  // supply the date, and that is what the card should say.
  const r = renewalDisplay(null, 36);
  assert.equal(r.kind, "no_start");
});

test("computeRenewal still adds exactly one UTC year", () => {
  assert.equal(computeRenewal("2026-02-28T00:00:00.000Z"), "2027-02-28T00:00:00.000Z");
  assert.equal(computeRenewal(null), null);
});
