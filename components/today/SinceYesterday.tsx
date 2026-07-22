"use client";

/* Today — "What changed" (artifact parity). A quiet card of real recent
   movements: coloured dot + change title + explanation + relative time. Colour
   lives on the dot only. Honest: shows tracked changes, never invents deltas. */

import { getChanges, getAccount, relativeTime } from "@/lib/today/repo";
import { CHANGE_KIND } from "@/lib/today/format";
import { useToday } from "./TodayContext";
import { cn } from "@/lib/cn";

const DOT: Record<string, string> = {
  danger: "bg-danger-fg", warning: "bg-warning-fg", info: "bg-info-fg",
  success: "bg-success-fg", eclipse: "bg-eclipse-fg", neutral: "bg-fg-subtle",
};

export function SinceYesterday() {
  const { scope, openAccount } = useToday();
  const changes = getChanges(scope, null).slice(0, 6);

  return (
    <section aria-label="What changed" className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border-subtle px-3.5 py-2.5">
        <span className="font-body text-[12.5px] font-semibold text-fg">What changed</span>
        <span className="font-body text-[11px] text-fg-subtle">Last 7 days</span>
      </div>
      {changes.length === 0 ? (
        <p className="px-3.5 py-4 font-body text-[12.5px] text-fg-subtle">No tracked changes recently.</p>
      ) : (
        <ul>
          {changes.map((c, i) => {
            const meta = CHANGE_KIND[c.kind];
            const acct = c.accountId ? getAccount(c.accountId) : null;
            return (
              <li key={c.id} className={cn("flex gap-2.5 px-3.5 py-2.5", i > 0 && "border-t border-border-subtle")}>
                <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[meta?.tone ?? "neutral"])} />
                <div className="min-w-0 flex-1">
                  <div className="font-body text-[12px] font-medium text-fg">{c.title}</div>
                  {c.explanation && <p className="mt-0.5 font-body text-[11px] text-fg-muted">{c.explanation}</p>}
                  <div className="mt-0.5 font-body text-[10.5px] text-fg-subtle">
                    {acct && <><button onClick={() => openAccount(acct.id)} className="font-medium hover:text-sirius hover:underline">{acct.name}</button> · </>}
                    {relativeTime(c.occurredAt)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
