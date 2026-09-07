import { notFound } from "next/navigation";
import { WorkPreview } from "./WorkPreview";

/* =========================================================================
   Prototype — the unified Work experience (Projects + Tasks).

   WHY THIS EXISTS. The direction is to replace the Project Management tab
   with a Work tab holding both projects and tasks, and to add a global Work
   page for managers. That is a large change to argue about in a document, so
   it is argued about here instead, against sample data, before any schema is
   agreed.

   Tracked rather than gitignored, deliberately: Tailwind v4's automatic source
   detection skips gitignored paths, so an ignored preview route renders with a
   partial stylesheet and lies about how the real thing looks. It reads no data
   — nothing here touches the database or a permission gate — and the guard
   below keeps it off any deployment.
   ========================================================================= */

export const metadata = { title: "Prototype · Work" };

export default function ScratchWorkPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WorkPreview />;
}
