import { notFound } from "next/navigation";
import { TaskDetailPreview } from "./TaskDetailPreview";

/* =========================================================================
   Dev preview — the shared task detail, in both contexts it ships into.

   WHY THIS EXISTS. Editing a task needs a Clerk session and a local
   environment has none, so there is no way to look at this before deploying.
   This page renders the SHIPPING component against sample data.

   Tracked rather than gitignored, deliberately: Tailwind v4's automatic
   source detection skips gitignored paths, so an ignored preview route
   renders with a partial stylesheet and lies about how the real thing looks.
   It reads no data — nothing here touches the database or a permission gate —
   and the guard below keeps it off any deployment.
   ========================================================================= */

export const metadata = { title: "Preview · Task detail" };

export default function ScratchTaskDetailPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TaskDetailPreview />;
}
