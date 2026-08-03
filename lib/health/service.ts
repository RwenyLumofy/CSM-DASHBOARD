/* =============================================================================
   Scoring service — the seam between the app's data and the pure engine. Takes
   already-fetched account data (usage/support/sentiment) + the stored pulse and
   returns the full explainable result. Kept free of DB imports so the profile
   (single account) and the dashboard (bulk) paths can both feed it, and so it
   stays unit-testable.
   ============================================================================= */

import { buildAccountFacts } from "./facts";
import { calculateAccountHealth } from "./engine";
import { assembleModel } from "./model-assembly";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS, normalizePulse, pulseToEngineInput, type PulseDimension, type RatingTier } from "./pulse";
import type { AccountHealthResult } from "./model";
import { applyModelOverrides, type HealthModelOverrides } from "./model-overrides";

export interface ScoreAccountInput {
  clientId: string;
  status: string; // onboarding | active | renewal | churned
  renewalDate?: string | null;
  usage?: Record<string, number | null> | null; // usage snapshot metrics
  support?: { csat?: number | null; csatResponses?: number | null; nps?: number | null } | null;
  sentimentNps?: number | null; // survey NPS (-100..100)
  primaryContactCount?: number | null;
  pulseRaw?: unknown; // client.properties.cs_pulse (raw JSON)
  previousScore?: number | null;
  previousCalculationDate?: string | null;
}

/** Score one account on the current model, with CS Pulse dimensions grafted in
 *  from config (defaults to the built-in three). */
export function scoreAccount(
  input: ScoreAccountInput,
  dimensions: PulseDimension[] = CS_PULSE_DIMENSIONS,
  tiers: RatingTier[] = CS_PULSE_TIERS,
  now = new Date(),
  /** Admin-edited component weights and bands. Null = the shipped model. */
  overrides: HealthModelOverrides | null = null,
): AccountHealthResult {
  const pulse = normalizePulse(input.pulseRaw);
  const facts = buildAccountFacts(
    {
      clientId: input.clientId,
      status: input.status,
      renewalDate: input.renewalDate ?? null,
      usage: input.usage ?? null,
      support: input.support ?? null,
      sentimentNps: input.sentimentNps ?? null,
      primaryContactCount: input.primaryContactCount ?? null,
      pulse: pulseToEngineInput(pulse, dimensions, now.getTime()),
      previousScore: input.previousScore ?? null,
      previousCalculationDate: input.previousCalculationDate ?? null,
    },
    now,
  );
  return calculateAccountHealth(applyModelOverrides(assembleModel(dimensions, tiers), overrides), facts, now.toISOString());
}
