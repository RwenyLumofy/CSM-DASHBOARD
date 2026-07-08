import type { Client, PortfolioSummary } from "@/lib/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

export function buildPortfolioSummary(
  clients: Client[],
  now: Date = new Date(),
): PortfolioSummary {
  const active = clients.filter((c) => c.status !== "churned");

  let totalArr = 0;
  let healthy = 0;
  let watch = 0;
  let atRisk = 0;
  let healthSum = 0;
  let openTickets = 0;
  let csatSum = 0;
  let csatN = 0;
  let npsSum = 0;
  let npsN = 0;
  let renewalsNext90d = 0;
  let arrUpForRenewal90d = 0;

  for (const c of active) {
    totalArr += c.arr;
    healthSum += c.health.score;
    // Portfolio rollup uses fixed high/mid/low score bands (75/55) rather than
    // the admin's custom tier NAMES, so this three-way distribution stays
    // stable and comparable even when tiers are renamed/added/removed in
    // Settings. Per-client displays (HealthPill) use the real resolved tier.
    if (c.health.score >= 75) healthy += 1;
    else if (c.health.score >= 55) watch += 1;
    else atRisk += 1;

    openTickets += c.support.openTickets;

    if (c.support.csat != null) {
      csatSum += normalizeCsat(c.support.csat, c.support.csatScale);
      csatN += 1;
    }
    if (c.support.nps != null) {
      npsSum += c.support.nps;
      npsN += 1;
    }

    if (c.renewalDate) {
      const days = differenceInCalendarDays(parseISO(c.renewalDate), now);
      if (days >= 0 && days <= 90) {
        renewalsNext90d += 1;
        arrUpForRenewal90d += c.arr;
      }
    }
  }

  return {
    totalClients: active.length,
    totalArr,
    currency: clients[0]?.currency ?? "USD",
    healthy,
    watch,
    atRisk,
    avgHealth: active.length ? Math.round(healthSum / active.length) : 0,
    openTickets,
    avgCsat: csatN ? Math.round(csatSum / csatN) : null,
    avgNps: npsN ? Math.round(npsSum / npsN) : null,
    renewalsNext90d,
    arrUpForRenewal90d,
  };
}

/** Normalize CSAT to a 0–100 percentage regardless of source scale. */
export function normalizeCsat(value: number, scale: "percent" | "five"): number {
  return scale === "five" ? Math.round((value / 5) * 100) : Math.round(value);
}
