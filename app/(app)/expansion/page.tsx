import { notFound } from "next/navigation";
import { Expansion } from "./Expansion";
import { getExpansionBoard, viewerCanSeeExpansion } from "@/lib/expansion/read";

/* =========================================================================
   Expansion — a simple expansion CRM for existing clients.

   Account → Opportunity, three active stages plus Closed, three closed
   outcomes. The promise: no credible expansion motion should be invisible,
   ownerless, or without a next step.

   Spec: docs/specs/revenue/expansion-opportunities-specification.md
   The approved prototype it was built from is at /scratch-expansion.

   Access: guests have NO access to this feature (lib/expansion/access.ts).
   Read scoping lives in lib/expansion/read.ts (an opportunity is visible
   exactly when its account is); write gates live in ./actions.ts.
   ========================================================================= */

export const metadata = { title: "Expansion · Signal" };

/** The board reflects writes immediately, so it must never be statically cached. */
export const dynamic = "force-dynamic";

export default async function ExpansionPage() {
  /* Guests have no access to Expansion — not read-only, none.

     A 404 rather than a "you don't have permission" page, for the same reason
     `denyClientWrite` makes absent and invisible indistinguishable: someone who
     cannot see the feature should not learn that it exists.

     This is the SECOND lock, not the only one. getExpansionBoard() refuses a
     guest before it reads a single opportunity, so even a surface that forgets
     this check gets nothing back. */
  if (!(await viewerCanSeeExpansion())) notFound();

  const data = await getExpansionBoard();
  return <Expansion data={data} />;
}
