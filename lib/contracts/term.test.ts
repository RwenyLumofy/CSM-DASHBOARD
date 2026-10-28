import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTermStart, renewalAfterMonths, renewalFor, termMonths } from "./term";

test("a one-year term renews on its last day, not the day after", () => {
  // Gulf Air: starts 1 Jan, renews 31 Dec of the same year (Q4, not Q1).
  assert.equal(renewalFor("2026-01-01"), "2026-12-31");
  assert.equal(renewalFor("2025-10-15"), "2026-10-14");
});

test("multi-year and month-length terms end the day before the anniversary", () => {
  assert.equal(renewalFor("2026-01-01", 3), "2028-12-31");
  assert.equal(renewalAfterMonths("2026-03-01", 18), "2027-08-31");
});

test("a term starting 29 Feb ends 28 Feb", () => {
  assert.equal(renewalFor("2024-02-29"), "2025-02-28");
});

test("the next term starts the day after the renewal date", () => {
  assert.equal(nextTermStart("2026-12-31"), "2027-01-01");
});

test("term length counts the last day", () => {
  assert.equal(termMonths("2026-01-01", "2026-12-31"), 12);
  assert.equal(termMonths("2026-01-01", "2028-12-31"), 36);
  assert.equal(termMonths("2026-03-01", "2027-08-31"), 18);
});
