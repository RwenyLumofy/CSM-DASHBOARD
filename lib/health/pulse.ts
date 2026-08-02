/* =============================================================================
   CS Pulse — the single source of truth for the CSM's qualitative read:
   the rated dimensions (+ their rubrics), the risk signals, the stored shape
   (client.properties.cs_pulse), freshness, and the conversion into the engine's
   CsPulseInput. The capture form, the scoring service, and Settings all read
   this so they can never drift.
   ============================================================================= */

import type { CsPulseInput } from "./facts";
import type { RatingTier } from "./model";
import { CS_PULSE_TIERS } from "./model-v1";

export { CS_PULSE_TIERS };
export type { RatingTier };

/** Coerce stored/loaded JSON into a valid rating-tier scale (never throws).
 *  Falls back to the built-in Strong/Moderate/Weak/Critical. */
export function normalizeCsPulseTiers(raw: unknown): RatingTier[] {
  if (!Array.isArray(raw)) return CS_PULSE_TIERS;
  const seen = new Set<string>();
  const out: RatingTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) continue;
    const base = (typeof o.key === "string" && o.key.trim() ? o.key.trim() : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")) || "tier";
    let key = base; while (seen.has(key)) key = `${key}_2`;
    seen.add(key);
    out.push({ key, label, score: typeof o.score === "number" ? Math.max(0, Math.min(100, o.score)) : 0 });
  }
  return out.length ? out : CS_PULSE_TIERS;
}

/** A CS Pulse rating dimension with its rubric per tier key. Weights are the
 *  split WITHIN the CS Pulse component (must total 100). */
export interface PulseDimension {
  /** Stable id — also the key a stored pulse rating is filed under. */
  id: string;
  /** The rating metric key the model's categorical_map reads. */
  metricKey: string;
  name: string;
  weight: number;
  description: string;
  /** tier key → the guidance shown when that tier is selected. */
  rubric: Record<string, string>;
}

/** The starting CS Pulse dimensions (until an admin edits them in Settings). */
export const CS_PULSE_DIMENSIONS: PulseDimension[] = [
  {
    id: "stakeholder", metricKey: "stakeholder_coverage_rating", name: "Stakeholder Coverage", weight: 35,
    description: "Do we have the right relationships across the account — champion, economic buyer, admins, users — or are we leaning on one person?",
    rubric: {
      strong: "Multi-threaded across champion, economic buyer, admins & users; exec sponsor engaged.",
      moderate: "Solid working relationships, but thin at the exec / sponsor level.",
      weak: "Reliant on one or two contacts; no clear sponsor.",
      critical: "Single point of contact; no sponsor or economic-buyer access.",
    },
  },
  {
    id: "engagement", metricKey: "engagement_execution_rating", name: "Engagement & Execution", weight: 30,
    description: "Is the customer actively engaged (meetings, responsiveness) AND is the success plan actually moving (milestones hit, adoption on plan)?",
    rubric: {
      strong: "Attends QBRs, responsive; action items closed on time; adoption tracking to plan.",
      moderate: "Generally engaged; some slipped action items or timeline drift.",
      weak: "Missing meetings; action items stalling; adoption behind plan.",
      critical: "Gone dark; success plan stalled or abandoned.",
    },
  },
  {
    id: "renewal", metricKey: "renewal_readiness_rating", name: "Renewal Readiness", weight: 35,
    description: "How confident are we they'll renew — value realized, budget secure, no competitive threat?",
    rubric: {
      strong: "Clear renewal intent, budget secured, value realized; no competitive threat.",
      moderate: "Likely to renew, but the value case or budget isn't fully locked.",
      weak: "Renewal uncertain; value unclear or budget under pressure.",
      critical: "Active churn risk — negative intent, competitor in play, or no budget.",
    },
  },
];

/** Boolean risk-signal fields the CSM can flag. */
/* =========================================================================
   The pulse's qualitative signals, SPLIT BY POLARITY.

   These used to be one flat PULSE_SIGNALS list rendered as five identical
   checkboxes under a heading that said "Risk signals" — but two of them are
   the opposite of a risk. Ticking "Economic buyer known" is GOOD NEWS, and
   under that heading, next to "Champion left", it read as flagging a problem.
   The `risk` flag distinguishing them existed in this file all along and the
   UI ignored it. Two lists, so the UI cannot mix them up again.
   ========================================================================= */

