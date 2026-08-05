import { notFound } from "next/navigation";
import { HealthCardPreview } from "./HealthCardPreview";

/* Dev preview — the profile's Health signals card against Bank of Bahrain's
   real production readings. The profile needs a session; this does not. */
export const metadata = { title: "Preview · Health signals" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HealthCardPreview />;
}
