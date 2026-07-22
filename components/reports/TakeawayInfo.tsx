"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* A closed "i" that sits on a chart's title line and, on click, reveals that
   chart's takeaway — the generated sentence, plus one short line of context
   (the impact, or a definition). The sentence is deliberately NOT printed on
   the chart itself: the card stays scannable, and the narrative is one click
   away.

   Deliberately light. An earlier version listed all six sentence variants and
   how each is chosen — the machinery, not the answer, which read as clutter.
   Now it's the conclusion plus one useful line. Reused by both charts so the
   affordance is identical. */

export function TakeawayInfo({
  takeaway,
  note,
  label = "Show this section’s takeaway",
}: {
  /** The generated sentence, revealed in the popover. */
  takeaway: string;
  /** One short line of context — the impact of the movement, or a definition. */
  note?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "grid size-5 place-items-center rounded-full border transition-colors",
          open ? "border-sirius bg-sirius/10 text-sirius" : "border-border text-fg-subtle hover:border-border-strong hover:text-fg-muted",
        )}
      >
        <Info size={12} strokeWidth={2.25} aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-30 w-[min(90vw,340px)] rounded-xl border border-border bg-surface p-3 text-left shadow-lg">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-body text-[11.5px] font-semibold text-fg">This period’s takeaway</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-fg-subtle hover:text-fg">
              <X size={13} strokeWidth={2.25} aria-hidden />
            </button>
          </div>

          <p className="font-body text-[13.5px] font-semibold leading-snug text-fg">{takeaway}</p>

          {note && (
            <div className="mt-2.5 border-t border-border-subtle pt-2.5">
              <p className="caption leading-snug">{note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
