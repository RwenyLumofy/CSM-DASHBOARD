import { PulseQueue } from "@/components/pulse/PulseQueue";
import { getPulseQueue } from "@/lib/health/pulse-queue";

export const metadata = { title: "Pulse · Insights · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Insights → Pulse — the CS Pulse worklist. A subpage of Insights (sibling of
 * Health and Churn), not a top-level destination: it answers "which of my
 * accounts need a read this month?". getPulseQueue() is built on getClients(),
 * which is already role-scoped, so admins see the whole book and CSMs see only
 * their own. Each row links into the account profile (#pulse) to capture in
 * context. The Insights layout supplies the outer padding + "Insights" heading.
 */
export default async function InsightsPulsePage() {
  const queue = await getPulseQueue();
  return <PulseQueue items={queue.items} counts={queue.counts} />;
}
