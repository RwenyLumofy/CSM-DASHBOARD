import { notFound } from "next/navigation";
import { Expansion } from "./Expansion";

/* =========================================================================
   Prototype — Expansion.

   Lives INSIDE app/(app) deliberately, so it renders in the real shell with
   the sidebar and header present. Reviewing an operational page on a bare
   canvas hides exactly the problems that matter — available width, density
   against the nav, and how the drawer sits over the app.

   Reads nothing and writes nothing: all data is sample data in ./data.ts and
   every control is inert. The guard below keeps it out of any deployment.

   Spec: docs/specs/revenue/expansion-missions-specification.md
   ========================================================================= */

export const metadata = { title: "Prototype · Expansion" };

export default function ScratchExpansionPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Expansion />;
}
