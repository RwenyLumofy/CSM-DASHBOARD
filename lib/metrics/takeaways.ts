/* =========================================================================
   Generated takeaway sentences for the Overview charts.

   Both the ARR-movement and retention headings are DERIVED from the period's
   numbers, never written by hand — so they can't contradict the chart they sit
   on. They live behind each chart's "i" (progressive disclosure), and this
   module is the single source both the popover and any caller read from, so the
   sentence and the "how it's generated" list can never drift apart.
   ========================================================================= */

const moneyK = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
};

/* ----------------------------- ARR movement ----------------------------- */

export type ArrTakeawayVariant =
  | "unchanged"
  | "churn-led"
  | "contraction-led"
  | "expansion-led"
  | "newbiz-led"
  | "broad-growth";

export function buildArrTakeaway({
  net,
  churn,
  contraction,
  expansion,
  newBusiness,
  periodLabel,
}: {
  net: number;
  churn: number;
  contraction: number;
  expansion: number;
  newBusiness: number;
  periodLabel: string;
}): { text: string; variant: ArrTakeawayVariant } {
  if (Math.abs(net) < 1) return { text: `ARR was unchanged in ${periodLabel}`, variant: "unchanged" };

  if (net < 0) {
    if (churn > 0 && churn >= contraction && newBusiness < churn) {
      const replaced = (newBusiness / churn) * 100;
      return {
        text: `ARR declined ${moneyK(-net)} as ${moneyK(newBusiness)} of new business offset only ${replaced.toFixed(1)}% of churn`,
        variant: "churn-led",
      };
    }
    if (contraction > churn)
      return { text: `ARR fell ${moneyK(-net)} as contraction and churn outweighed new business`, variant: "contraction-led" };
    return { text: `ARR fell ${moneyK(-net)} as churn exceeded positive movements`, variant: "churn-led" };
  }

  if (expansion > newBusiness && expansion > 0)
    return { text: `ARR grew ${moneyK(net)}, driven primarily by expansion`, variant: "expansion-led" };
  if (newBusiness > expansion && newBusiness > 0)
    return { text: `ARR grew ${moneyK(net)}, driven primarily by new business`, variant: "newbiz-led" };
  return { text: `ARR grew ${moneyK(net)} as expansion and new business exceeded losses`, variant: "broad-growth" };
}

/* ------------------------------- Retention ------------------------------ */

/** Where GRR landed, whether it moved, and whether it cleared target. */
export function buildRetentionTakeaway(grr: number, prevGrr: number | null, target: number): string {
  const dir = prevGrr == null ? null : grr - prevGrr;
  const verb =
    dir == null ? "stands at" : Math.abs(dir) < 0.05 ? "held at" : dir >= 3 ? "recovered to" : dir > 0 ? "improved to" : "slipped to";
  return grr < target
    ? `Retention ${verb} ${grr}%, but remains below target`
    : `Retention ${verb} ${grr}%, at or above target`;
}
