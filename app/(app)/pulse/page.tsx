import { PulseQueue } from "@/components/pulse/PulseQueue";
import { getPulseQueue } from "@/lib/health/pulse-queue";

export const metadata = { title: "Pulse · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Pulse — the capture-first worklist. getPulseQueue() is built on getClients(),
 * which is already role-scoped, so admins see the whole book and CSMs see only
 * their own accounts. Each row links into the account profile (#pulse) where the
 * pulse is recorded in context.
 */
export default async function PulsePage() {
  const queue = await getPulseQueue();
  return (
    <div className="flex flex-col gap-6 p-8">
      <PulseQueue items={queue.items} counts={queue.counts} />
    </div>
  );
}