/**
 * Bad news: a Yes here is the risk. Same three states as coverage below —
 * these were checkboxes, which was wrong for two reasons.
 *
 * `singleThreaded` is the sharp one: computeFacts falls back to a DERIVED
 * value when it's unanswered (`?? (primaryContactCount <= 1)`), i.e. "if the
 * CSM didn't say, read it off the contact record". A checkbox can't be
 * unanswered — unticked serialises as `false` — so that fallback could never
 * fire and an untouched box silently asserted "not single-threaded", beating
 * the system's own read of the data.
 *
 * For the other two, No and Not sure score identically (their rules fire on
 * `isTrue`), but "I checked and it isn't happening" and "I have no idea
 * whether a competitor is in here" are different things to record, and a
 * uniform control is easier to read than two kinds of input side by side.
 */
export const PULSE_RISK_FLAGS = [
  { id: "singleThreaded", fact: "single_threaded", ruleId: "r_single_threaded", capsTo: "Watch",
    name: "Single-threaded", desc: "Only one real stakeholder relationship" },
  { id: "championLeft", fact: "champion_left", ruleId: "r_champion_left", capsTo: "Watch",
    name: "Champion left", desc: "Champion gone without a replacement" },
  { id: "competitiveReplacement", fact: "competitive_replacement", ruleId: "r_competitor", capsTo: "At Risk",
    name: "Competitive replacement underway", desc: "A credible competitor process is active" },
] as const;

/**
 * Relationship coverage. THREE-STATE, not a checkbox, because "we don't know"
 * and "no" are different facts that the engine scores differently:
 *
 *   yes      → the coverage exists; no rule fires
 *   no       → r_no_sponsor / r_renewal_eb_unknown cap the account to Watch
 *   unknown  → nothing fires; the question is simply unanswered
 *
 * A checkbox could only express yes/no, so leaving one untouched was recorded
 * as an affirmative "no" and quietly capped the account. See normalizePulse.
 */
export const PULSE_COVERAGE = [
  { id: "sponsorAccess", fact: "sponsor_access", ruleId: "r_no_sponsor", capsTo: "Watch",
    name: "Sponsor / economic-buyer access", desc: "Can we reach a credible sponsor?", capWhen: null },
  { id: "economicBuyerKnown", fact: "economic_buyer_known", ruleId: "r_renewal_eb_unknown", capsTo: "Watch",
    name: "Economic buyer known", desc: "Do we know who signs the renewal?",
    // This rule is conditional: it only fires inside the renewal window.
    capWhen: "only within 90 days of renewal" },
] as const;

export const PULSE_VALIDITY_DAYS = 30;

/** The tier a rating key resolves to. */
export const findTier = (tiers: RatingTier[], k: string | undefined) => tiers.find((t) => t.key === k);

/**
 * The Pulse as a single 0–100 score: each dimension's tier score, weighted by
 * that dimension's weight.
 *
 * Null when ANY dimension is unrated — a half-filled Pulse is not a weaker
 * Pulse, it is an unfinished one, and averaging what happens to be there would
 * quietly invent a reading the CSM never gave.
 *
 * Lives here rather than in the drawer that renders it: this is now an input to
 * the client health score (lib/metrics/health.ts, metric `cs_pulse`), and the
 * repo layer that computes health cannot import a "use client" component.
 */
export function pulseScore(
  ratings: Record<string, string | undefined>,
  dimensions: PulseDimension[],
  tiers: RatingTier[],
): number | null {
  if (!dimensions.length || !dimensions.every((d) => ratings[d.id])) return null;
  let tot = 0, w = 0;
  for (const d of dimensions) { tot += (findTier(tiers, ratings[d.id])?.score ?? 0) * d.weight; w += d.weight; }
  return w ? Math.round(tot / w) : null;
}

/** What we persist on client.properties.cs_health — the last computed score, so
 *  list/dashboard reads are cheap and momentum has a baseline to compare to. */
export interface StoredHealth {
  score: number | null;
  band: string | null;
  status: string;
  computedAt: string; // ISO
}

export function normalizeStoredHealth(raw: unknown): StoredHealth | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.computedAt !== "string") return null;
  return {
    score: typeof o.score === "number" ? o.score : null,
    band: typeof o.band === "string" ? o.band : null,
    status: typeof o.status === "string" ? o.status : "Not Assessed",
    computedAt: o.computedAt,
  };
}

/** What we persist on client.properties.cs_pulse. */
export interface StoredPulse {
  ratings: Record<string, string>; // dimension id → tier key
  signals: {
    singleThreaded?: boolean;
    championLeft?: boolean;
    sponsorAccess?: boolean;
    economicBuyerKnown?: boolean;
    competitiveReplacement?: boolean;
    renewalIntent?: "positive" | "neutral" | "negative" | null;
  };
  updatedAt: string; // ISO
  updatedByEmail?: string | null;
}

/** Is a pulse complete (every configured dimension rated)? Only then can CS
 *  Pulse score. Dimensions default to the built-ins but come from config. */
