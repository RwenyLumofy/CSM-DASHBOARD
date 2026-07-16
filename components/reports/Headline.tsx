"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { Headline as HeadlineData } from "@/lib/metrics/exec";
import { periodDisplay } from "@/lib/metrics/exec";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

/* The period's story in one sentence, as a popover in the control bar.

   It replaced a static description that restated the title, and it earns its
   place on demand: it's the paragraph you'd paste into a board pack. But as a
   permanent fixture it was a wall of prose above numbers people came to scan.

   As a bare toggle it was worse — a lone pill floating between the control bar
   and the first section, anchored to nothing. It belongs in the bar: that row
   is where you set the scope, and this is what the scope SAYS. Controls on the
   left, readouts on the right.

   A popover rather than an inline expand, so opening it doesn't stretch the bar
   and shove the page down — and it matches the Filters panel next to it.

   Deliberately NOT an arrow-only disclosure: the trigger says what it is
   ("Summary of Q2 2026"), so it's worth pressing rather than a gamble. */

export function Headline({ data, currency }: { data: HeadlineData; currency: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const money = (v: number) => formatCurrency(v, currency, { compact: true });
  const down = (data.arrChange ?? 0) < 0;
  const flat = data.arrChange != null && Math.abs(data.arrChange) < 0.001;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "group inline-flex w-fit items-center gap-2 rounded-pill border py-1.5 pl-2.5 pr-3 font-body text-[12.5px] font-semibold transition-colors duration-[140ms]",
          open
            ? "border-sirius-200 bg-sirius-50 text-sirius-600"
            : "border-border bg-surface text-fg-muted hover:border-sirius-200 hover:bg-sirius-50 hover:text-sirius-600",
        )}
      >
        <Sparkles size={13} strokeWidth={2} aria-hidden />
        Summary of {periodDisplay(data.period)}
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          aria-hidden
          className={cn("transition-transform duration-[140ms]", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="pm-overlay-in absolute right-0 top-[calc(100%+6px)] z-50 w-[min(92vw,520px)] rounded-lg border border-border border-l-[3px] border-l-sirius bg-surface p-4 shadow-lg">
          <p className="font-body text-[14px] leading-relaxed text-fg-muted">
            <Num>{periodDisplay(data.period)}</Num>
            {data.inProgress ? " is tracking at " : " closed at "}
            <Num>{money(data.closingArr)}</Num>
            {data.arrChange != null && !flat && (
              <>
                {", "}
                <span className={cn("font-semibold", down ? "text-danger-fg" : "text-success-fg")}>
                  {down ? "down" : "up"} {Math.abs(data.arrChange * 100).toFixed(1)}%
                </span>
              </>
            )}
            {data.churnArr > 0 ? (
              <>
                {" — "}
                <Num tone="bad">{money(data.churnArr)}</Num> churned across <Num tone="bad">{data.churnCount}</Num>{" "}
                {data.churnCount === 1 ? "account" : "accounts"}
              </>
            ) : (
              <>{" — "}no churn</>
            )}
            {data.contraction > 0 && (
              <>
                {" and "}
                <Num tone="warn">{money(data.contraction)}</Num> lost to downgrades
              </>
            )}
            {(data.newBusiness > 0 || data.expansion > 0) && (
              <>
                {", offset by "}
                {data.newBusiness > 0 && (
                  <>
                    <Num tone="good">{money(data.newBusiness)}</Num> new business
                  </>
                )}
                {data.newBusiness > 0 && data.expansion > 0 && " and "}
                {data.expansion > 0 && (
                  <>
                    <Num tone="good">{money(data.expansion)}</Num> expansion
                  </>
                )}
              </>
            )}
            {". "}
            {data.renewalsCount > 0 ? (
              <>
                <Num>{data.renewalsCount}</Num> {data.renewalsCount === 1 ? "renewal" : "renewals"} (
                <Num>{money(data.renewalsArr)}</Num>) land in the next 90 days
                {data.atRiskCount > 0 ? (
                  <>
                    {", "}
                    <Num tone="bad">{data.atRiskCount}</Num> of them at risk —{" "}
                    <Num tone="bad">{money(data.atRiskArr)}</Num> exposed.
                  </>
                ) : (
                  ", none showing risk signals."
                )}
              </>
            ) : (
              "No renewals due in the next 90 days."
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Num({ children, tone }: { children: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  return (
    <strong
      className={cn(
        "tabular font-semibold",
        tone === "good" ? "text-success-fg" : tone === "bad" ? "text-danger-fg" : tone === "warn" ? "text-warning-fg" : "text-fg",
      )}
    >
      {children}
    </strong>
  );
}
