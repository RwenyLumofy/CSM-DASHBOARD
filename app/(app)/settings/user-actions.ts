"use server";

/* =========================================================================
   Users & roles server actions — super-admin only, enforced server-side.
   Permanent super-admins (SUPER_ADMIN_EMAILS) can't be edited or removed here.
   ========================================================================= */

import { isSuperAdmin, getCurrentUserEmail } from "@/lib/auth";
import { env, hasDatabase } from "@/lib/config";
import { isRole } from "@/lib/roles";

export interface UserActionResult {
  ok: boolean;
  error?: string;
}

async function guard(email: string): Promise<UserActionResult | null> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Only super-admins can manage users." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (env.superAdminEmails.includes(email)) {
    return { ok: false, error: "This email is a permanent super-admin and can't be changed here." };
  }
  return null;
}

/** Add a new app user (allowlist email + role), or update an existing one. */
export async function addOrUpdateUserAction(input: { email: string; name?: string; role: string }): Promise<UserActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!isRole(input.role)) return { ok: false, error: "Invalid role." };
  const blocked = await guard(email);
  if (blocked) return blocked;
  try {
    const { upsertAppUserDb } = await import("@/lib/repo/drizzle");
    await upsertAppUserDb({ email, name: input.name?.trim() || null, role: input.role, addedByEmail: await getCurrentUserEmail() });
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
  const blocked = await guard(e);
  if (blocked) return blocked;
  try {
    const { setAppUserRoleDb } = await import("@/lib/repo/drizzle");
    await setAppUserRoleDb(e, role, name);
    return { ok: true };
  } catch (er) {
    return { ok: false, error: String(er) };
  }
}

/** Remove an app user (revoke their role; they fall back to the default tier). */
export async function removeUserAction(email: string): Promise<UserActionResult> {
  const e = email.trim().toLowerCase();
  const blocked = await guard(e);
  if (blocked) return blocked;
  try {
    const { deleteAppUserDb } = await import("@/lib/repo/drizzle");
    await deleteAppUserDb(e);
    return { ok: true };
  } catch (er) {
    return { ok: false, error: String(er) };
  }
}
