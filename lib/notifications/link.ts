/* =========================================================================
   Where a notification takes you when you click it.

   WHY THIS EXISTS. The bell used to route on clientId alone: every
   notification about an account landed on that account's page, and every
   notification WITHOUT an account did nothing at all — a personal task
   assignment was a dead click, and "you were mentioned in an update" dropped
   you on a page of tabs with no indication of which task was meant.

   A notification is only useful if it can put you in front of the thing it is
   about. entity_type / entity_id carry that; this function is the single place
   that turns them into a destination, so the bell and the Action list can
   never disagree about where the same notification goes.
   ========================================================================= */

import type { Notification } from "@/lib/types";

/** The task a route should open on arrival. Both surfaces that show tasks —
 *  the account Tasks sidebar and the Today board — read this parameter. */
export const TASK_PARAM = "task";

/**
 * The href for a notification, or null when there is genuinely nowhere to go.
 *
 * Returning null rather than "/" matters: the bell renders a non-navigating
 * entry for those instead of pretending a click will do something. A
 * notification that silently does nothing reads as broken.
 */
export function notificationHref(n: Pick<Notification, "clientId" | "entityType" | "entityId">): string | null {
  const q = new URLSearchParams();

  if (n.entityType === "task" && n.entityId) {
    q.set(TASK_PARAM, n.entityId);
    /* An account task lives in that account's Tasks sidebar; a personal task
       only exists on Today. Sending a personal task to /clients/null was the
       old dead click. */
    return n.clientId ? `/clients/${n.clientId}?${q}` : `/today?${q}`;
  }

  if (n.clientId) return `/clients/${n.clientId}`;
  return null;
}
