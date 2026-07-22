"use client";

/* =========================================================================
   Insights sub-navigation.

   Subpages, not tabs-over-one-dataset: each answers a different question on a
   different clock — Overview is a quarterly report, Churn is an all-time
   pattern, Health explains a score as of today. Real routes, so each is
   linkable, which is the point when you're pasting one at a board.

   NO CLOCK IN THE LABEL. It used to read "Overview · by period", "Churn · all
   time", "Health · as of today" — which baked a fixed time base into the nav.
   That conflated two different things: churn being all-time was a CHOICE I made
   (its events are dated; "who churned in Q2" is a fine question), while health
   being as-of-today is a real DATA LIMIT (no history exists). Advertising both
   as properties of the page made the choice look like a law. Churn now carries
   its own date picker defaulting to All time, and health states its limit on
   its own page, where the reason belongs.

   THE THING THAT WOULD BREAK SILENTLY: every link carries the current query
   string. Filters live in the URL, so a plain <Link href="/reports/churn">
   drops "Zainab's enterprise accounts" on navigation — no error, just quietly
   different numbers.
   ========================================================================= */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, HeartPulse, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InsightsTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const INSIGHTS_TABS: InsightsTab[] = [
  { href: "/reports", label: "Overview", icon: Activity },
  { href: "/reports/health", label: "Health", icon: HeartPulse },
  { href: "/reports/churn", label: "Churn", icon: TrendingDown },
];

export function InsightsNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();

  return (
    <nav aria-label="Insights sections">
      {/* A raised segmented control rather than underlined text: it echoes the
          sidebar's solid active pill, and it gives each item room for its clock
          without the labels colliding. */}
      <div className="inline-flex flex-wrap items-stretch gap-1 rounded-lg border border-border bg-bg-subtle p-1">
        {INSIGHTS_TABS.map((t) => {
          // Exact for the index, prefix for children — else "/reports" lights up
          // on every subpage.
          const active = t.href === "/reports" ? pathname === "/reports" : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={qs ? `${t.href}?${qs}` : t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2 rounded-md px-3 py-2 transition-all duration-[140ms] [transition-timing-function:var(--ease-standard)]",
                active
                  ? "bg-surface shadow-sm ring-1 ring-border"
                  : "hover:bg-surface/60",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded transition-colors duration-[140ms]",
                  active ? "bg-sirius text-white" : "bg-bg-muted text-fg-subtle group-hover:text-fg-muted",
                )}
              >
                <Icon size={13} strokeWidth={2} />
              </span>
              <span
                className={cn(
                  "font-body text-[13px] font-semibold transition-colors duration-[140ms]",
                  active ? "text-fg" : "text-fg-muted group-hover:text-fg",
                )}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
