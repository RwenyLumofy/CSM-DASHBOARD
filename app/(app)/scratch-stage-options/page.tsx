import { notFound } from "next/navigation";
import { StageOptions } from "./StageOptions";

/* Prototype — six ways of showing and changing the stage inside a record. */

export const metadata = { title: "Prototype · Stage movement" };

export default function ScratchStageOptionsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StageOptions />;
}
