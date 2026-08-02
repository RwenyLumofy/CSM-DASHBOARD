import { notFound } from "next/navigation";
import { TasksPreview } from "./TasksPreview";

/* =========================================================================
   Dev preview — task updates, mentions, and the reworked notification rows.

   WHY THIS EXISTS. Reading or posting a task thread needs a Clerk session,
   and a local environment has none, so there was no way to look at any of
   this before deploying it. This page renders the SHIPPING components against
   sample data.

   Tracked rather than gitignored, deliberately: Tailwind v4's automatic source
   detection skips gitignored paths, so an ignored preview route renders with a
   partial stylesheet and lies about how the real thing looks. It reads no
   data — nothing here touches the database or a permission gate — and the
   guard below keeps it off any deployment.
   ========================================================================= */

export const metadata = { title: "Preview · Task updates" };

export default function ScratchTasksPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TasksPreview />;
}
