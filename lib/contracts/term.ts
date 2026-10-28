/* =========================================================================
   A contract term's dates.

   A term that starts 1 Jan 2026 for one year runs to 31 Dec 2026, and that
   last day is its renewal date. It is not 1 Jan 2027: that date falls in the
   next quarter, so a +1 year renewal moved year-end renewals into Q1 and threw
   quarterly numbers and forecasts off (decided 2026-10-28, Gulf Air renews
   31 Dec). The term that renews it starts the day after.
   ========================================================================= */

/** YYYY-MM-DD plus `n` days (negative to go back). */
export function shiftDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus `n` calendar months. */
export function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** The renewal date of a term that starts on `start` and runs `months`: its last day. */
export function renewalAfterMonths(start: string, months: number): string {
  return shiftDays(addMonths(start, months), -1);
}

/** The renewal date of a term that starts on `start` and runs `years`: its last day. */
export function renewalFor(start: string, years = 1): string {
  return renewalAfterMonths(start, years * 12);
}

/** The day a renewal of this term takes effect: the day after its renewal date. */
export function nextTermStart(renewal: string): string {
  return shiftDays(renewal, 1);
}

/** Whole months from `start` through `renewal`, the term's last day. */
export function termMonths(start: string, renewal: string): number {
  const days = (Date.parse(`${nextTermStart(renewal)}T00:00:00Z`) - Date.parse(`${start.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return Math.round(days / 30.44);
}
