import { test } from "node:test";
import assert from "node:assert/strict";
import { canOwnAccounts, permissionTier, ROLES, type Role } from "./roles";

/* WHO MAY OWN AN ACCOUNT. This predicate is read by getTeamMembers (lib/data.ts),
   which is BOTH the owner pickers' option list and what assignCsmOwner /
   assignImplementationOwner validate an incoming email against. A role missing
   from it cannot be assigned at all — not by an admin, not by themselves — and
   the failure surfaced as "CSM not found", which reads like a missing user
   rather than a role rule. Super-admins were excluded that way once; these
   assertions are what stop it happening again. */

test("a super-admin may own an account", () => {
  assert.equal(canOwnAccounts("super_admin"), true);
});

test("an admin and every operator tier may own an account", () => {
  assert.equal(canOwnAccounts("admin"), true);
  assert.equal(canOwnAccounts("operator"), true);
  for (const r of ROLES.filter((r) => permissionTier(r) === "operator")) {
    assert.equal(canOwnAccounts(r), true, `${r} should be assignable`);
  }
});

test("a guest may NOT own an account — read-only cannot act on its own account", () => {
  assert.equal(canOwnAccounts("guest"), false);
});

test("guest is the ONLY excluded role — no other role may be dropped by accident", () => {
  const excluded = (ROLES as readonly Role[]).filter((r) => !canOwnAccounts(r));
  assert.deepEqual(excluded, ["guest"]);
});

test("nobody signed out may own an account", () => {
  assert.equal(canOwnAccounts(null), false);
});