export function isPulseComplete(p: StoredPulse | null | undefined, dimensions: PulseDimension[] = CS_PULSE_DIMENSIONS): boolean {
  return !!p && dimensions.length > 0 && dimensions.every((d) => !!p.ratings[d.id]);
}

/** Age of a pulse in whole days, or null if none. */
export function pulseAgeDays(p: StoredPulse | null | undefined, now = Date.now()): number | null {
  if (!p?.updatedAt) return null;
  return Math.floor((now - new Date(p.updatedAt).getTime()) / 86_400_000);
}

/** Fresh = complete and within the validity window. A stale pulse is treated as
 *  absent by the engine (CS Pulse is mandatory → account goes Not Assessed). */
export function isPulseFresh(p: StoredPulse | null | undefined, dimensions: PulseDimension[] = CS_PULSE_DIMENSIONS, now = Date.now()): boolean {
  const age = pulseAgeDays(p, now);
  return isPulseComplete(p, dimensions) && age != null && age <= PULSE_VALIDITY_DAYS;
}

/** Parse arbitrary stored JSON into a StoredPulse (never throws). */
export function normalizePulse(raw: unknown): StoredPulse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ratings: StoredPulse["ratings"] = {};
  const r = (o.ratings ?? {}) as Record<string, unknown>;
  // Keep any rating keyed by a dimension id — dimensions are dynamic config.
  for (const [k, v] of Object.entries(r)) if (typeof v === "string") ratings[k] = v;
  const s = (o.signals ?? {}) as Record<string, unknown>;
  /* Coverage answers keep their THIRD state. Collapsing these to `=== true`
     was a scoring bug, not just a typing shortcut: computeFacts does
     `p?.sponsorAccess ?? null` precisely so an unanswered question stays null
     and its `isFalse` rule can't fire (see the comment there) — but a boolean
     coercion here meant the `?? null` could never trigger, so "nobody
     answered" arrived at the engine as an affirmative "no" and capped the
     account to Watch. Undefined has to survive this function. */
  const triState = (v: unknown): boolean | undefined =>
    v === true ? true : v === false ? false : undefined;
  return {
    ratings,
    signals: {
      singleThreaded: triState(s.singleThreaded),
      championLeft: triState(s.championLeft),
      competitiveReplacement: triState(s.competitiveReplacement),
      sponsorAccess: triState(s.sponsorAccess),
      economicBuyerKnown: triState(s.economicBuyerKnown),
      renewalIntent: (["positive", "neutral", "negative"].includes(s.renewalIntent as string) ? s.renewalIntent : null) as StoredPulse["signals"]["renewalIntent"],
    },
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date(0).toISOString(),
    updatedByEmail: typeof o.updatedByEmail === "string" ? o.updatedByEmail : null,
  };
}

/** Map a fresh StoredPulse into the engine's CsPulseInput — one categorical
 *  rating per configured dimension (keyed by its metric key). Returns null when
 *  the pulse is stale/incomplete, so the engine sees CS Pulse as missing. */
export function pulseToEngineInput(p: StoredPulse | null | undefined, dimensions: PulseDimension[] = CS_PULSE_DIMENSIONS, now = Date.now()): CsPulseInput | null {
  if (!isPulseFresh(p, dimensions, now) || !p) return null;
  const ratingsByMetricKey: Record<string, string> = {};
  for (const d of dimensions) { const t = p.ratings[d.id]; if (t) ratingsByMetricKey[d.metricKey] = t; }
  return {
    ratingsByMetricKey,
    singleThreaded: p.signals.singleThreaded,
    championLeft: p.signals.championLeft,
    sponsorAccess: p.signals.sponsorAccess,
    economicBuyerKnown: p.signals.economicBuyerKnown,
    competitiveReplacement: p.signals.competitiveReplacement,
    renewalIntent: p.signals.renewalIntent,
  };
}

/** Coerce stored/loaded JSON into a valid dimensions list (never throws). Drops
 *  malformed entries; returns the built-in defaults if nothing usable. */
export function normalizeCsPulseDimensions(raw: unknown): PulseDimension[] {
  if (!Array.isArray(raw)) return CS_PULSE_DIMENSIONS;
  const seen = new Set<string>();
  const out: PulseDimension[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const slug = (typeof o.id === "string" && o.id.trim() ? o.id.trim() : name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")) || "dim";
    let id = slug; while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    out.push({
      id,
      metricKey: typeof o.metricKey === "string" && o.metricKey.trim() ? o.metricKey.trim() : `${id}_rating`,
      name,
      weight: typeof o.weight === "number" && o.weight >= 0 ? o.weight : 0,
      description: typeof o.description === "string" ? o.description : "",
      rubric: (o.rubric && typeof o.rubric === "object" ? o.rubric : {}) as Record<string, string>,
    });
  }
  return out.length ? out : CS_PULSE_DIMENSIONS;
}
