import { notFound } from "next/navigation";
import { TodayQueuePreview } from "./TodayQueuePreview";

/* Prototype — which project tasks reach the Today board.
   Renders lib/work/today-rule.ts (unit-tested) against sample data, with an
   editable "today" so date boundaries can be checked by hand. Reads no data. */

export const metadata = { title: "Prototype · Project tasks on Today" };

export default function ScratchWorkTodayPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TodayQueuePreview />;
}
