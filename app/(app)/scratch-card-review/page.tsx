import { notFound } from "next/navigation";
import { CardReview } from "./CardReview";

/* Prototype — the card refinement, reviewed: baseline vs revised, anatomy,
   all ten states, and the interaction states. */

export const metadata = { title: "Prototype · Card review" };

export default function ScratchCardReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CardReview />;
}
