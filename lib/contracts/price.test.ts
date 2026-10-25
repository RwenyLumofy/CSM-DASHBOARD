import { test } from "node:test";
import assert from "node:assert/strict";
import { startingUserPrice } from "./price";

test("a stored price that gives the licence ARR is kept", () => {
  assert.deepEqual(startingUserPrice(48_000, 400, 120), { price: 120, matches: true, stored: 120 });
});

test("a stored price within 5% of the licence ARR is kept", () => {
  assert.equal(startingUserPrice(48_000, 400, 125).price, 125); // 50,000 is 4.2% over
});

test("a stored price that overstates the licence ARR is replaced by ARR ÷ licences", () => {
  // neo space group: 200 licences at $133.33 recorded, $17,608 of licence ARR.
  const p = startingUserPrice(17_608, 200, 133.33);
  assert.deepEqual(p, { price: 88.04, matches: false, stored: 133.33 });
  // Cutting to 160 licences is then a downgrade, not +$3.7K.
  assert.ok(160 * p.price < 17_608);
  assert.equal(Math.round(160 * p.price), 14_086);
});

test("a missing stored price falls back to the effective price", () => {
  assert.deepEqual(startingUserPrice(10_000, 100, null), { price: 100, matches: false, stored: 0 });
});

test("with no licences there's nothing to divide by, so the stored price stands", () => {
  assert.deepEqual(startingUserPrice(10_000, 0, 50), { price: 50, matches: true, stored: 50 });
  assert.deepEqual(startingUserPrice(10_000, null, null), { price: 0, matches: true, stored: 0 });
});
