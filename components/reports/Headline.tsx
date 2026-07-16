import { Card } from "@/components/ui/Card";
import type { Headline as HeadlineData } from "@/lib/metrics/exec";
import { periodDisplay } from "@/lib/metrics/exec";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

/* The page's opening sentence — the thing you'd paste into a board slide.
   Sits where a static description used to ("Retention, revenue movement,
   product usage and portfolio health across the ARR base…"), which restated the
   title, had gone stale as the page changed under it, and spent the best space
   on the page saying nothing.

   Everything below it is evidence for this sentence. */

export function Headline({ data, currency }: { data: HeadlineData; currency: string }) {
  const money = (v: number) => formatCurrency(v, currency, { compact: true });
  const down = (data.arrChange ?? 0) < 0;
  const flat = data.arrChange != null && Math.abs(data.arrChange) < 0.001;

  return (
    <Card className="border-l-[3px] border-l-sirius">
      <p className="font-body text-[15px] leading-relaxed text-fg-muted">
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
    </Card>
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
