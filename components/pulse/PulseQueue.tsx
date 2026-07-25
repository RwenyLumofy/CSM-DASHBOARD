"use client";

/* =========================================================================
   "Pulse due" queue — the capture-first WORKLIST for CS Pulse. Lists the
   viewer's accounts whose pulse is missing / lapsed / about to lapse and links
   each into its account profile (#pulse) to record in context — usage, tickets
   and stakeholders in view while the CSM rates. Capture itself lives on the
   profile (CsPulsePanel); this surface is purely discovery + routing.
   ========================================================================= */

import Link from "next/link";
import { HeartPulse, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { PULSE_VALIDITY_DAYS } from "@/lib/health/pulse";
import type { PulseQueueItem } from "@/lib/health/pulse-queue";

const money = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const monthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null);

function stateChip(i: PulseQueueItem): { label: string; cls: string } {
  switch (i.state) {
    case "missing": return { label: "Never assessed", cls: "text-[#B23A57] bg-[#B23A57]/10 border-[#B23A57]/25" };
    case "stale": return { label: `Lapsed ${i.overdueDays}d ago`, cls: "text-[#C2610E] bg-[#C2610E]/10 border-[#C2610E]/25" };
    case "due_soon": {
      const d = PULSE_VALIDITY_DAYS - (i.ageDays ?? PULSE_VALIDITY_DAYS);
      return { label: d <= 0 ? "Due today" : `Due in ${d}d`, cls: "text-[#8A6D12] bg-[#C99A14]/12 border-[#C99A14]/28" };
    }
  }
}

function lastPulsed(i: PulseQueueItem): string {
  if (i.ageDays == null) return "Never pulsed";
  if (i.ageDays === 0) return "Pulsed today";
  return `Pulsed ${i.ageDays}d ago`;
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[18px] font-bold tabular-nums" style={{ color: tone }}>{n}</span>
      <span className="font-body text-[12.5px] text-fg-muted">{label}</span>
    </div>
  );
}

export function PulseQueue({ items, counts }: {
  items: PulseQueueItem[];
  counts: { missing: number; stale: number; dueSoon: number; total: number; covered: number; eligible: number };
}) {
  const coverage = counts.eligible ? Math.round((counts.covered / counts.eligible) * 100) : 0;

  return (
    <>
      <div>
        <h1 className="font-display text-[22px] font-semibold text-fg">CS Pulse</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-fg-muted">
          Your monthly read on each account — stakeholder coverage, engagement, and renewal readiness. A pulse is valid for {PULSE_VALIDITY_DAYS} days; when it lapses the account can’t be scored until you refresh it. Open an account to record its pulse in context.
        </p>
      </div>

      {/* summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
        <Stat n={counts.missing} label="never assessed" tone="#B23A57" />
        <Stat n={counts.stale} label="lapsed" tone="#C2610E" />
        <Stat n={counts.dueSoon} label="due soon" tone="#8A6D12" />
        <div className="ml-auto flex items-center gap-3">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-bg-muted">
            <div className="h-full rounded-full bg-[#1F9D63] transition-all" style={{ width: `${coverage}%` }} />
          </div>
          <span className="font-body text-[12.5px] font-medium text-fg-muted tabular-nums">{counts.covered}/{counts.eligible} covered</span>
        </div>
      </div>

      {/* queue */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-sm">
          <span className="grid size-11 place-items-center rounded-full bg-[#1F9D63]/12 text-[#1F9D63]"><CheckCircle2 size={22} /></span>
          <p className="font-display text-[15px] font-semibold text-fg">
            {counts.eligible === 0 ? "No active accounts yet" : "All caught up"}
          </p>
          <p className="max-w-sm font-body text-[13px] text-fg-muted">
            {counts.eligible === 0
              ? "Once accounts move past onboarding they’ll show up here for their monthly pulse."
              : "Every active account has a fresh pulse. Check back as they approach their 30-day window."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {items.map((i, idx) => {
            const chip = stateChip(i);
            const renew = monthYear(i.renewalDate);
            return (
              <Link
                key={i.clientId}
                href={`/clients/${i.clientId}#pulse`}
                className={cn("group flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-bg-muted/40", idx > 0 && "border-t border-border-subtle")}
              >
                {/* avatar */}
                {i.logoUrl ? (
                  <img src={i.logoUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft font-display text-[13px] font-bold text-sirius">{i.name.charAt(0).toUpperCase()}</span>
                )}

                {/* name + owner */}
                <div className="min-w-0 flex-1">
                  <span className="font-body text-[14px] font-semibold text-fg group-hover:text-sirius">{i.name}</span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-body text-[12px] text-fg-subtle">
                    <span>{i.ownerName ?? "Unassigned"}</span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{i.status}</span>
                    {renew && (<><span aria-hidden>·</span><span>Renews {renew}</span></>)}
                    {i.arr > 0 && (<><span aria-hidden>·</span><span>{money(i.arr)} ARR</span></>)}
                  </div>
                </div>

                {/* freshness + state */}
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 font-body text-[11.5px] font-semibold", chip.cls)}>{chip.label}</span>
                  <span className="font-body text-[11.5px] text-fg-subtle">{lastPulsed(i)}</span>
                </div>

                {/* action cue */}
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white transition-opacity group-hover:opacity-90">
                  <HeartPulse size={13} /> {i.state === "missing" ? "Rate pulse" : "Update"}
                  <ChevronRight size={14} className="-mr-1 opacity-80" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
