/* =========================================================================
   Account movement — "what changed", and "what's at risk".

   The design here follows what the CS category actually converges on, which is
   NOT what the first cut of this page did:

   - Vitally ships no portfolio adoption dashboard at all. Its atomic unit is a
     per-account RATIO (% of that account's own users active), never a
     cross-account sum, and its primary surface is a sortable column — not a
     chart. Aggregates average away the only signal in a book where one account
     is 47% of all activity.
   - Every named risk indicator in the category is a DELTA, not a level:
     "declining usage", "% change in active users", ChurnZero's "Event Decrease
     by X% over Y". Gainsight's Accounts Explorer marks each account with an
     up/down triangle against the prior 30 days; ChurnZero's lead widget is "My
     ChurnScore Changes" — who moved, and why.

   So this module produces ranked ACCOUNT LISTS, not averages:
     movements()  — every account that moved this period, by ARR impact
     atRisk()     — renewals ahead, scored by whether the customer actually uses
                    the product

   Usage movement reads client_usage_monthly (per-account history, backfilled
   from Metabase). Health and support have no history yet, so they are
   deliberately absent rather than faked from a current value.
   ========================================================================= */

import type { ArrEvent, Client } from "@/lib/types";
import type { UsageMonthRow } from "@/lib/usage/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

/* ------------------------------------------------------------ month helpers */

/** The last COMPLETE calendar month as "YYYY-MM". The current month is always
 *  partial, and comparing a part-month against a whole one manufactures a drop
 *  for every account — on the 16th, every account would look ~50% down. */
export function lastCompleteMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; this IS the previous month 1-based
  const d = m === 0 ? { y: y - 1, m: 12 } : { y, m };
  return `${d.y}-${String(d.m).padStart(2, "0")}`;
}

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/* ---------------------------------------------------------- usage movement */

export type UsageDirection = "grew" | "flat" | "declined" | "dormant" | "unknown";

export interface UsageMovement {
  current: number | null;
  previous: number | null;
  delta: number | null;
  /** Fractional change vs the prior month. Null when the prior month is 0 — a
   *  rise from 0 has no defined percentage, and reporting "+∞%" or "+100%"
   *  would rank a 0→2 account above a 400→300 one. */
  pctChange: number | null;
  direction: UsageDirection;
  /** Trailing series (oldest→newest) for a sparkline. */
  series: { month: string; mau: number }[];
}

/** ±10% is the dead-band for "flat". Below that, month-to-month noise (a public
 *  holiday, a short month, one team's training week) dominates — and this book
 *  swings hard seasonally: Feb/Mar sit ~40% below the Dec/Jan peak across every
 *  account, so a tighter band would flag the whole portfolio every February. */
const FLAT_BAND = 0.1;

/** A percentage needs a base to be meaningful. With 2 actives last month and 1
 *  this month, "down 50%" is arithmetically true and analytically worthless —
 *  one person took leave. Below this floor an account can still go `dormant`
 *  (a real, actionable state), but it is never surfaced as a *declining* one,
 *  which is what stops the movement list filling up with two-user accounts
 *  wobbling by one login. */
const MIN_BASE_FOR_PCT = 5;

export function usageMovementByClient(
  rows: UsageMonthRow[],
  month: string,
  trailing = 6,
): Map<string, UsageMovement> {
  const byClient = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = byClient.get(r.clientId) ?? new Map<string, number>();
    m.set(r.month, r.mau);
    byClient.set(r.clientId, m);
  }

  const months: string[] = [];
  let cursor = month;
  for (let i = 0; i < trailing; i++) {
    months.unshift(cursor);
    cursor = prevMonth(cursor);
  }
  const prior = prevMonth(month);

  const out = new Map<string, UsageMovement>();
  for (const [clientId, byMonth] of byClient) {
    // A client only appears in this map if it has at least one history row, so
    // its environment IS linked and WAS queried. A month with no row therefore
    // means the backfill found no logins that month — genuinely zero actives,
    // not missing data. Reading it as null instead of 0 produced the nonsense
    // "Usage down 100% — 1 → null" (an account that in fact went to zero, which
    // is `dormant`, a different and more actionable state than `declined`).
    const current = byMonth.get(month) ?? 0;
    const previous = byMonth.get(prior) ?? 0;
    const series = months.map((m) => ({ month: m, mau: byMonth.get(m) ?? 0 }));

    let direction: UsageDirection;
    let delta: number | null = null;
    let pctChange: number | null = null;

    if (current === 0 && previous === 0) {
      // Never active in either month — nothing moved. Not a decline.
      direction = "dormant";
      delta = 0;
    } else if (current === 0) {
      // Zero actives is its own category, not an extreme "declined". An account
      // that went dark needs a different conversation from one that dipped.
      direction = "dormant";
      delta = -previous;
      pctChange = -1;
    } else if (previous === 0) {
      direction = "grew";
      delta = current;
    } else {
      delta = current - previous;
      pctChange = delta / previous;
      direction =
        previous < MIN_BASE_FOR_PCT
          ? "flat" // too small a base for the percentage to mean anything
          : pctChange > FLAT_BAND
            ? "grew"
            : pctChange < -FLAT_BAND
              ? "declined"
              : "flat";
    }

    out.set(clientId, { current, previous, delta, pctChange, direction, series });
  }
  return out;
}

