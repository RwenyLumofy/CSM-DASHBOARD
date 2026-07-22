import { TodayWorkspace } from "@/components/today/TodayWorkspace";
import { buildTodaySnapshot } from "@/lib/today/build";

// Temporary public harness (the real /today sits behind the Clerk auth wall).
// Unauthenticated here → buildTodaySnapshot falls back to the mock snapshot.
// Removed before commit.
export default async function ScratchWf() {
  const snapshot = await buildTodaySnapshot();
  return <TodayWorkspace snapshot={snapshot} />;
}
