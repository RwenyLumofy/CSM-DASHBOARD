"use server";

/* =========================================================================
   Settings → Data sync server actions.

   These run on the server in the signed-in user's session, so the destructive
   "full re-sync" can be gated by isSuperAdmin() and is never reachable from the
   open /api/sync HTTP endpoint. When auth is disabled (local/sample mode) the
   checks fall through (dev bypass), mirroring the rest of the app.
   ========================================================================= */

import { currentUser } from "@clerk/nextjs/server";
import { authEnabled, hasDatabase } from "@/lib/config";
import { isSuperAdmin, getCurrentUserEmail } from "@/lib/auth";
import { runSync } from "@/lib/integrations/sync";

export interface SyncActionResult {
  ok: boolean;
  error?: string;
  clientCount?: number;
  dealCount?: number;
  newClientCount?: number;
  newDealCount?: number;
  lastSyncedAt?: string | null;
  overridesCleared?: number;
  skipped?: boolean;
}

export interface ResetPreview {
  ok: boolean;
  error?: string;
  clients?: number;
  fields?: number;
  amountOverrides?: number;
  contractStartOverrides?: number;
  accountsWithArrChange?: number;
  arrDelta?: number;
}

/**
 * What a Full re-sync would destroy, read live for the confirm dialog.
 *
 * Exists because the dialog described clearing display fields while two of
 * those fields feed ARR and the renewal date. Computed on open rather than
 * written into the copy, so the numbers can never go stale.
 */
export async function previewFullResyncAction(): Promise<ResetPreview> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Only super-admins can run a full re-sync." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  try {
    const { previewDealOverridesReset } = await import("@/lib/repo/drizzle");
    return { ok: true, ...(await previewDealOverridesReset()) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Any signed-in user may trigger a manual incremental sync (dev bypass when off). */
async function signedIn(): Promise<boolean> {
  if (!authEnabled()) return true;
  try {
    return !!(await currentUser());
  } catch {
    return false;
  }
}

/** Manual incremental sync — same as the daily run; never clears CSM overrides. */
export async function syncNowAction(): Promise<SyncActionResult> {
  if (!(await signedIn())) return { ok: false, error: "You must be signed in to sync." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  try {
    const r = await runSync();
    if (r.skipped) return { ok: false, error: "A sync is already running — try again in a moment.", skipped: true };
    return {
      ok: true,
      clientCount: r.clientCount,
      dealCount: r.dealCount,
      newClientCount: r.newClientCount,
      newDealCount: r.newDealCount,
      lastSyncedAt: r.lastSyncedAt,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Full "factory reset" re-sync — super-admin only. Clears the per-deal field
 * overrides (__deal_overrides) so HubSpot's current values show through, rewinds
 * the checkpoint, then re-pulls every Closed Won deal. Milestone dates and brief
 * overrides are preserved.
 *
 * Two of the cleared fields (`amount`, `contractStartDate`) are inputs to ARR
 * and the renewal date, so this moves reported numbers as well as labels — see
 * previewFullResyncAction, which the dialog shows before asking. Everything
 * cleared is snapshotted into workspace_config first.
 */
export async function fullResyncAction(): Promise<SyncActionResult> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Only super-admins can run a full re-sync." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  try {
    const { clearDealOverrides, setSyncCheckpoint } = await import("@/lib/repo/drizzle");
    // Who ran it, recorded alongside the snapshot of what was cleared — so the
    // values can be restored by hand and someone can be asked what they meant.
    const clearedBy = await getCurrentUserEmail().catch(() => null);
    const overridesCleared = await clearDealOverrides(clearedBy);
    // Rewind the checkpoint so runSync re-pulls every Closed Won deal (not first-run).
    await setSyncCheckpoint("last_synced_at", "2020-01-01T00:00:00.000Z");
    const r = await runSync();
    if (r.skipped) {
      return { ok: false, error: "A sync is already running — try again in a moment.", skipped: true, overridesCleared };
    }
    return {
      ok: true,
      clientCount: r.clientCount,
      dealCount: r.dealCount,
      newClientCount: r.newClientCount,
      newDealCount: r.newDealCount,
      lastSyncedAt: r.lastSyncedAt,
      overridesCleared,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
