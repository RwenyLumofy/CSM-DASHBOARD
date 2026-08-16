import { notFound } from "next/navigation";
import { Revised } from "./Revised";

/* Prototype — two proposed changes to Expansion, side by side with what is
   live: a read-only board card, and a stage dropdown in place of the rail.

   Lives inside app/(app) so it renders in the real shell against the real
   navigation, which is where density judgements actually get made. Reads
   nothing, writes nothing; the guard keeps it out of any deployment. */

export const metadata = { title: "Prototype · Expansion revisions" };

export default function ScratchExpansionRevisedPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Revised />;
}
