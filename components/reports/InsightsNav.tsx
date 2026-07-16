"use client";

/* =========================================================================
   Insights sub-navigation.

   Subpages, not tabs. Tabs imply "same data, different slice"; these are
   different questions on different clocks — Overview is a quarterly report,
   Churn is an all-time pattern, coverage audits are as-of-today. Real routes
   also mean each is linkable, which matters when the point is pasting one at a
   board.

   THE THING THAT WOULD QUIETLY BREAK: every link carries the current query
   string forward. Filters live in the URL, so a plain <Link href="/reports/churn">
   silently drops "Zainab's enterprise accounts" the moment you switch subpage —
   and you'd never get an error, just different numbers. `period`/`compare` ride
   along too: they're inert on subpages that don't read them, and preserved for
   when you navigate back to Overview.
   ========================================================================= */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

export interface InsightsTab {
  href: string;
  label: string;
  /** The clock this page runs on — stated once here rather than re-explained
   *  on every card inside it. */
  when: string;
}

export const INSIGHTS_TABS: InsightsTab[] = [
  { href: "/reports", label: "Overview", when: "by period" },
  { href: "/reports/churn", label: "Churn", when: "all time" },
];

export function InsightsNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();

  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="Insights sections">
      {INSIGHTS_TABS.map((t) => {
        // Exact match for the index route, prefix match for children — otherwise
        // "/reports" would light up on every subpage.
        const active = t.href === "/reports" ? pathname === "/reports" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={qs ? `${t.href}?${qs}` : t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px flex items-baseline gap-1.5 border-b-2 px-3 py-2 font-body text-[13px] font-semibold transition-colors duration-[140ms]",
              active
                ? "border-sirius text-fg"
                : "border-transparent text-fg-subtle hover:border-border-strong hover:text-fg",
            )}
          >
            {t.label}
            <span className="font-body text-[10.5px] font-medium uppercase tracking-[0.05em] text-fg-subtle">
              {t.when}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
