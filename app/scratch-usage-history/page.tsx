import { notFound } from "next/navigation";
import { UsageHistory } from "./History";

export const metadata = { title: "Mockup · Usage history and patterns" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UsageHistory />;
}
