import { notFound } from "next/navigation";
import { Contracts } from "./Contracts";

/* Prototype — the Contracts tab.
   Model: the "Contract Term Model" decision record. */

export const metadata = { title: "Prototype · Contracts" };

export default function ScratchContractsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Contracts />;
}
