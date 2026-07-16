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

/** [Monday, next Monday) for ISO week `week` of `year` (week 1 = the week
 *  containing the year's first Thursday, per ISO 8601 — weeks run Mon-Sun). */
function isoWeekBounds(year: number, week: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7; // ISO weekday: Mon=1..Sun=7
  const week1Monday = new Date(Date.UTC(year, 0, 4 - (jan4Weekday - 1)));
  const start = new Date(week1Monday);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** An explicit range key: "YYYY-MM-DD..YYYY-MM-DD", both ends INCLUSIVE.
 *
 *  Inclusive because that's what a person reading a date picker means — "Apr 1
 *  to Apr 30" includes the 30th. Every other period key here resolves to a
 *  half-open [start, end) internally, so the end gets bumped a day on the way
 *  in. ClientsTable's renewalBounds hit this exact trap and documents the same
 *  fix; getting it wrong silently drops the last day of every custom range.
 */
export function rangeKey(startInclusive: string, endInclusive: string): string {
  return `${startInclusive}..${endInclusive}`;
}

export function isRangeKey(period: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(period);
}

/**
 * Parse a period string into [start, end) date bounds.
 * Supports "YYYY-MM-DD..YYYY-MM-DD" (explicit inclusive range), "YYYY-Www"
 * (ISO week), "YYYY-Qn" (quarter), "YYYY-MM" (month), and "YYYY" (year). Falls
 * back to the calendar year of an unrecognized string.
 */
export function periodBounds(period: string): PeriodBounds {
  if (isRangeKey(period)) {
    const [s, e] = period.split("..");
    // +1 day: the key's end is inclusive, these bounds are exclusive.
    return { start: s, end: addDays(e, 1), label: `${s} → ${e}` };
  }
  const w = period.match(/^(\d{4})-W(\d{1,2})$/i);
  if (w) {
    const y = Number(w[1]);
    const wk = Number(w[2]);
    const { start, end } = isoWeekBounds(y, wk);
    return { start, end, label: `${y}-W${pad(wk)}` };
  }
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

/** The current ISO week as a "YYYY-Www" string (ISO week-numbering year, which
 *  can differ from the calendar year for the first/last few days of January). */
export function currentWeek(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to this week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${pad(weekNo)}`;
}

/** Shift a period string by `delta` units of its own granularity — e.g.
 *  shiftPeriod("2026-Q2", 1) -> "2026-Q3", shiftPeriod("2026-W01", -1) ->
 *  "2025-W52". Powers the timeline filter's prev/next navigation. */
export function shiftPeriod(period: string, delta: number): string {
  // An explicit range steps by its OWN length, so paging a 30-day window moves
  // 30 days — not a month, and not a calendar boundary. That keeps "last 30
  // days" comparable against "the 30 days before it", which is what a
  // period-over-period comparison of a rolling window has to mean.
  if (isRangeKey(period)) {
    const [s, e] = period.split("..");
    const span = daysBetween(s, e) + 1; // inclusive end -> length in days
    return rangeKey(addDays(s, delta * span), addDays(e, delta * span));
  }
  const w = period.match(/^(\d{4})-W(\d{1,2})$/i);
  if (w) {
    const { start } = isoWeekBounds(Number(w[1]), Number(w[2]));
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    return currentWeek(d);
  }
  const mo = period.match(/^(\d{4})-(\d{2})$/);
  if (mo) {
    const e = addMonths(Number(mo[1]), Number(mo[2]), delta);
    return `${e.y}-${pad(e.m1)}`;
  }
  const q = period.match(/^(\d{4})-Q([1-4])$/i);
  if (q) {
    const startM = (Number(q[2]) - 1) * 3 + 1;
    const e = addMonths(Number(q[1]), startM, delta * 3);
    return `${e.y}-Q${Math.floor((e.m1 - 1) / 3) + 1}`;
  }
  const yr = period.match(/^(\d{4})$/);
  if (yr) return String(Number(yr[1]) + delta);
  return period;
}
