"use server";

/* Manual owner (re)assignment from the client profile — super-admin only.
   Writing with source 'manual' marks it as a human decision, and any open
   "needs admin" action item for that client+team is resolved.

   A reassignment used to be entirely silent: the new owner was never told,
   nothing was written down, and no page was revalidated — so whoever inherited
   an account found out by noticing it in a list, and "who moved this, and
   when?" had no answer. recordOwnerChange handles all three. */

import { revalidatePath } from "next/cache";
import { isSuperAdmin, getCurrentUserEmail } from "@/lib/auth";
import { assignCsmOwner, assignImplementationOwner, getClientById } from "@/lib/data";
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

/**
 * Tell the incoming owner, write the audit row, refresh what the change shows on.
 *
 * Deliberately best-effort: the ownership write has already committed by the
 * time this runs, so a failed notification must not surface as "assignment
 * failed" and tempt someone into reassigning again. It is logged instead.
 */
async function recordOwnerChange(
  clientId: string,
  team: "csm" | "implementation",
  fromEmail: string | null,
  toEmail: string | null,
): Promise<void> {
  const teamWord = team === "csm" ? "CSM" : "Implementation owner";
  try {
    const [actor, client] = await Promise.all([getCurrentUserEmail(), getClientById(clientId)]);
    const name = client?.name ?? clientId;
    const { appendTimelineEventDb, insertNotificationsDb } = await import("@/lib/repo/drizzle");

    await appendTimelineEventDb({
      clientId,
      type: "owner_changed",
      title: toEmail ? `${teamWord} set to ${toEmail}` : `${teamWord} cleared`,
      body: fromEmail ? `Previously ${fromEmail}.` : "No previous owner.",
      author: actor,
    });

    // Only the incoming owner is told. The outgoing one loses the account from
    // their list, which is self-evident; a second notification would be noise.
    // Reassigning to the same person notifies nobody.
    if (toEmail && toEmail !== fromEmail) {
      await insertNotificationsDb([{
        // Timestamped rather than deterministic: moving an account away and
        // back is a real event both times, and insertNotificationsDb skips ids
        // that already exist, which would swallow the second.
        id: `nt-assigned-${team}-${clientId}-${Date.now()}`,
        recipientEmail: toEmail,
        type: "client_assigned",
        title: `New client assigned: ${name}`,
        body: `You're the ${teamWord} for ${name}.`,
        clientId,
        createdByEmail: actor,
      }]);
    }
  } catch (err) {
    console.error("[owner-actions] assignment committed but notify/audit failed", { clientId, team, err });
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/");
}

export async function setCsmOwnerAction(clientId: string, email: string | null): Promise<OwnerActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    // Read before writing — the audit line needs the outgoing owner.
    const before = await getClientById(clientId);
    const from = before?.csm?.email ?? null;
    await assignCsmOwner(clientId, email, "manual");
    const { resolveNotificationsForClientDb } = await import("@/lib/repo/drizzle");
    await resolveNotificationsForClientDb(clientId, ["assignment_needs_admin"]);
    await recordOwnerChange(clientId, "csm", from, email?.toLowerCase() ?? null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function setImplementationOwnerAction(clientId: string, email: string | null): Promise<OwnerActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  try {
    const before = await getClientById(clientId);
    const from = before?.implementationOwner?.email ?? null;
    await assignImplementationOwner(clientId, email, "manual");
    const { resolveNotificationsForClientDb } = await import("@/lib/repo/drizzle");
    await resolveNotificationsForClientDb(clientId, ["assignment_needs_admin"]);
    await recordOwnerChange(clientId, "implementation", from, email?.toLowerCase() ?? null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
