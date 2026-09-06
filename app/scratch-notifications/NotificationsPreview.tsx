"use client";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { NotificationsCentre } from "@/components/notifications/NotificationsCentre";
import type { Notification, NotificationType } from "@/lib/types";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function n(
  id: string,
  type: NotificationType,
  title: string,
  body: string | null,
  agoMs: number,
  extra: Partial<Notification> = {},
): Notification {
  return {
    id,
    recipientEmail: "preview@lumofy.ai",
    type,
    title,
    body,
    clientId: null,
    entityType: null,
    entityId: null,
    status: "open",
    readAt: null,
    dueDate: null,
    createdByEmail: null,
    createdAt: new Date(Date.now() - agoMs).toISOString(),
    ...extra,
  };
}

/* One of every type, spread across the day buckets, with a mix of read and
   unread and of rows that do and don't have somewhere to go. */
const ITEMS: Notification[] = [
  n("n1", "task_mentioned", "Rana mentioned you on “Renewal deck for Almarai”", "“@you can you confirm the seat count before Thursday?”", 2 * HOUR, { clientId: "c-almarai", entityType: "task", entityId: "tdt-1" }),
  n("n2", "assignment_needs_admin", "Two candidates for Saudia Cargo — pick an owner", "Auto-assignment found a tie. No owner is set until someone chooses.", 5 * HOUR, { clientId: "c-saudia" }),
  n("n3", "client_assigned", "Bupa Arabia was assigned to you", "Moved from Khalid A. during the territory rebalance.", 9 * HOUR, { clientId: "c-bupa", readAt: new Date(Date.now() - 8 * HOUR).toISOString() }),
  n("n3b", "health_changed", "Almarai dropped to At risk", "Health tier changed from Healthy to At risk. Score 74 → 58.", 11 * HOUR, { clientId: "c-almarai" }),
  n("n4", "task_assigned", "New task: prepare QBR agenda", "Due Friday. No account linked.", 26 * HOUR, { entityType: "task", entityId: "tdt-2" }),
  n("n5", "profile_incomplete_red", "STC Solutions is missing must-have fields", "No executive sponsor and no renewal date. Both block the health score.", 30 * HOUR, { clientId: "c-stc" }),
  n("n6", "task_update", "Omar posted an update on “Onboarding checklist — Nahdi”", "“Kickoff moved to the 14th, rest of the plan holds.”", 3 * DAY, { clientId: "c-nahdi", entityType: "task", entityId: "tdt-3", readAt: new Date(Date.now() - 2 * DAY).toISOString() }),
  n("n7", "assignment_review", "Tamimi Group was auto-assigned to Layla", "Review or override within 7 days.", 4 * DAY, { clientId: "c-tamimi", readAt: new Date(Date.now() - 4 * DAY).toISOString() }),
  n("n8", "profile_incomplete_yellow", "Riyadh Air is missing nice-to-have fields", "No industry tag, no stakeholder map.", 6 * DAY, { clientId: "c-riyadhair", readAt: new Date(Date.now() - 5 * DAY).toISOString() }),
  n("n8b", "health_changed", "Nahdi improved to Healthy", "Health tier changed from At risk to Healthy. Score 61 → 78.", 8 * DAY, { clientId: "c-nahdi", readAt: new Date(Date.now() - 7 * DAY).toISOString() }),
  n("n9", "system", "Nightly HubSpot sync completed", "412 accounts refreshed.", 12 * DAY, { readAt: new Date(Date.now() - 11 * DAY).toISOString() }),
  n("n10", "system", "Health model weights were updated", null, 20 * DAY, { readAt: new Date(Date.now() - 19 * DAY).toISOString() }),
];

export function NotificationsPreview() {
  const unread = ITEMS.filter((i) => !i.readAt).length;
  return (
    /* Wrapped in the real AppShell so the preview shows the sidebar entry and
       its unread badge, not just the page body. authEnabled={false} keeps
       Clerk's UserButton out — this environment has no session.

       The nav entry will NOT render as active here: Sidebar decides that from
       usePathname(), and this preview lives at /scratch-notifications. Visit
       /notifications for the highlighted state. */
    <AppShell authEnabled={false} roleLabel="Super admin" notifications={ITEMS} unreadCount={unread}>
      <div className="flex flex-col gap-8 p-8">
        <PageHeader
          title="Notifications"
          description="Everything addressed to you — account assignments, task mentions and updates, health tier changes, profile nudges. Filter by kind, or narrow to what you haven't read."
        />
        <div className="max-w-3xl">
          {/* hasMore false: the fixture is the whole history, and the paging
              action needs a session this environment does not have. */}
          <NotificationsCentre initialItems={ITEMS} initialHasMore={false} initialUnread={unread} />
        </div>
      </div>
    </AppShell>
  );
}
