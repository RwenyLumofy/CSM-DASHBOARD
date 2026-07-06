/* =========================================================================
   Daily profile-completeness sweep — flags accounts missing key deal/client
   data (see lib/profile-completeness.ts) and keeps CSMs (and super-admins,
   for the urgent tier) nudged via the notifications/action-list table.

   Cadence (driven by the daily /api/cron/profile-completeness, see
   vercel.json): red is refreshed once per day for as long as it's red;
   yellow is refreshed only every ~3 days, and only once an account has no
   red gaps left (an already-red account isn't also nagged about yellow).
   An account with no gaps has any open items resolved.

   "Refreshed" = resolve any previously-open item of that severity for the
   client, then insert today's (date-keyed id, so a same-day re-run is a
   no-op via onConflictDoNothing) — this keeps exactly one open item per
   client per severity, always showing the CURRENT missing-field list.
   ========================================================================= */

import "server-only";
import type { Deal } from "@/lib/types";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { dealOverridesMap, applyDealOverrides, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { withDbTimeout } from "@/lib/db/client";

const YELLOW_REPEAT_DAYS = 3;

export interface ProfileCompletenessSyncSummary {
  total: number;
  red: number;
  yellow: number;
  complete: number;
  notificationsSent: number;
  durationMs: number;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function syncProfileCompletenessNotifications(now: Date = new Date()): Promise<ProfileCompletenessSyncSummary> {
  const start = Date.now();
  const { getClientsFromDb, getAllDealsFromDb, getLatestNotificationDateByType, resolveNotificationsForClientDb, insertNotificationsDb } =
    await import("@/lib/repo/drizzle");
  const { getSuperAdminEmails } = await import("@/lib/data");

  const [clients, allDeals, superAdmins, lastRed, lastYellow] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    withDbTimeout(getAllDealsFromDb()),
    getSuperAdminEmails(),
    withDbTimeout(getLatestNotificationDateByType("profile_incomplete_red")),
    withDbTimeout(getLatestNotificationDateByType("profile_incomplete_yellow")),
  ]);

  const dealsByClient = new Map<string, Deal[]>();
  for (const d of allDeals) {
    const arr = dealsByClient.get(d.clientId);
    if (arr) arr.push(d);
    else dealsByClient.set(d.clientId, [d]);
  }

  const todayKey = now.toISOString().slice(0, 10);
  const toInsert: Parameters<typeof insertNotificationsDb>[0] = [];
  const resolveTasks: Promise<void>[] = [];
  const summary: ProfileCompletenessSyncSummary = { total: clients.length, red: 0, yellow: 0, complete: 0, notificationsSent: 0, durationMs: 0 };

  for (const client of clients) {
    const overrides = dealOverridesMap(client.properties);
    const dealDates = ((client.properties?.[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {});
    const tracked = (dealsByClient.get(client.id) ?? [])
      .filter((d) => d.tracked !== false)
      .map((d) => applyDealOverrides(d, overrides[d.id]));

    const { severity, missingRed, missingYellow } = computeProfileCompleteness(client, tracked, dealDates);

    if (severity === "red") {
      summary.red++;
      resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["profile_incomplete_yellow"])));
      const already = lastRed.get(client.id);
      if (!already || !isSameUtcDay(already, now)) {
        resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["profile_incomplete_red"])));
        const recipients = new Set([client.csm?.email, ...superAdmins].filter((e): e is string => !!e));
        const missingList = missingRed.map((f) => f.label).join(", ");
        for (const email of recipients) {
          toInsert.push({
            id: `pi-red-${client.id}-${email}-${todayKey}`,
            recipientEmail: email,
            type: "profile_incomplete_red",
            title: `Incomplete profile: ${client.name}`,
            body: `Missing required info: ${missingList}. Fill these in on the deal card / client profile.`,
            clientId: client.id,
          });
        }
      }
    } else if (severity === "yellow") {
      summary.yellow++;
      resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["profile_incomplete_red"])));
      const already = lastYellow.get(client.id);
      const stale = !already || now.getTime() - already.getTime() >= YELLOW_REPEAT_DAYS * 86_400_000;
      if (stale && client.csm?.email) {
        resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["profile_incomplete_yellow"])));
        const missingList = missingYellow.map((f) => f.label).join(", ");
        toInsert.push({
          id: `pi-yellow-${client.id}-${todayKey}`,
          recipientEmail: client.csm.email,
          type: "profile_incomplete_yellow",
          title: `Nice to have: ${client.name}`,
          body: `Filling in ${missingList} will enhance this account's profile.`,
          clientId: client.id,
        });
      }
    } else {
      summary.complete++;
      resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["profile_incomplete_red", "profile_incomplete_yellow"])));
    }
  }

  await Promise.all(resolveTasks);
  await withDbTimeout(insertNotificationsDb(toInsert));
  summary.notificationsSent = toInsert.length;
  summary.durationMs = Date.now() - start;
  return summary;
}
