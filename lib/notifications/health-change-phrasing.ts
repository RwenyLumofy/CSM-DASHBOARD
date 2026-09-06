/* =========================================================================
   How a health tier move is worded, and which way it counts as having gone.

   Split out of health-change-sync.ts purely so it can be tested: the sync is
   "server-only" and reaches the database, while this is the part with the
   actual decisions in it.
   ========================================================================= */

/** The fields of a tier move that affect wording. Structural on purpose —
 *  repo's HealthTierTransition satisfies it without this module importing
 *  anything from the data layer. */
export interface TierMove {
  clientName: string;
  fromTier: string;
  toTier: string;
  fromScore: number | null;
  toScore: number;
}

/**
 * Which way the account moved.
 *
 * Decided on the SCORE, not the tier names. Tiers are admin-defined free
 * strings that can be renamed, reordered or deleted in Settings → Client
 * health, so "At risk" cannot be ranked against "Healthy" by name — only the
 * 0–100 score is comparable across a config change.
 *
 * "level" is a real case, not a defensive branch: a Critical CS Pulse rating
 * caps the tier while deliberately leaving the score untouched (see
 * PULSE_CRITICAL_CAPS in lib/metrics/health.ts), so an account genuinely can
 * change band on an unchanged score.
 */
export function direction(m: TierMove): "up" | "down" | "level" {
  if (m.fromScore === null || m.fromScore === m.toScore) return "level";
  return m.toScore > m.fromScore ? "up" : "down";
}

/** Title and body for a tier move. The direction is carried in words, so the
 *  row still reads correctly with no colour and no icon. */
export function describeTransition(m: TierMove): { title: string; body: string } {
  const dir = direction(m);
  const verb = dir === "up" ? "improved to" : dir === "down" ? "dropped to" : "moved to";
  const delta = m.fromScore === null ? `Now scoring ${m.toScore}.` : `Score ${m.fromScore} → ${m.toScore}.`;
  return {
    title: `${m.clientName} ${verb} ${m.toTier}`,
    body: `Health tier changed from ${m.fromTier} to ${m.toTier}. ${delta}`,
  };
}
