"use server";

/* Notifications centre reads. Mutations (mark read / mark all read) are shared
   with the bell and live in app/(app)/inbox/actions.ts — one implementation, so
   the two surfaces cannot drift on what "read" means. */

import { getMyNotificationsPage } from "@/lib/data";
import type { Notification } from "@/lib/types";

/**
 * The next page of history, older than `before`.
 *
 * Returns `hasMore: false` on failure rather than throwing, so a failed page
 * load retires the "Load older" button instead of leaving a control that
 * silently does nothing. The caller reports the failure through `ok`.
 */
export async function loadOlderNotificationsAction(
  before: string,
): Promise<{ ok: boolean; items: Notification[]; hasMore: boolean }> {
  try {
    const page = await getMyNotificationsPage(before);
    return { ok: true, ...page };
  } catch {
    return { ok: false, items: [], hasMore: false };
  }
}
