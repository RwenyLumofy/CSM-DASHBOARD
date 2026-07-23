"use server";

/* =========================================================================
   Users & roles server actions — super-admin only, enforced server-side.
   Permanent super-admins (SUPER_ADMIN_EMAILS) can't be edited or removed here.
   ========================================================================= */

import { isAdminOrSuper, isSuperAdmin, getCurrentUserEmail } from "@/lib/auth";
import { getAppUsers, getOwnedAccountCounts } from "@/lib/data";
import { env, hasDatabase } from "@/lib/config";
import { isRole, permissionTier } from "@/lib/roles";

export interface UserActionResult {
  ok: boolean;
  error?: string;
  /** Set when a remove is blocked by owned work — lets the UI surface reassignment. */
  ownedAccounts?: number;
}

/** Roles only a super-admin may grant or touch — the escalation boundary. */
const CROWN_ROLES = new Set(["admin", "super_admin"]);

/** Is `email` the only remaining super-admin? Protects the last one from being
 *  demoted, suspended or removed. */
async function isLastSuperAdmin(email: string): Promise<boolean> {
  const users = await getAppUsers();
  const supers = users.filter((u) => permissionTier(u.role) === "super_admin");
  return supers.length <= 1 && supers.some((u) => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Gate every user-management write. Admins can manage members, BUT the
 * escalation boundary is absolute and enforced server-side: only a super-admin
 * may create/edit/remove an admin or super-admin, or grant those roles. An
 * admin can never promote itself or anyone else into the crown.
 *
 * @param email       the user being changed
 * @param targetRole  the role they're being set to (undefined when removing)
 */
async function guard(email: string, targetRole?: string): Promise<UserActionResult | null> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Admin access required to manage users." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (env.superAdminEmails.includes(email)) {
    return { ok: false, error: "This email is a permanent super-admin and can't be changed here." };
  }
  // Escalation boundary — admins can't touch the crown, in either direction.
  if (!(await isSuperAdmin())) {
    if (targetRole && CROWN_ROLES.has(targetRole)) {
      return { ok: false, error: "Only a super-admin can grant Admin or Super Admin." };
    }
    const current = (await getAppUsers()).find((u) => u.email.toLowerCase() === email.toLowerCase())?.role;
    if (current && CROWN_ROLES.has(current)) {
      return { ok: false, error: "Only a super-admin can modify an admin." };
    }
  }
  // Protect the last super-admin from demotion or removal (undefined targetRole
  // = removal; a non-super target = demotion). Never leave the workspace with
  // no one who can manage it.
  const isDemotionOrRemoval = targetRole === undefined || !(isRole(targetRole) && permissionTier(targetRole) === "super_admin");
  if (isDemotionOrRemoval && (await isLastSuperAdmin(email))) {
    return { ok: false, error: "This is the last super-admin. Assign another super-admin before changing or removing this one." };
  }
  return null;
}

/** Add a new app user (allowlist email + role), or update an existing one. */
export async function addOrUpdateUserAction(input: {
  email: string;
  name?: string;
  role: string;
  title?: string;
  department?: string;
}): Promise<UserActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!isRole(input.role)) return { ok: false, error: "Invalid role." };
  const blocked = await guard(email, input.role);
  if (blocked) return blocked;
  try {
    const { upsertAppUserDb, getAppUserRoleFromDb } = await import("@/lib/repo/drizzle");
    await upsertAppUserDb({
      email,
      name: input.name?.trim() || null,
      role: input.role,
      // undefined = "don't touch"; a trimmed-empty string = "clear it".
      title: input.title === undefined ? undefined : input.title.trim() || null,
      department: input.department === undefined ? undefined : input.department.trim() || null,
      addedByEmail: await getCurrentUserEmail(),
    });
    // Read back — a save must persist, or fail loudly (never a false success).
    const persisted = await getAppUserRoleFromDb(email);
    if (persisted !== input.role) {
      return { ok: false, error: `Save didn't persist — the database still shows "${persisted ?? "no row"}". Check write access to app_users.` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Change just the role of a user. Upserts into app_users so CSMs that only
 *  exist in csm_users (not yet in app_users) are created automatically. */
export async function setUserRoleAction(email: string, role: string, name?: string | null): Promise<UserActionResult> {
  const e = email.trim().toLowerCase();
  if (!isRole(role)) return { ok: false, error: "Invalid role." };
  const blocked = await guard(e, role);
  if (blocked) return blocked;
  try {
    const { setAppUserRoleDb, getAppUserRoleFromDb } = await import("@/lib/repo/drizzle");
    await setAppUserRoleDb(e, role, name);
    // Verify the write actually persisted — a save must never *look* successful
    // without landing (guards against read-replica writes, RLS silently eating
    // an UPDATE, etc.). Read it straight back and confirm.
    const persisted = await getAppUserRoleFromDb(e);
    if (persisted !== role) {
      return { ok: false, error: `Save didn't persist — the database still shows "${persisted ?? "no row"}". Check write access to app_users.` };
    }
    return { ok: true };
  } catch (er) {
    return { ok: false, error: String(er) };
  }
}

/** Valid scope override values (null clears the override → role default). */
const SCOPES = new Set(["all", "assigned", "selected"]);

/**
 * Set a member's access scope and, for 'selected', the exact accounts they may
 * reach. Enforced server-side by lib/auth's getCurrentUserScope. Passing
 * `scope: null` clears the override so the role default applies again.
 */
export async function setUserScopeAction(input: {
  email: string;
  scope: string | null;
  clientIds?: string[];
}): Promise<UserActionResult> {
  const email = input.email.trim().toLowerCase();
  const blocked = await guard(email, undefined); // management gate + crown/self protections
  if (blocked) return blocked;
  if (input.scope !== null && !SCOPES.has(input.scope)) return { ok: false, error: "Invalid access scope." };
  try {
    const { setUserScopeDb } = await import("@/lib/repo/drizzle");
    await setUserScopeDb(email, input.scope, input.scope === "selected" ? (input.clientIds ?? []) : []);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Remove an app user (revoke membership).
 *  - You can't remove yourself.
 *  - The last super-admin is protected (in guard()).
 *  - If the member owns accounts, the removal is BLOCKED and the owned count is
 *    returned so the UI can require reassignment first — never silently orphan
 *    accounts. Pass `reassigned: true` only after the work has been moved.
 */
export async function removeUserAction(email: string, opts?: { reassigned?: boolean }): Promise<UserActionResult> {
  const e = email.trim().toLowerCase();
  const me = (await getCurrentUserEmail())?.toLowerCase();
  if (me && me === e) return { ok: false, error: "You can't remove your own access." };
  const blocked = await guard(e);
  if (blocked) return blocked;
  if (!opts?.reassigned) {
    const owned = (await getOwnedAccountCounts())[e] ?? 0;
    if (owned > 0) {
      return {
        ok: false,
        ownedAccounts: owned,
        error: `This member owns ${owned} account${owned === 1 ? "" : "s"}. Reassign that work before removing access.`,
      };
    }
  }
  try {
    const { deleteAppUserDb } = await import("@/lib/repo/drizzle");
    await deleteAppUserDb(e);
    return { ok: true };
  } catch (er) {
    return { ok: false, error: String(er) };
  }
}
