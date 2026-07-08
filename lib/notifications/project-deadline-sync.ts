/* =========================================================================
   Daily project/task deadline notifications. For each account, gathers the
   overdue / due-soon projects and tasks (lib/projects/deadlines) and nudges the
   people responsible — the item owners plus the account's CSM — via the
   notifications/action-list table. Aggregated to ONE notification per
   (recipient, client) per day so the bell never floods.

   Per-client reconcile, run independently (Promise.allSettled) so one
   client's DB hiccup can't abort the whole sweep:
     - no deadlines  → resolve (close) any open project_deadline rows.
     - has deadlines → resolve any STALE open rows (a prior day's — a
       different date-keyed id) then upsert today's per-recipient row,
       refreshing its content and re-opening it. The upsert (not a plain
       insert) is what makes a same-day re-run safe: today's id may already
       exist and be freshly resolved by the stale-cleanup step a moment
       earlier, and a plain insert would silently no-op on that id (see
       insertNotificationsDb) rather than surface the current deadlines.

   The whole sweep does NOT swallow a board-read failure into "nobody has
   deadlines" — that would mass-resolve real, still-valid notifications on a
   transient DB blip. It throws instead, so the cron's own isolated catch
   reports the failure without touching any notification.
   ========================================================================= */

import "server-only";
import { withDbTimeout } from "@/lib/db/client";
import { computeProjectDeadlines } from "@/lib/projects/deadlines";
import type { ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";
import type { Client } from "@/lib/types";

export interface ProjectDeadlineSyncSummary {
  clients: number;
  withDeadlines: number;
  notificationsSent: number;
  failedClients: number;
  durationMs: number;
}

function todayKeyOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function reconcileClient(
  client: Client,
  board: ProjectDetail[],
  config: ProjectConfig,
  now: Date,
  todayKey: string,
): Promise<{ hadDeadlines: boolean; sent: number }> {
  const { resolveNotificationsForClientDb, upsertOpenNotificationsDb } = await import("@/lib/repo/drizzle");
  const items = computeProjectDeadlines(board, config, now);

  if (items.length === 0) {
    await withDbTimeout(resolveNotificationsForClientDb(client.id, ["project_deadline"]));
    return { hadDeadlines: false, sent: 0 };
  }

  const recipients = new Set<string>();
  if (client.csm?.email) recipients.add(client.csm.email.toLowerCase());
  for (const i of items) if (i.ownerEmail) recipients.add(i.ownerEmail.toLowerCase());
  if (recipients.size === 0) return { hadDeadlines: true, sent: 0 };

  // Clear any prior day's row(s) — a different date-keyed id, so the upsert
  // below can't touch them — before writing today's. Order matters: this must
  // run BEFORE the upsert, since today's own id may already exist (e.g. a
  // same-day retry) and resolving indiscriminately after the upsert would
  // immediately re-close what was just (re)opened.
  await withDbTimeout(resolveNotificationsForClientDb(client.id, ["project_deadline"]));

  const overdue = items.filter((i) => i.state === "overdue").length;
  const dueSoon = items.filter((i) => i.state === "due_soon").length;
  const earliest = items.map((i) => i.deliveryDate).sort()[0] ?? null;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (dueSoon) parts.push(`${dueSoon} due soon`);
  const summary = parts.join(" · ");

  const rows = [...recipients].map((email) => ({
    id: `pd-${client.id}-${email}-${todayKey}`,
    recipientEmail: email,
    type: "project_deadline",
    title: `Project deadlines: ${client.name}`,
    body: `${summary} across ${client.name}'s projects and tasks. Open the account to update dates or mark items done.`,
    clientId: client.id,
    dueDate: earliest ? new Date(earliest) : null,
  }));
  await withDbTimeout(upsertOpenNotificationsDb(rows));
  return { hadDeadlines: true, sent: rows.length };
}

export async function syncProjectDeadlineNotifications(now: Date = new Date()): Promise<ProjectDeadlineSyncSummary> {
  const start = Date.now();
  const { hasDatabase } = await import("@/lib/config");
  if (!hasDatabase()) return { clients: 0, withDeadlines: 0, notificationsSent: 0, failedClients: 0, durationMs: 0 };

  const { getClientsFromDb } = await import("@/lib/repo/drizzle");
  const { getAllProjectBoards } = await import("@/lib/repo/projects");
  const { getProjectConfig } = await import("@/lib/projects/data");

  // Deliberately NOT `.catch(() => new Map())`: a board-read failure must not
  // be mistaken for "no client has any deadlines" — that would mass-resolve
  // every account's real, still-open notifications. Let it throw; the cron's
  // own isolated try/catch around this call reports the failure untouched.
  const [clients, boardsByClient, config] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    getAllProjectBoards(),
    getProjectConfig(),
  ]);

  const todayKey = todayKeyOf(now);
  const results = await Promise.allSettled(
    clients.map((client) => reconcileClient(client, boardsByClient.get(client.id) ?? [], config, now, todayKey)),
  );

  let withDeadlines = 0;
  let notificationsSent = 0;
  let failedClients = 0;
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.hadDeadlines) withDeadlines++;
      notificationsSent += r.value.sent;
    } else {
      failedClients++;
      console.warn("[project-deadline-sync] client reconcile failed:", r.reason);
    }
  }

  return { clients: clients.length, withDeadlines, notificationsSent, failedClients, durationMs: Date.now() - start };
}
