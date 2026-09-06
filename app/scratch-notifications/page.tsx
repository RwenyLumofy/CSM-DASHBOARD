import { notFound } from "next/navigation";
import { NotificationsPreview } from "./NotificationsPreview";

/* =========================================================================
   Dev preview — the notifications centre.

   WHY THIS EXISTS. Every row on /notifications is scoped to the signed-in
   user's email, and a local environment has no Clerk session, so the real page
   renders empty here and cannot be looked at before deploying. This renders
   the SHIPPING component against fixture rows.

   Tracked rather than gitignored, deliberately: Tailwind v4's automatic source
   detection skips gitignored paths, so an ignored preview route renders with a
   partial stylesheet and lies about how the real thing looks. It reads no data
   and the guard below keeps it off any deployment.
   ========================================================================= */

export const metadata = { title: "Preview · Notifications" };

export default function ScratchNotificationsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NotificationsPreview />;
}
