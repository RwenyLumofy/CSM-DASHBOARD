/* Expansion — presentation helpers. Kept out of ./attention.ts so the rule
   stays pure logic, and out of the components so the board, the list, the
   record and the client profile all render a figure the same way.

   Money is written the way the board reads it: compact on cards and column
   headers where the shape of the pipeline matters, exact in the record and in
   any total that has to add up. */

const SYMBOL: Record<string, string> = { USD: "$", SAR: "SAR ", BHD: "BHD " };
const symbol = (currency: string) => SYMBOL[currency] ?? `${currency} `;

/** Compact — "$117K". Null renders as an em dash: an unsized opportunity is a
 *  legitimate state (see the Arla POKA row), never a zero. */
export function money(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  const n = Math.round(value);
  return `${symbol(currency)}${Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}K` : n}`;
}

/** Exact — "$116,550". */
export function moneyFull(value: number | null | undefined, currency = "USD"): string {
  if (value == null) return "—";
  return `${symbol(currency)}${Math.round(value).toLocaleString("en-US")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Accepts a "YYYY-MM-DD" date or a full ISO instant — both are read as the
 *  calendar day in UTC, so a close date never shifts by a timezone. */
function utcDay(iso: string): Date | null {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "13 Aug 2026". */
export function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = utcDay(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "—";
}

/** "13 Aug". */
export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = utcDay(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "—";
}

/** Up to two initials from a display name. */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

/** First name only — the list and the card have no room for more. */
export function firstNameOf(name: string | null | undefined): string {
  return name?.split(/\s+/)[0] ?? "Unassigned";
}
