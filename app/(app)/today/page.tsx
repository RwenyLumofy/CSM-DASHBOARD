import { TodayWorkspace } from "@/components/today/TodayWorkspace";
import { buildTodaySnapshot } from "@/lib/today/build";
import { getPulseQueue, toPulseDueSummary } from "@/lib/health/pulse-queue";

export const metadata = { title: "Today · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Today — the CSM operating homepage. The snapshot is built server-side from
 * REAL, permission-scoped data (getClients() is already role-scoped, so admins
 * see the whole book and CSMs see only their own accounts). The client
 * TodayWorkspace reads everything through the repo initialised from it.
 * The pulse-due summary rides alongside it so Today can nudge the CSM to record
 * any missing/lapsed pulses (getPulseQueue() is role-scoped the same way).
 */
export default async function TodayPage() {
  const [snapshot, pulseQueue] = await Promise.all([buildTodaySnapshot(), getPulseQueue()]);
  return <TodayWorkspace snapshot={snapshot} pulseDue={toPulseDueSummary(pulseQueue)} />;
}
