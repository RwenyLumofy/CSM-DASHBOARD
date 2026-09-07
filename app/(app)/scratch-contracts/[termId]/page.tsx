import { notFound } from "next/navigation";
import { TermView } from "./TermView";
import { termById } from "../data";

/* Prototype — one Term on its own route (decision 7: terms are addressable). */

export const metadata = { title: "Prototype · Term" };

export default async function ScratchTermPage({ params }: { params: Promise<{ termId: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { termId } = await params;
  const term = termById(termId);
  if (!term) notFound();
  return <TermView term={term} />;
}