/* --------------------------------------------------------------- movements */

export type MovementKind = "churned" | "downgraded" | "expanded" | "new" | "usage_declined" | "usage_dormant";

export interface Movement {
  client: Client;
  kind: MovementKind;
  /** Signed ARR impact. 0 for usage-only movements — they carry no booked
   *  revenue change, but `arrAtStake` says what the account is worth. */
  arrDelta: number;
  arrAtStake: number;
  usage: UsageMovement | null;
  date: string | null;
  note: string;
}

/** Every account that moved in [start, end), ranked by what it's worth.
 *
 *  Revenue movements come off the ARR ledger (the same source as the waterfall,
 *  so the two can never disagree — the old page's churn list was all-time while
 *  the bridge beside it was period-scoped, and they contradicted each other on
 *  screen). Usage movements are month-over-month and are only included when they
 *  have NOT already been captured as a revenue event: an account that churned is
 *  reported once, as churn, not again as "usage dropped". */
export function movements(
  clients: Client[],
  arrEvents: ArrEvent[],
  bounds: { start: string; end: string },
  usage: Map<string, UsageMovement>,
): Movement[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out: Movement[] = [];
  const claimed = new Set<string>();

  const inPeriod = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= bounds.start && d < bounds.end;
  };

  for (const e of arrEvents) {
    if (!inPeriod(e.effectiveDate)) continue;
    const client = byId.get(e.clientId);
    if (!client) continue;
    const date = e.effectiveDate.slice(0, 10);
    const u = usage.get(client.id) ?? null;

    if (e.type === "churn") {
      out.push({ client, kind: "churned", arrDelta: -Math.abs(e.amount), arrAtStake: Math.abs(e.amount), usage: u, date, note: "Churned" });
      claimed.add(client.id);
    } else if (e.type === "contraction" || (e.type === "renewal" && e.amount < 0)) {
      out.push({ client, kind: "downgraded", arrDelta: -Math.abs(e.amount), arrAtStake: Math.abs(e.amount), usage: u, date, note: "ARR reduced" });
      claimed.add(client.id);
    } else if (e.type === "expansion" || e.type === "reactivation" || (e.type === "renewal" && e.amount > 0)) {
      out.push({ client, kind: "expanded", arrDelta: Math.abs(e.amount), arrAtStake: Math.abs(e.amount), usage: u, date, note: e.type === "reactivation" ? "Reactivated" : "Expanded" });
      claimed.add(client.id);
    } else if (e.type === "new_business") {
      out.push({ client, kind: "new", arrDelta: Math.abs(e.amount), arrAtStake: Math.abs(e.amount), usage: u, date, note: "New business" });
      claimed.add(client.id);
    }
  }

  // Usage-only movements: the leading indicator, for accounts whose revenue
  // hasn't moved (yet). This is the half of the picture the ledger can't see.
  for (const client of clients) {
    if (claimed.has(client.id) || client.status === "churned") continue;
    const u = usage.get(client.id);
    if (!u) continue;
    if (u.direction === "dormant" && (u.previous ?? 0) > 0) {
      out.push({ client, kind: "usage_dormant", arrDelta: 0, arrAtStake: client.arr, usage: u, date: null, note: `Went dormant — ${u.previous} → 0 monthly actives` });
    } else if (u.direction === "declined" && u.pctChange != null && u.pctChange <= -0.25) {
      out.push({ client, kind: "usage_declined", arrDelta: 0, arrAtStake: client.arr, usage: u, date: null, note: `Usage down ${Math.round(Math.abs(u.pctChange) * 100)}% — ${u.previous} → ${u.current}` });
    }
  }

  // Rank by what's at stake, not by recency: a $24k churn outranks a $300 one.
  return out.sort((a, b) => b.arrAtStake - a.arrAtStake);
}

