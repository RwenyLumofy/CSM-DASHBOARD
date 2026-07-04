import type { ArrEvent, Client, RetentionMetrics } from "@/lib/types";
import { arrAsOf, periodBounds, periodMovement } from "@/lib/metrics/arr";

/**
 * Compute net & gross revenue retention for a period from the ARR ledger.
 *
 * Working off the event ledger (not just current-vs-previous deltas) means:
 *  - new business landed mid-period is EXCLUDED from NRR/GRR (it's not retention),
 *  - a renewal that went up is expansion, one that went down is contraction,
 *  - the starting base is the exact ARR as of the period's first day.
 *
 *  NRR = (start + expansion − contraction − churn) / start
 *  GRR = (start − contraction − churn) / start
 */
export function computeRetention(clients: Client[], arrEvents: ArrEvent[], period: string): RetentionMetrics {
  const { start, end, label } = periodBounds(period);

  const byClient = new Map<string, ArrEvent[]>();
  for (const e of arrEvents) {
    const list = byClient.get(e.clientId) ?? [];
    list.push(e);
    byClient.set(e.clientId, list);
  }

  let startingArr = 0;
  let expansion = 0;
  let contraction = 0;
  let churn = 0;
  let logoChurnCount = 0;
  let logoCount = 0;

  for (const [, events] of byClient) {
    const startArr = arrAsOf(events, start);
    if (startArr > 0) logoCount += 1; // logos that existed at period start
    startingArr += startArr;

    const move = periodMovement(events, start, end);
    expansion += move.expansion;
    contraction += move.contraction;
    churn += move.churn;
    if (move.churn > 0 && startArr > 0) logoChurnCount += 1;
  }

  const endingArr = startingArr + expansion - contraction - churn;
  const nrr = startingArr > 0 ? ((startingArr + expansion - contraction - churn) / startingArr) * 100 : 0;
  const grr = startingArr > 0 ? ((startingArr - contraction - churn) / startingArr) * 100 : 0;

  return {
    period: label,
    startingArr,
    expansion,
    contraction,
    churn,
    endingArr,
    nrr: round1(nrr),
    grr: round1(grr),
    logoChurnCount,
    logoCount: logoCount || clients.filter((c) => c.status !== "churned").length,
  };
}

/** Accounts whose ARR dropped this period but did not fully churn. */
export function downgrades(clients: Client[]): { client: Client; delta: number }[] {
  return clients
    .filter((c) => c.status !== "churned" && c.arr < c.previousArr)
    .map((c) => ({ client: c, delta: c.arr - c.previousArr }))
    .sort((a, b) => a.delta - b.delta);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
