import { PageHeader } from "@/components/layout/PageHeader";
import { NotificationsCentre } from "@/components/notifications/NotificationsCentre";
import { getMyNotificationsPage, getMyUnreadCount } from "@/lib/data";

export const metadata = { title: "Notifications · Lumofy Signals" };
export const dynamic = "force-dynamic";

/* =========================================================================
   The notifications centre.

   WHY THIS PAGE EXISTS. The bell holds twelve rows and its "view all" link
   pointed at /inbox — the AI Action list, which is a different thing entirely
   and shows none of these. So the thirteenth notification was unreachable:
   there was no history, no way to find the mention from last Tuesday, and no
   way to see only the assignments.

   This is the reader's own mail, not a team feed. Every row is scoped to the
   signed-in user's email inside lib/data.ts.
   ========================================================================= */
export default async function NotificationsPage() {
  const [page, unread] = await Promise.all([getMyNotificationsPage(), getMyUnreadCount()]);

  return (
    <div className="flex flex-col gap-8 p-8">
      <PageHeader
        title="Notifications"
        description="Everything addressed to you — account assignments, task mentions and updates, health tier changes, profile nudges. Filter by kind, or narrow to what you haven't read."
      />
      <div className="max-w-3xl">
        <NotificationsCentre
          initialItems={page.items}
          initialHasMore={page.hasMore}
          initialUnread={unread}
        />
      </div>
    </div>
  );
}