/* ----------------------------------------------------------------- at risk */

export interface RiskRow {
  client: Client;
  daysToRenewal: number;
  arr: number;
  usage: UsageMovement | null;
  health: number;
  /** 0–100. Higher = more concerning. */
  risk: number;
  reasons: string[];
}

/**
 * Renewals ahead, scored by whether the customer is actually using the product.
 *
 * The score is deliberately simple and explainable — every point traces to a
 * reason string shown in the UI. A CSM has to trust it enough to act, and an
 * opaque weighted blend of nine signals is exactly what
 * "health scores average out the signal" warns against. It ranks a worklist; it
 * does not predict churn.
 */
export function atRisk(
  clients: Client[],
  usage: Map<string, UsageMovement>,
  opts: { withinDays?: number; now?: Date } = {},
): RiskRow[] {
  const withinDays = opts.withinDays ?? 90;
  const now = opts.now ?? new Date();
  const out: RiskRow[] = [];

  for (const c of clients) {
    if (c.status === "churned" || !c.renewalDate) continue;
    const days = differenceInCalendarDays(parseISO(c.renewalDate), now);
    if (days < 0 || days > withinDays) continue;

    const u = usage.get(c.id) ?? null;
    const reasons: string[] = [];
    let risk = 0;

    if (u?.direction === "dormant") {
      risk += 45;
      reasons.push("No monthly actives");
    } else if (u?.direction === "declined") {
      const drop = Math.abs(u.pctChange ?? 0);
      risk += drop >= 0.5 ? 35 : 22;
      reasons.push(`Usage down ${Math.round(drop * 100)}%`);
    } else if (!u || u.current == null) {
      risk += 10;
      reasons.push("No usage data");
    }

    if (c.health.score < 55) {
      risk += 25;
      reasons.push(`Health ${c.health.score}`);
    } else if (c.health.score < 75) {
      risk += 12;
      reasons.push(`Health ${c.health.score}`);
    }

    if (c.support.openTickets > 5) {
      risk += 10;
      reasons.push(`${c.support.openTickets} open tickets`);
    }
    if (c.support.slaBreaches?.length) {
      risk += 10;
      reasons.push(`${c.support.slaBreaches.length} SLA breach${c.support.slaBreaches.length === 1 ? "" : "es"}`);
    }

    // Imminence is an amplifier, not a risk in itself — a healthy account
    // renewing next week isn't a problem.
    if (days <= 30 && risk > 0) {
      risk += 10;
      reasons.push(`Renews in ${days}d`);
    }

    out.push({ client: c, daysToRenewal: days, arr: c.arr, usage: u, health: c.health.score, risk: Math.min(100, risk), reasons });
  }

  // ARR-weighted: a $500k renewal at moderate risk deserves attention before a
  // $500 one that's on fire.
  return out.sort((a, b) => b.risk * Math.log10(b.arr + 10) - a.risk * Math.log10(a.arr + 10));
}

/* ----------------------------------------------------------- concentration */

export interface ConcentrationRow {
  /** Carried so the row can link to the account — the name alone was a
   *  dead end on a card whose whole point is "these five matter". */
  id: string;
  name: string;
  arr: number;
  arrShare: number;
  mau: number;
  mauShare: number;
}

/** Top accounts by ARR, with their share of usage alongside.
 *  The mismatch is the point: this book's largest usage account (47% of all
 *  monthly actives) is only ~10% of ARR — either the biggest concentration risk
 *  or the clearest pricing headroom, and a board will ask about it either way. */
export function concentration(
  clients: Client[],
  usage: Map<string, UsageMovement>,
  topN = 5,
): { rows: ConcentrationRow[]; topArrShare: number; topMauShare: number } {
  const live = clients.filter((c) => c.status !== "churned");
  const totalArr = live.reduce((a, c) => a + c.arr, 0);
  const totalMau = live.reduce((a, c) => a + (usage.get(c.id)?.current ?? 0), 0);

  const rows = [...live]
    .sort((a, b) => b.arr - a.arr)
    .slice(0, topN)
    .map((c) => {
      const mau = usage.get(c.id)?.current ?? 0;
      return {
        id: c.id,
        name: c.name,
        arr: c.arr,
        arrShare: totalArr ? c.arr / totalArr : 0,
        mau,
        mauShare: totalMau ? mau / totalMau : 0,
      };
    });

  return {
    rows,
    topArrShare: rows.reduce((a, r) => a + r.arrShare, 0),
    topMauShare: rows.reduce((a, r) => a + r.mauShare, 0),
  };
}
