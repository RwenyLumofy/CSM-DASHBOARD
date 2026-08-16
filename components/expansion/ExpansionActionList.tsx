import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/expansion/format";
import type { Opportunity } from "@/lib/expansion/types";

/* =========================================================================
   Expansion on the Action list.

   An opportunity surfaces here when its next step is overdue or due today,
   when it has no next step, or when it has not been updated for 14 days —
   which is exactly what `attention()` already decides. This component renders
   that decision; it does not make one.

   DEDUPLICATION IS STRUCTURAL. Every row is derived live from current state,
   one per opportunity, so an unchanged fact yields the same single row
   tomorrow. Nothing is appended, so there is no way to get a fresh alert each
   day for a problem that has not changed — which is the failure mode a stored
   alert table has to work to avoid.
   ========================================================================= */

export function ExpansionActionList({ items }: {
  items: { opportunity: Opportunity; state: string; line: string }[];
}) {
  if (!items.length) return null;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-baseline gap-2 border-b border-border-subtle px-4 py-3">
        <TrendingUp size={15} className="translate-y-0.5 text-sirius" strokeWidth={1.75} />
        <h2 className="font-body text-[13px] font-semibold text-fg">Expansion</h2>
        <span className="rounded-full bg-bg-muted px-1.5 text-[11px] tabular-nums text-fg-muted">{items.length}</span>
        <Link href="/expansion" className="ml-auto text-[11.5px] font-medium text-accent hover:underline">
          Open the board →
        </Link>
      </div>

      <ul className="divide-y divide-border-subtle">
        {items.map(({ opportunity: o, state, line }) => (
          <li key={o.id}>
            <Link href="/expansion" className="flex items-baseline gap-3 px-4 py-2.5 hover:bg-bg-subtle">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{o.name}</span>
                <span className="block truncate text-[11px] text-fg-subtle">{o.accountName}</span>
              </span>
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-fg">
                {money(o.expectedArr, o.currency)}
              </span>
              <span className={cn("w-[112px] shrink-0 truncate text-right text-[11.5px] font-medium",
                state === "overdue" ? "text-danger-fg" : "text-warning-fg")}>
                {line}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
