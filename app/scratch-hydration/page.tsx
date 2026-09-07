/* DEV-ONLY hydration harness for the timezone / now-relative date audit.

   Deliberately a SERVER component, because the whole point is to get a real
   SSR pass in front of the client components below — the same shape as the
   production pages that render them (a "use client" island rendered from an
   async server page). A "use client" harness would prove nothing.

   Every fixture below is a FIXED string, never new Date(), so the server pass
   and the browser pass are fed byte-identical input and any difference in the
   rendered output is the formatter's doing, not the fixture's.

   The dates are chosen to sit on the wrong side of a day boundary for a
   server running east of UTC (this machine is +03) — 2026-09-30T22:00:00Z is
   "30 Sep" in UTC and "1 Oct" locally. So a formatter that has NOT pinned its
   timezone renders "1 Oct" here and "30 Sep" on Vercel; a pinned one renders
   "30 Sep" in both places. That makes the fix visible on a dev server without
   having to run one in UTC.

   Reachable only in development (devOnly below), and it touches no database,
   no Clerk session and no server action — the buttons are inert. */

import { notFound } from "next/navigation";
import type { Notification } from "@/lib/types";
import type { PulseQueueItem } from "@/lib/health/pulse-queue";
import { InboxList } from "@/components/inbox/InboxList";
import { SyncManager } from "@/components/settings/SyncManager";
import { PulseQueue } from "@/components/pulse/PulseQueue";
import { formatDate } from "@/lib/format";

function devOnly() {
  if (process.env.NODE_ENV !== "development") notFound();
}

/** 22:00Z — the previous day in UTC, the next day anywhere east of +02. */
const BOUNDARY = "2026-09-30T22:00:00Z";
/** Midnight-Z, the shape a date-only column takes in a timestamptz. */
const MIDNIGHT_Z = "2026-10-01T00:00:00Z";

const note = (id: string, title: string, createdAt: string, status: "open" | "done"): Notification => ({
  id,
  recipientEmail: "dev@example.com",
  type: "client_assigned",
  title,
  body: "Fixture row — no database behind it.",
  clientId: null,
  entityType: null,
  entityId: null,
  status,
  readAt: null,
  dueDate: null,
  createdByEmail: null,
  createdAt,
});

const OPEN: Notification[] = [
  note("h1", "Now-relative age, gated on mount", BOUNDARY, "open"),
  note("h2", "Second row, same treatment", "2026-09-06T06:15:00Z", "open"),
];
const DONE: Notification[] = [note("h3", "Resolved row", "2026-09-01T09:00:00Z", "done")];

const PULSE: PulseQueueItem[] = [
  {
    clientId: "h-a", name: "Boundary Renewal Co", logoUrl: null, arr: 120_000,
    renewalDate: MIDNIGHT_Z, ownerName: "Dev", ownerEmail: "dev@example.com",
    status: "active", state: "missing", ageDays: null, overdueDays: 0, pulse: null,
  },
  {
    clientId: "h-b", name: "Late Evening Ltd", logoUrl: null, arr: 90_000,
    renewalDate: BOUNDARY, ownerName: "Dev", ownerEmail: "dev@example.com",
    status: "active", state: "missing", ageDays: null, overdueDays: 0, pulse: null,
  },
];

export default async function ScratchHydration() {
  devOnly();
  return (
    <div className="flex flex-col gap-8 p-8">
      <header>
        <h1 className="font-display text-[20px] font-semibold text-fg">Hydration harness</h1>
        <p className="mt-1 font-body text-[13px] text-fg-muted">
          Server-rendered page, client islands below. Open the console: a clean console is the pass condition.
        </p>
      </header>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-fg">1 · formatDate (timezone-pinned)</h2>
        <p className="font-body text-[13px] text-fg-muted">
          <code data-probe="fmt-boundary">{formatDate(BOUNDARY)}</code> from {BOUNDARY} —{" "}
          <code data-probe="fmt-midnight">{formatDate(MIDNIGHT_Z)}</code> from {MIDNIGHT_Z}
        </p>
        <p className="mt-1 font-body text-[12px] text-fg-subtle">
          Expected: 30 Sep 2026 and 1 Oct 2026, on any server in any zone.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-fg">2 · SyncManager — relativeTime, mount-gated</h2>
        <SyncManager
          isSuperAdmin={false}
          initialLastSyncedAt={BOUNDARY}
          hubspotConfigured
          databaseConfigured
        />
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-fg">3 · InboxList — formatDistanceToNow, mount-gated</h2>
        <InboxList open={OPEN} done={DONE} />
      </section>

      <section>
        <h2 className="mb-2 font-display text-sm font-semibold text-fg">4 · PulseQueue — monthYear, timezone-pinned</h2>
        <PulseQueue items={PULSE} counts={{ missing: 2, stale: 0, dueSoon: 0, total: 2, covered: 0, eligible: 2 }} />
        <p className="mt-1 font-body text-[12px] text-fg-subtle">Expected: both renewals read Oct 2026 / Sep 2026 by their UTC day.</p>
      </section>
    </div>
  );
}
