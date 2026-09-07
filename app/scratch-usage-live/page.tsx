import { notFound } from "next/navigation";
import { LiveUsagePreview } from "./Preview";

/* The PRODUCTION Usage tab, rendered against fixture data. Development-only.
   Nothing here reaches a database and UsageTab's behaviour is unchanged. */
export const metadata = { title: "Live Usage tab · fixture" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LiveUsagePreview />;
}
