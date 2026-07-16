"use client";

/* =========================================================================
   Insights sub-navigation.

   Subpages, not tabs-over-one-dataset: each answers a different question on a
   different clock — Overview is a quarterly report, Churn is an all-time
   pattern, Health explains a score as of today. Real routes, so each is
   linkable, which is the point when you're pasting one at a board.

   THE CLOCK IS PART OF THE LABEL. Every page here runs on a different one, and
   that ambiguity was the single biggest source of confusion on the old
   single-page version — three time bases interleaved as identical cards, each
   card growing its own footnote to explain which one it was on. Stating it in
   the nav means a reader knows before they arrive, and no panel has to
   apologise for itself.

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
  /** The clock this page runs on. */
  when: string;
  icon: LucideIcon;
}

export const INSIGHTS_TABS: InsightsTab[] = [
  { href: "/reports", label: "Overview", when: "by period", icon: Activity },
  { href: "/reports/churn", label: "Churn", when: "all time", icon: TrendingDown },
  { href: "/reports/health", label: "Health", when: "as of today", icon: HeartPulse },
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
                "group flex items-center gap-2.5 rounded-md px-3 py-1.5 transition-all duration-[140ms] [transition-timing-function:var(--ease-standard)]",
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
              <span className="flex flex-col leading-none">
                <span
                  className={cn(
                    "font-body text-[13px] font-semibold transition-colors duration-[140ms]",
                    active ? "text-fg" : "text-fg-muted group-hover:text-fg",
                  )}
                >
                  {t.label}
                </span>
                <span
                  className={cn(
                    "mt-1 font-body text-[10px] font-medium uppercase tracking-[0.06em] transition-colors duration-[140ms]",
                    active ? "text-sirius" : "text-fg-subtle",
                  )}
                >
                  {t.when}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
