/* =========================================================================
   Contract ledger — how an account's ARR is read from its contract records.

   Not wired into the product yet: the contract-history prototype
   (app/(app)/scratch-contracts) uses it, and the real contract-record build is
   meant to reuse it. The rules it pins, each covered by ledger.test.ts:

     - A sale or renewal SETS ARR to that contract's annual value. A renewal
       replaces the term before it; it is never added to it. (A one-year deal
       renewed for a second year is that second year's value, not the sum.)
     - A contract's annual value is its licence ARR plus its annual support
       amount, when a support amount is recorded. HubSpot deal amounts do not
       include support (confirmed with CS, 2026-10-08), so support is added on
       top rather than carved out of the deal amount.
     - Contracts starting the same day are one contract split across deals,
       so they add up.
     - Expansions add and downgrades subtract until the next sale or renewal.
     - A churn takes ARR to zero (a churn deal a few dollars short of the
       contract counts as a full churn).
     - A multi-year contract priced per year steps to each year's value on its
       anniversary, only while it is still the contract in force.
     - Records not counted (deals CS unticked) are history and move nothing.
     - Everything is summed in US dollars. BHD and SAR are pegged to the
       dollar, so the conversion uses the fixed peg rates.
   ========================================================================= */

export type Currency = "USD" | "BHD" | "SAR";
export const CURRENCIES: Currency[] = ["USD", "BHD", "SAR"];

/** US dollars per one unit. BHD is pegged at 0.376 per USD and SAR at 3.75 per USD. */
export const USD_PER: Record<Currency, number> = { USD: 1, BHD: 1 / 0.376, SAR: 1 / 3.75 };
export const toUSD = (amount: number, ccy: Currency = "USD") => amount * USD_PER[ccy];

export type LedgerKind = "sale" | "renewal" | "expansion" | "downgrade" | "churn";

/** The fields of a contract record the ledger reads. */
export interface LedgerRecord {
  id: string;
  kind: LedgerKind;
  /** When the record takes effect (YYYY-MM-DD). */
  start: string | null;
  /** sale / renewal: licence ARR for year 1. expansion / downgrade: the change. churn: ARR lost (0 = all). */
  amount: number;
  licences: number | null;
  currency?: Currency;
  /** Multi-year contracts priced per year: licence ARR for year 1, 2, 3… (`amount` is year 1). */
  yearAmounts?: number[];
  /** Annual support fee on a sale or renewal; part of the contract's annual value. */
  supportAmount?: number | null;
  /** false = history only (a deal CS unticked). */
  counted?: boolean;
}

export interface LedgerRow<T extends LedgerRecord> {
  r: T;
  /** ARR in USD before and after this row. */
  before: number;
  after: number;
  licences: number;
  /** Set on an anniversary step of a multi-year contract (1 = start of year 2). */
  step?: number;
}

export function addYears(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

/** A sale's or renewal's annual value in USD for a given contract year (0-based). */
export function contractValueUSD(r: LedgerRecord, year = 0): number {
  const licence = r.yearAmounts && r.yearAmounts.length > year ? r.yearAmounts[year] : r.amount;
  return toUSD(licence + (r.supportAmount ?? 0), r.currency);
}

/**
 * Running ARR after each record, oldest first, in US dollars. Pass `asOf` to
 * read the ledger as of a date: anniversary steps after it are left out (filter
 * the records themselves by start date to leave out later records).
 */
export function withArr<T extends LedgerRecord>(records: T[], asOf?: string): LedgerRow<T>[] {
  type Ev = { r: T; date: string; step?: number };
  const evs: Ev[] = [];
  for (const r of records) {
    evs.push({ r, date: r.start ?? "" });
    if (r.counted !== false && r.start && r.yearAmounts && r.yearAmounts.length > 1) {
      for (let k = 1; k < r.yearAmounts.length; k++) {
        const d = addYears(r.start, k);
        if (!asOf || d <= asOf) evs.push({ r, date: d, step: k });
      }
    }
  }
  evs.sort((a, b) => a.date.localeCompare(b.date) || (a.step ? 1 : 0) - (b.step ? 1 : 0));

  let arr = 0;
  let licences = 0;
  let baseDate: string | null = null;
  let baseId: string | null = null;
  return evs.map(({ r, step }) => {
    const before = arr;
    if (step) {
      // Only the contract still in force steps up; a later renewal or a churn ends it.
      if (baseId === r.id && arr > 0) arr += contractValueUSD(r, step) - contractValueUSD(r, step - 1);
      return { r, before, after: arr, licences, step };
    }
    if (r.counted === false) return { r, before, after: arr, licences };
    if (r.kind === "sale" || r.kind === "renewal") {
      if (baseDate && r.start === baseDate) {
        arr += contractValueUSD(r); // same-day contracts are one contract split across deals
        licences += r.licences ?? 0;
      } else {
        arr = contractValueUSD(r); // a new term replaces the one before it
        licences = r.licences ?? licences;
        baseDate = r.start;
        baseId = r.id;
      }
    } else if (r.kind === "expansion" || r.kind === "downgrade") {
      arr += toUSD(r.amount, r.currency);
      licences += r.licences ?? 0;
    } else {
      arr = r.amount > 0 ? arr - toUSD(r.amount, r.currency) : 0;
      if (arr <= 10) { arr = 0; licences = 0; baseId = null; }
    }
    return { r, before, after: arr, licences };
  });
}

/** ARR in USD on a date: only records that have started by then, read as of then. */
export function arrOn<T extends LedgerRecord>(records: T[], date: string): number {
  const rows = withArr(records.filter((r) => r.counted !== false && (!r.start || r.start <= date)), date);
  return rows.length ? rows[rows.length - 1].after : 0;
}
