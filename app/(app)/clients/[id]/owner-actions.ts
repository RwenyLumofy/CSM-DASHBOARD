"use server";

/* Manual owner (re)assignment from the client profile — super-admin only.
   Writing with source 'manual' marks it as a human decision, and any open
   "needs admin" action item for that client+team is resolved. */

import { isSuperAdmin } from "@/lib/auth";
import { assignCsmOwner, assignImplementationOwner } from "@/lib/data";
import { hasDatabase } from "@/lib/config";

export interface OwnerActionResult {
  ok: boolean;
  error?: string;
}

async function guard(): Promise<OwnerActionResult | null> {
  // isSuperAdmin, not isAdminOrSuper: the header comment, this error message and
  // the UI gate (ClientHeaderCard's canEdit={superAdmin}) all said super-admin,
  // while the check itself admitted plain admins. An admin therefore never saw
  // the Assign button but could still reassign any account by calling this
  // action directly — the looser of two disagreeing gates is the one that counts.
  if (!(await isSuperAdmin())) return { ok: false, error: "Super-admin access required." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  return null;
}

export async function setCsmOwnerAction(clientId: string, email: string | null): Promise<OwnerActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    await assignCsmOwner(clientId, email, "manual");
    const { resolveNotificationsForClientDb } = await import("@/lib/repo/drizzle");
    await resolveNotificationsForClientDb(clientId, ["assignment_needs_admin"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function setImplementationOwnerAction(clientId: string, email: string | null): Promise<OwnerActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    await assignImplementationOwner(clientId, email, "manual");
    const { resolveNotificationsForClientDb } = await import("@/lib/repo/drizzle");
    await resolveNotificationsForClientDb(clientId, ["assignment_needs_admin"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
