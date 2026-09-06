import { notFound } from "next/navigation";
import { NotesPreview } from "./NotesPreview";

/* =========================================================================
   Dev preview — the proposed Notes tab, against Gathern's real meetings.

   WHY THIS EXISTS. The Notes tab needs a Clerk session and a client id, so
   there is no way to look at a redesign of it locally. This page renders the
   PROPOSED shape against data read once from the production clone, so the
   meeting titles, dates and outcomes are the real ones rather than invented.

   It is a design preview, NOT the shipping component: nothing here is wired
   to lib/notes/* and no proposed column exists in the schema yet. The spec is
   docs/specs/notes/notes-attach-to-what-they-are-about-and-become-tasks.md.

   Tracked rather than gitignored, for the same reason as app/scratch-tasks:
   Tailwind v4 skips gitignored paths when detecting sources, so an ignored
   preview renders with a partial stylesheet and lies about how it looks. It
   reads no data at request time and the guard below keeps it off deployments.
   ========================================================================= */

export const metadata = { title: "Preview · Notes redesign" };

export default function ScratchNotesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <NotesPreview />;
}
