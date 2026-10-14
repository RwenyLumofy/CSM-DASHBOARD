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
import { isSuperAdmin } from "@/lib/auth";
import { runSync } from "@/lib/integrations/sync";
import { getNotionSyncStatus, syncClientsToNotion, type NotionLastRun } from "@/lib/integrations/notion-sync";

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

export interface NotionSyncActionResult {
  ok: boolean;
  error?: string;
  lastRun?: NotionLastRun;
  databaseUrl?: string | null;
}

/**
 * Run the weekly Notion export now — super-admin only. It writes the whole
 * client book, ARR included, to an outside system, and the CSM tiers only see
 * their own accounts inside Signal, so it is not theirs to trigger.
 */
export async function notionSyncNowAction(): Promise<NotionSyncActionResult> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Only super-admins can sync to Notion." };
  try {
    const r = await syncClientsToNotion();
    if (r.skipped) return { ok: false, error: r.skipped };
    const { lastRun, databaseUrl } = await getNotionSyncStatus();
    if (!lastRun) return { ok: false, error: "The sync ran but its result could not be read back." };
    const firstError = r.errors?.[0];
    return { ok: true, lastRun, databaseUrl, ...(firstError ? { error: firstError } : {}) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Full "factory reset" re-sync — super-admin only. Clears the per-deal field
 * overrides (__deal_overrides) so HubSpot's current values show through, rewinds
 * the checkpoint, then re-pulls every Closed Won deal. Milestone dates and brief
 * overrides are preserved.
 */
export async function fullResyncAction(): Promise<SyncActionResult> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Only super-admins can run a full re-sync." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  try {
    const { clearDealOverrides, setSyncCheckpoint } = await import("@/lib/repo/drizzle");
    const overridesCleared = await clearDealOverrides();
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
