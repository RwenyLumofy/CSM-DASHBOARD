/* The /api/v1 key format, auth header parsing, and the account filters and
   paging other tools depend on. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, displayPrefix, generateApiKey, hashApiKey, looksLikeApiKey } from "./keys";
import { dateOnly, daysBetween, filterAccounts, paginate, parseList, parsePaging, type ApiAccount } from "./serialize";

test("a generated key has the documented shape and hashes to what is stored", () => {
  const { key, prefix, hash } = generateApiKey();
  assert.ok(looksLikeApiKey(key));
  assert.equal(prefix, displayPrefix(key));
  assert.equal(prefix.length, 12);
  assert.equal(hash, hashApiKey(key));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(generateApiKey().key, key);
});

test("only well-formed keys reach the database", () => {
  assert.equal(looksLikeApiKey("sig_short"), false);
  assert.equal(looksLikeApiKey("xyz_" + "a".repeat(43)), false);
  assert.equal(looksLikeApiKey("sig_" + "a".repeat(42) + "!"), false);
  assert.equal(looksLikeApiKey("sig_" + "a".repeat(43)), true);
});

test("the bearer token is read from the Authorization header", () => {
  assert.equal(bearerToken("Bearer sig_abc"), "sig_abc");
  assert.equal(bearerToken("bearer  sig_abc "), "sig_abc");
  assert.equal(bearerToken("Basic sig_abc"), null);
  assert.equal(bearerToken("Bearer a b"), null);
  assert.equal(bearerToken(null), null);
});

test("days to renewal counts calendar days and goes negative once past", () => {
  assert.equal(daysBetween("2026-10-18", "2026-10-18"), 0);
  assert.equal(daysBetween("2026-10-18", "2026-11-17"), 30);
  assert.equal(daysBetween("2026-10-18", "2026-10-01T23:00:00.000Z"), -17);
  assert.equal(daysBetween("2026-10-18", null), null);
});

test("account dates go out as calendar dates", () => {
  assert.equal(dateOnly("2026-11-01T00:00:00.000Z"), "2026-11-01");
  assert.equal(dateOnly("2026-11-01"), "2026-11-01");
  assert.equal(dateOnly(null), null);
});

function account(over: Partial<ApiAccount>): ApiAccount {
  return {
    id: "a", name: "Acme", domain: "acme.com", hubspot_id: null, hubspot_url: null, status: "active",
    segment: "enterprise", customer_type: "arr", country: null, industry: null, employees: null,
    csm: { name: "Sam", email: "sam@lumofy.com" }, implementation_owner: null, arr: 1000, currency: "USD",
    started_at: null, renewal_date: null, days_to_renewal: null, churned_at: null,
    health: { score: 70, tier: "Healthy", trend: 0, capped_by: [], updated_at: null }, tags: [],
    ...over,
  };
}

test("renewing_within_days keeps upcoming renewals only, never churned or overdue ones", () => {
  const list = [
    account({ id: "soon", days_to_renewal: 30 }),
    account({ id: "today", days_to_renewal: 0 }),
    account({ id: "late", days_to_renewal: 120 }),
    account({ id: "overdue", days_to_renewal: -3 }),
    account({ id: "churned", status: "churned", days_to_renewal: 10 }),
    account({ id: "none" }),
  ];
  assert.deepEqual(filterAccounts(list, { renewingWithinDays: 90 }).map((a) => a.id), ["soon", "today"]);
});

test("account filters combine, and match CSM email and tier case-insensitively", () => {
  const list = [
    account({ id: "1" }),
    account({ id: "2", segment: "smb" }),
    account({ id: "3", csm: { name: "Ali", email: "ali@lumofy.com" } }),
    account({ id: "4", health: { score: 30, tier: "At risk", trend: 0, capped_by: [], updated_at: null } }),
  ];
  assert.deepEqual(filterAccounts(list, { segment: ["enterprise"], csmEmail: "SAM@lumofy.com" }).map((a) => a.id), ["1", "4"]);
  assert.deepEqual(filterAccounts(list, { healthTier: "at risk" }).map((a) => a.id), ["4"]);
  assert.deepEqual(filterAccounts(list, { q: "ACME.c" }).length, 4);
});

test("paging reports the next offset until the list runs out", () => {
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(items, 2, 0).meta, { total: 5, limit: 2, offset: 0, next_offset: 2 });
  assert.deepEqual(paginate(items, 2, 4).data, [5]);
  assert.equal(paginate(items, 2, 4).meta.next_offset, null);
});

test("bad paging and list params come back as messages, not exceptions", () => {
  assert.equal(typeof parsePaging(new URLSearchParams("limit=0")), "string");
  assert.equal(typeof parsePaging(new URLSearchParams("limit=501")), "string");
  assert.equal(typeof parsePaging(new URLSearchParams("offset=-1")), "string");
  assert.deepEqual(parsePaging(new URLSearchParams("")), { limit: 100, offset: 0 });
  assert.deepEqual(parseList(new URLSearchParams("status=active,renewal"), "status", ["active", "renewal"]), ["active", "renewal"]);
  assert.equal(typeof parseList(new URLSearchParams("status=nope"), "status", ["active"]), "string");
  assert.equal(parseList(new URLSearchParams(""), "status", ["active"]), undefined);
});
