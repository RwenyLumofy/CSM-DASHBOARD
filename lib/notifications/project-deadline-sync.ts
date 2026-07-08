/* =========================================================================
   Daily project/task deadline notifications. For each account, gathers the
   overdue / due-soon projects and tasks (lib/projects/deadlines) and nudges the
   people responsible — the item owners plus the account's CSM — via the
   notifications/action-list table. Aggregated to ONE notification per
   (recipient, client) per day so the bell never floods.

   Mirrors the profile-completeness sync's resolve-and-reinsert cadence: once a
   day, resolve the client's previous deadline notifications and insert today's
   (date-keyed id, so a same-day re-run is skipped). An account with nothing
   overdue/due-soon has any open deadline notifications resolved.
   ========================================================================= */

import "server-only";
import { withDbTimeout } from "@/lib/db/client";
import { computeProjectDeadlines } from "@/lib/projects/deadlines";
import type { ProjectDetail } from "@/lib/projects/types";

export interface ProjectDeadlineSyncSummary {
  clients: number;
  withDeadlines: number;
  notificationsSent: number;
  durationMs: number;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export async function syncProjectDeadlineNotifications(now: Date = new Date()): Promise<ProjectDeadlineSyncSummary> {
  const start = Date.now();
  const { hasDatabase } = await import("@/lib/config");
  if (!hasDatabase()) return { clients: 0, withDeadlines: 0, notificationsSent: 0, durationMs: 0 };

  const { getClientsFromDb, resolveNotificationsForClientDb, insertNotificationsDb, getLatestNotificationDateByType } = await import("@/lib/repo/drizzle");
  const { getAllProjectBoards } = await import("@/lib/repo/projects");
  const { getProjectConfig } = await import("@/lib/projects/data");

  const [clients, boardsByClient, config, lastSent] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    getAllProjectBoards().catch(() => new Map<string, ProjectDetail[]>()),
    getProjectConfig(),
    withDbTimeout(getLatestNotificationDateByType("project_deadline")),
  ]);

  const todayKey = now.toISOString().slice(0, 10);
  const toInsert: Parameters<typeof insertNotificationsDb>[0] = [];
  const resolveTasks: Promise<void>[] = [];
  let withDeadlines = 0;

  for (const client of clients) {
    const items = computeProjectDeadlines(boardsByClient.get(client.id) ?? [], config, now);

    if (items.length === 0) {
      // Nothing due — clear any stale open deadline notifications for this account.
      resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["project_deadline"])));
      continue;
    }
    withDeadlines++;

    // Skip if we already notified today (avoids resolve-then-no-op-reinsert).
    const already = lastSent.get(client.id);
    if (already && isSameUtcDay(already, now)) continue;

    const recipients = new Set<string>();
    if (client.csm?.email) recipients.add(client.csm.email.toLowerCase());
    for (const i of items) if (i.ownerEmail) recipients.add(i.ownerEmail.toLowerCase());
    if (recipients.size === 0) continue;

    // Refresh: clear yesterday's, then insert today's current summary.
    resolveTasks.push(withDbTimeout(resolveNotificationsForClientDb(client.id, ["project_deadline"])));
    const overdue = items.filter((i) => i.state === "overdue").length;
    const dueSoon = items.filter((i) => i.state === "due_soon").length;
    const earliest = items.map((i) => i.deliveryDate).sort()[0] ?? null;
    const parts: string[] = [];
    if (overdue) parts.push(`${overdue} overdue`);
    if (dueSoon) parts.push(`${dueSoon} due soon`);
    const summary = parts.join(" · ");

    for (const email of recipients) {
      toInsert.push({
        id: `pd-${client.id}-${email}-${todayKey}`,
        recipientEmail: email,
        type: "project_deadline",
        title: `Project deadlines: ${client.name}`,
        body: `${summary} across ${client.name}'s projects and tasks. Open the account to update dates or mark items done.`,
        clientId: client.id,
        dueDate: earliest ? new Date(earliest) : null,
      });
    }
  }

  await Promise.all(resolveTasks);
  await withDbTimeout(insertNotificationsDb(toInsert));
  return { clients: clients.length, withDeadlines, notificationsSent: toInsert.length, durationMs: Date.now() - start };
}
