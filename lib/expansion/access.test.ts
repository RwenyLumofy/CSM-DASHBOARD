import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeExpansion, canEditExpansion, canDeleteExpansion } from "./access";
import { ROLES, type Role } from "@/lib/roles";

/* A GUEST HAS NO ACCESS TO EXPANSION AT ALL — not read-only access, none.

   Product owner's decision, 2026-08-16: "guests shouldn't have access to this,
   everyone else does/will have access." This SUPERSEDES the build brief's §4
   ("`guest` is read-only"). Do not relax these assertions by citing §4.

   The rule is enforced in five places — the read layer, the route, the nav, the
   client-profile card and the write gate — and all five read the same predicate.
   These tests are what keep them agreeing. */

test("a guest can neither read nor write Expansion", () => {
  assert.equal(canSeeExpansion("guest"), false);
  assert.equal(canEditExpansion("guest"), false);
});

test("every other role can both read and write", () => {
  for (const role of ROLES.filter((r) => r !== "guest")) {
    assert.equal(canSeeExpansion(role), true, `${role} should read Expansion`);
    assert.equal(canEditExpansion(role), true, `${role} should write Expansion`);
  }
});

test("legacy granular operator tiers are operators, not guests", () => {
  const legacy: Role[] = [
    "strategic_csm", "senior_csm", "csm_officer",
    "implementation_officer", "implementation_manager",
  ];
  for (const role of legacy) {
    assert.equal(canSeeExpansion(role), true, role);
    assert.equal(canEditExpansion(role), true, role);
  }
});

test("not signed in is not access, in either direction", () => {
  assert.equal(canSeeExpansion(null), false);
  assert.equal(canEditExpansion(null), false);
});

test("guest is the ONLY role shut out, so the rule cannot silently widen", () => {
  assert.deepEqual(ROLES.filter((r) => !canSeeExpansion(r)), ["guest"]);
});

test("there is no read-only tier — reading and writing admit the same people", () => {
  // If a look-but-don't-touch tier is ever added, change this deliberately
  // rather than discovering the split on a live board.
  for (const role of ROLES) {
    assert.equal(canSeeExpansion(role), canEditExpansion(role), role);
  }
});

test("nothing is writable that is not also readable", () => {
  for (const role of ROLES) {
    if (canEditExpansion(role)) assert.equal(canSeeExpansion(role), true, role);
  }
});

/* ── Delete is narrower than edit, and deliberately so ────────────────────── */

test("only the management tiers may hard delete", () => {
  assert.equal(canDeleteExpansion("super_admin"), true);
  assert.equal(canDeleteExpansion("admin"), true);
  assert.equal(canDeleteExpansion("operator"), false);
  assert.equal(canDeleteExpansion("guest"), false);
  assert.equal(canDeleteExpansion(null), false);
});

test("every legacy operator tier is kept out of delete too", () => {
  for (const role of ROLES as readonly Role[]) {
    if (role === "admin" || role === "super_admin") continue;
    assert.equal(canDeleteExpansion(role), false, `${role} must not be able to delete`);
  }
});

test("delete is strictly narrower than edit — never the other way round", () => {
  for (const role of ROLES as readonly Role[]) {
    if (canDeleteExpansion(role)) {
      assert.equal(canEditExpansion(role), true, `${role} can delete but not edit`);
    }
  }
});

test("an operator can edit but cannot delete — Dropped is their removal path", () => {
  assert.equal(canEditExpansion("operator"), true);
  assert.equal(canDeleteExpansion("operator"), false);
});
