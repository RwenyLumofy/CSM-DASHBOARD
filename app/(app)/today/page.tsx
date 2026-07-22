import { TodayWorkspace } from "@/components/today/TodayWorkspace";
import { buildTodaySnapshot } from "@/lib/today/build";

export const metadata = { title: "Today · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Today — the CSM operating homepage. The snapshot is built server-side from
 * REAL, permission-scoped data (getClients() is already role-scoped, so admins
 * see the whole book and CSMs see only their own accounts). The client
 * TodayWorkspace reads everything through the repo initialised from it.
 */
export default async function TodayPage() {
  const snapshot = await buildTodaySnapshot();
  return <TodayWorkspace snapshot={snapshot} />;
}
