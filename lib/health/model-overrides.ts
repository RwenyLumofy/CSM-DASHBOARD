/* =========================================================================
   The admin-editable parts of the health model: the four top-level component
   weights, and the bands a score lands in.

   Everything else in MODEL_V1_1 — the formulas, the qualification gates, the
   status rules — stays in code, because those encode judgement that a weight
   slider cannot express and that changing casually would break the model's
   own guarantees.

   Pure. The DB read/write lives in model-overrides-store.ts so client
   components can import these types and the merge without pulling a
   server-only module into their bundle.
   ========================================================================= */

import { MODEL_V1_1 } from "./model-v1";
import type { HealthModelVersion } from "./model";

export const HEALTH_MODEL_OVERRIDE_KEY = "health_model_overrides";

/** Component ids that carry a weight. Anything not listed keeps its shipped
 *  weight, so adding a component to the model later cannot silently zero it. */
export const WEIGHTED_COMPONENT_IDS = ["product", "pulse", "support", "sentiment"] as const;
export type WeightedComponentId = (typeof WEIGHTED_COMPONENT_IDS)[number];

export interface HealthBandOverride {
  name: string;
  minScore: number;
}

export interface HealthModelOverrides {
  /** id → percentage (0–100). Stored as percentages because that is what the
   *  editor shows; the model itself uses 0–1 fractions. */
  componentWeights?: Partial<Record<WeightedComponentId, number>>;
  /** Highest first. A score lands in the first band whose minScore it meets. */
  bands?: HealthBandOverride[];
}

/** The shipped weights as percentages — what the editor starts from. */
export function defaultComponentWeights(): Record<WeightedComponentId, number> {
  const out = {} as Record<WeightedComponentId, number>;
  for (const id of WEIGHTED_COMPONENT_IDS) {
    out[id] = Math.round((MODEL_V1_1.components.find((c) => c.id === id)?.weight ?? 0) * 1000) / 10;
  }
  return out;
}

export function defaultBands(): HealthBandOverride[] {
  return [...MODEL_V1_1.bands]
    .sort((a, b) => b.minScore - a.minScore)
    .map((b) => ({ name: b.name, minScore: b.minScore }));
}

/**
 * Apply stored overrides to a model.
 *
 * Weights are normalised to sum to 1.0 rather than trusting the input: the
 * engine's redistribution maths assumes the enabled top-level weights total 1,
 * and a half-finished edit saved at 90% would quietly inflate every score.
 * Bands are rebuilt with contiguous maxScore values so no score can fall
 * between two bands — the gaps are what the "exactly one band" test pins.
 */
export function applyModelOverrides(
  base: HealthModelVersion,
  overrides: HealthModelOverrides | null | undefined,
): HealthModelVersion {
  if (!overrides) return base;
  const model: HealthModelVersion = structuredClone(base);

  const w = overrides.componentWeights;
  if (w && Object.keys(w).length) {
    const pct = (id: string) =>
      (WEIGHTED_COMPONENT_IDS as readonly string[]).includes(id) && w[id as WeightedComponentId] != null
        ? w[id as WeightedComponentId]!
        : Math.round((base.components.find((c) => c.id === id)?.weight ?? 0) * 1000) / 10;
    const total = model.components.filter((c) => c.isEnabled).reduce((s, c) => s + pct(c.id), 0);
    if (total > 0) {
      for (const c of model.components) c.weight = pct(c.id) / total;
    }
  }

  if (overrides.bands?.length) {
    const sorted = [...overrides.bands].sort((a, b) => b.minScore - a.minScore);
    model.bands = sorted.map((b, i) => ({
      name: b.name,
      minScore: b.minScore,
      // Butt each band against the next one up, so the ranges are contiguous.
      maxScore: i === 0 ? 100 : sorted[i - 1].minScore - 0.001,
    }));
  }

  return model;
}
