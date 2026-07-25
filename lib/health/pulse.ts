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
export const PULSE_SIGNALS = [
  { id: "singleThreaded", name: "Single-threaded", desc: "Only one real stakeholder relationship", risk: true },
  { id: "championLeft", name: "Champion left", desc: "Champion gone without a replacement", risk: true },
  { id: "sponsorAccess", name: "Sponsor / economic-buyer access", desc: "We can reach a credible sponsor", risk: false },
  { id: "economicBuyerKnown", name: "Economic buyer known", desc: "We know who signs the renewal", risk: false },
  { id: "competitiveReplacement", name: "Competitive replacement underway", desc: "A credible competitor process is active", risk: true },
] as const;

export const PULSE_VALIDITY_DAYS = 30;

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
  return {
    ratings,
    signals: {
      singleThreaded: s.singleThreaded === true,
      championLeft: s.championLeft === true,
      sponsorAccess: s.sponsorAccess === true,
      economicBuyerKnown: s.economicBuyerKnown === true,
      competitiveReplacement: s.competitiveReplacement === true,
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
