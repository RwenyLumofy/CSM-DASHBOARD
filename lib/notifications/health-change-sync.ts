/* =========================================================================
   Health tier change notifications.

   WHAT FIRES. An account crossing from one health tier to another during the
   DAILY recompute — "Almarai dropped from Healthy to At risk". Nothing else.

   WHY TIERS AND NOT SCORES. The score moves a little every day: usage ticks,
   a ticket closes, the momentum term re-bases. Notifying on score would put a
   row in every CSM's list for every account every morning, which is the fastest
   possible way to teach people to ignore this page. The tier is what the model,
   the dial, the filters and the escalation rules all act on, so a tier move is
   the point at which something actually changed about the account.

   WHY ONLY THE CRON. recomputeAllClientHealth also runs when a super-admin
   saves a new formula in Settings → Client health. That sweep can move dozens
   of accounts at once — but the MODEL changed, not the accounts, and nobody
   should wake up to forty alerts about work nobody did. Only
   app/api/cron/client-health passes its transitions here; the Settings actions
   drop theirs on the floor deliberately.

   WHY NOTHING IS RESOLVED. The profile-completeness sync resolves its old rows
   because "this profile is incomplete" is a standing condition that stops being
   true. A tier change is an EVENT: it happened on a given day, and it stays
   having happened. Superseding it tomorrow would erase the history the
   notifications centre exists to hold.
   ========================================================================= */

import "server-only";
import type { HealthTierTransition } from "@/lib/repo/drizzle";
import { describeTransition } from "./health-change-phrasing";

export interface HealthChangeSyncSummary {
  transitions: number;
  /** Moves we could not address — the account has no CSM assigned. */
  unowned: number;
  notificationsSent: number;
  durationMs: number;
}

/**
 * Write one notification per tier move to the account's CSM.
 *
 * Addressed to the owner only. A super-admin copy was considered and left out:
 * on a portfolio of any size that is the same mail every morning about accounts
 * they are not working, and the Insights pages already show tier movement
 * across the book far better than a list of individual alerts would.
 */
export async function syncHealthChangeNotifications(
  transitions: HealthTierTransition[],
  now: Date = new Date(),
): Promise<HealthChangeSyncSummary> {
  const start = Date.now();
  const summary: HealthChangeSyncSummary = {
    transitions: transitions.length,
    unowned: 0,
    notificationsSent: 0,
    durationMs: 0,
  };
  if (transitions.length === 0) {
    summary.durationMs = Date.now() - start;
    return summary;
  }

  const { insertNotificationsDb } = await import("@/lib/repo/drizzle");
  const { withDbTimeout } = await import("@/lib/db/client");

  const todayKey = now.toISOString().slice(0, 10);
  const rows: Parameters<typeof insertNotificationsDb>[0] = [];

  for (const t of transitions) {
    if (!t.csmEmail) {
      summary.unowned += 1;
      continue;
    }
    const { title, body } = describeTransition(t);
    rows.push({
      // Date-keyed, and insertNotificationsDb is onConflictDoNothing: a cron
      // re-triggered by hand on the same day cannot double-notify. (A second
      // sweep would find no transition anyway, since the first one already
      // wrote the new tier — this is the belt to that's braces.)
      id: `hc-${t.clientId}-${t.csmEmail}-${todayKey}`,
      recipientEmail: t.csmEmail,
      type: "health_changed",
      title,
      body,
      clientId: t.clientId,
    });
  }

  await withDbTimeout(insertNotificationsDb(rows));
  summary.notificationsSent = rows.length;
  summary.durationMs = Date.now() - start;
  return summary;
}
