import { notFound } from "next/navigation";
import { DealCardRedesign } from "./DealCardRedesign";

/* Prototype — the deal card in Contracts & deals, redesigned.
   Argument: the handoff artifact "Contracts & Deals Uplift". */

export const metadata = { title: "Prototype · Deal card" };

export default function ScratchDealCardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DealCardRedesign />;
}
