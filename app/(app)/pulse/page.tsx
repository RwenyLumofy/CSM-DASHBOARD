import { PulseQueue } from "@/components/pulse/PulseQueue";
import { getPulseQueue } from "@/lib/health/pulse-queue";
import { getCsPulseTiers } from "@/lib/health/data";

export const metadata = { title: "Pulse · Lumofy Signals" };
export const dynamic = "force-dynamic";

/**
 * Pulse — the capture-first surface. getPulseQueue() is built on getClients(),
 * which is already role-scoped, so admins see the whole book and CSMs see only
 * their own accounts. Tiers come from workspace config so the capture drawer
 * matches the engine exactly.
 */
export default async function PulsePage() {
  const [queue, tiers] = await Promise.all([getPulseQueue(), getCsPulseTiers()]);
  return (
    <div className="flex flex-col gap-6 p-8">
      <PulseQueue items={queue.items} counts={queue.counts} dimensions={queue.dimensions} tiers={tiers} />
    </div>
  );
}
