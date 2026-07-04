/* =========================================================================
   ARR ledger math.

   A client's current ARR is the running balance of its ArrEvents — not a
   value scraped from HubSpot deals with a hardcoded "active this year" rule.
   This keeps ARR correct indefinitely: 2026, 2027, and beyond. HubSpot only
   ever contributes `new_business` events (Closed Won in Direct/Indirect
   pipelines); renewals/expansions/contractions/churn are recorded in-app.
   ========================================================================= */

import type { AccountStatus, ArrEvent } from "@/lib/types";

const day = (iso: string): string => iso.slice(0, 10);

/** Chronological order: by effective date, then creation order as tiebreak. */
export function sortEvents(events: ArrEvent[]): ArrEvent[] {
  return [...events].sort((a, b) => {
    const d = day(a.effectiveDate).localeCompare(day(b.effectiveDate));
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Re-stamp each event's `arr` field with the running balance (clamped ≥ 0).
 * Use this whenever the ledger changes so the materialized balances stay true.
 */
export function withRunningBalance(events: ArrEvent[]): ArrEvent[] {
  let bal = 0;
  return sortEvents(events).map((e) => {
    bal = Math.max(0, bal + e.amount);
    return { ...e, arr: bal };
  });
}

export interface DerivedArr {
  arr: number;
  renewalDate: string | null;
  status: AccountStatus;
  startedAt: string | null;
  churnedAt: string | null;
  lastEventAt: string | null;
}

/** Collapse a client's ledger into the materialized fields stored on the row. */
export function deriveClientArr(events: ArrEvent[]): DerivedArr {
  const sorted = sortEvents(events);
  let bal = 0;
  let renewalDate: string | null = null;
  let startedAt: string | null = null;
  let churnedAt: string | null = null;
  let last: ArrEvent | null = null;

  for (const e of sorted) {
    bal = Math.max(0, bal + e.amount);
    if (e.renewalDate) renewalDate = day(e.renewalDate);
    if (e.type === "new_business" && !startedAt) startedAt = day(e.effectiveDate);
    last = e;
  }

  const churned = bal <= 0 && last?.type === "churn";
  if (churned) churnedAt = last ? day(last.effectiveDate) : null;

  return {
    arr: bal,
    renewalDate,
    status: churned ? "churned" : "active",
    startedAt,
    churnedAt,
    lastEventAt: last ? last.effectiveDate : null,
  };
}

/** ARR balance as of the start of `dateISO` (events strictly before it). */
export function arrAsOf(events: ArrEvent[], dateISO: string): number {
  const cut = day(dateISO);
  let bal = 0;
  for (const e of sortEvents(events)) {
    if (day(e.effectiveDate) < cut) bal = Math.max(0, bal + e.amount);
  }
  return bal;
}

export interface PeriodMovement {
  newBusiness: number; // excluded from NRR/GRR (new logos)
  expansion: number;
  contraction: number; // stored positive
  churn: number; // stored positive
  churnedLogos: number;
}

/**
 * Movement within [startISO, endISO). Renewals are split into expansion /
 * contraction by the sign of their delta. New business is reported separately
 * so it never inflates net revenue retention.
 */
export function periodMovement(events: ArrEvent[], startISO: string, endISO: string): PeriodMovement {
  const start = day(startISO);
  const end = day(endISO);
  let newBusiness = 0;
  let expansion = 0;
  let contraction = 0;
  let churn = 0;
  let churnedLogos = 0;

  for (const e of sortEvents(events)) {
    const d = day(e.effectiveDate);
    if (d < start || d >= end) continue;
    switch (e.type) {
      case "new_business":
        newBusiness += e.amount;
        break;
      case "expansion":
      case "reactivation":
        expansion += Math.max(0, e.amount);
        break;
      case "contraction":
        contraction += Math.max(0, -e.amount);
        break;
      case "churn":
        churn += Math.max(0, -e.amount);
        churnedLogos += 1;
        break;
      case "renewal":
        if (e.amount > 0) expansion += e.amount;
        else if (e.amount < 0) contraction += -e.amount;
        break;
    }
  }

  return { newBusiness, expansion, contraction, churn, churnedLogos };
}

/* ---------------------------------------------------------------- periods */

export interface PeriodBounds {
  start: string; // "YYYY-MM-DD" inclusive
  end: string; // "YYYY-MM-DD" exclusive
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const firstOfMonth = (y: number, m1: number) => `${y}-${pad(m1)}-01`; // m1 is 1-based

function addMonths(y: number, m1: number, delta: number): { y: number; m1: number } {
  const zero = (y * 12 + (m1 - 1)) + delta;
  return { y: Math.floor(zero / 12), m1: (zero % 12) + 1 };
}

/**
 * Parse a period string into [start, end) date bounds.
 * Supports "YYYY-Qn" (quarter), "YYYY-MM" (month), and "YYYY" (year).
 * Falls back to the calendar year of an unrecognized string.
 */
export function periodBounds(period: string): PeriodBounds {
  const q = period.match(/^(\d{4})-Q([1-4])$/i);
  if (q) {
    const y = Number(q[1]);
    const startM = (Number(q[2]) - 1) * 3 + 1;
    const e = addMonths(y, startM, 3);
    return { start: firstOfMonth(y, startM), end: firstOfMonth(e.y, e.m1), label: `${q[1]}-Q${q[2]}` };
  }
  const mo = period.match(/^(\d{4})-(\d{2})$/);
  if (mo) {
    const y = Number(mo[1]);
    const m = Number(mo[2]);
    const e = addMonths(y, m, 1);
    return { start: firstOfMonth(y, m), end: firstOfMonth(e.y, e.m1), label: period };
  }
  const yr = period.match(/^(\d{4})$/);
  const y = yr ? Number(yr[1]) : new Date().getUTCFullYear();
  return { start: `${y}-01-01`, end: `${y + 1}-01-01`, label: String(y) };
}

/** The current calendar quarter as a "YYYY-Qn" string. */
export function currentQuarter(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const qn = Math.floor(now.getUTCMonth() / 3) + 1;
  return `${y}-Q${qn}`;
}
