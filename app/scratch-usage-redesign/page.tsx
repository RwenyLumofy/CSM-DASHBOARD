import { notFound } from "next/navigation";
import { UsageRedesignMockups } from "./Mockups";

/* Static mockups for the Usage tab redesign. Rendered inside the real app so
   the design tokens, fonts and dark mode are the product's, not an
   approximation of them. Dev only. */
export const metadata = { title: "Mockup · Usage tab redesign" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UsageRedesignMockups />;
}
