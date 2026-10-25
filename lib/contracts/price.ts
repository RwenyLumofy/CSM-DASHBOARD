/* =========================================================================
   The user price a renewal, expansion or downgrade form starts from.

   Some terms carry a stored user price that doesn't give their licence ARR
   (9 of 48 live terms in the prod clone: neo space group has 200 licences at
   $133.33 but $17,608 of licence ARR). Recalculating ARR from that price makes
   a cut in licences look like growth, so when licences × stored price is more
   than 5% off the licence ARR, start from the effective price (licence ARR ÷
   licences) instead and keep the stored one to show alongside it.
   ========================================================================= */

/** How far licences × price may drift from licence ARR before the price is ignored. */
export const PRICE_TOLERANCE = 0.05;

export interface StartingPrice {
  /** The price to prefill, in the contract's currency, rounded to cents. */
  price: number;
  /** False when the stored price was replaced by the effective one. */
  matches: boolean;
  /** The stored price, for the hint when it doesn't match. */
  stored: number;
}

/**
 * @param licenceArr the term's licence ARR (support excluded), in the contract's currency
 * @param licences the licences in force
 * @param stored the term's stored user price, in the contract's currency
 */
export function startingUserPrice(licenceArr: number, licences: number | null, stored: number | null): StartingPrice {
  const s = stored ?? 0;
  if (!licences) return { price: s, matches: true, stored: s };
  const matches = Math.abs(s * licences - licenceArr) <= Math.max(licenceArr * PRICE_TOLERANCE, 1);
  const effective = Math.round((licenceArr / licences) * 100) / 100;
  return { price: matches ? s : effective, matches, stored: s };
}
