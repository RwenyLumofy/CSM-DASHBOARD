import { notFound } from "next/navigation";
import { UsageInsights } from "../scratch-usage-redesign/Insights";

/* The three insight blocks, on their own route so they can be looked at
   without scrolling past the earlier version. Dev only. */
export const metadata = { title: "Mockup · Usage insights" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UsageInsights />;
}
