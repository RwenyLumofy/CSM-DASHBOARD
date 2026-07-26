"use client";

/* =========================================================================
   Today-page nudge — reminds the CSM that some of their accounts need a CS
   Pulse this month. Quick-links the most urgent accounts (into the profile,
   #pulse) and routes to the full /pulse worklist. Renders nothing when nothing
   is due, so it disappears the moment the book is covered.
   ========================================================================= */

import Link from "next/link";
import { HeartPulse, ChevronRight } from "lucide-react";
import type { PulseDueSummary } from "@/lib/health/pulse-queue";

export function PulseDueBanner({ summary }: { summary: PulseDueSummary }) {
  const { total, missing, stale, dueSoon, top } = summary;
  if (total <= 0) return null;

  const parts = [
    missing ? `${missing} never assessed` : null,
    stale ? `${stale} lapsed` : null,
    dueSoon ? `${dueSoon} due soon` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-[#C99A14]/30 bg-[#C99A14]/8 px-5 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#C99A14]/15 text-[#8A6D12]"><HeartPulse size={17} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-[13.5px] font-semibold text-fg">
          {total} {total === 1 ? "account needs" : "accounts need"} a CS Pulse
        </p>
        <p className="font-body text-[12px] text-fg-muted">{parts} — record your monthly read to keep them scored.</p>
      </div>

      {/* quick-links to the most urgent accounts */}
      <div className="hidden items-center gap-1.5 md:flex">
        {top.map((t) => (
          <Link key={t.clientId} href={`/clients/${t.clientId}#pulse`}
            className="max-w-[140px] truncate rounded-lg border border-border bg-surface px-2.5 py-1 font-body text-[12px] font-medium text-fg transition-colors hover:border-border-strong hover:text-sirius">
            {t.name}
          </Link>
        ))}
      </div>

      <Link href="/pulse"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sirius px-3.5 py-1.5 font-body text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90">
        Review pulses <ChevronRight size={14} className="-mr-1" />
      </Link>
    </div>
  );
}
