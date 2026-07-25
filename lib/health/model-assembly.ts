/* =============================================================================
   Model assembly — the CS Pulse component's sub-components are config (the
   admin-edited dimensions), so we build the scored model by grafting the current
   dimensions onto the base model version. Everything else (bands, rules,
   support/adoption/sentiment) stays as the published config. Weights within CS
   Pulse are normalised to sum to 1.0 so a partial edit can't distort the total.
   ============================================================================= */

import type { HealthComponent, HealthModelVersion } from "./model";
import { MODEL_V1_1 } from "./model-v1";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS, type PulseDimension, type RatingTier } from "./pulse";

/** Return a scored model whose CS Pulse children reflect `dimensions` and whose
 *  categorical ratings resolve via `tiers` — both admin-configurable. */
export function assembleModel(
  dimensions: PulseDimension[] = CS_PULSE_DIMENSIONS,
  tiers: RatingTier[] = CS_PULSE_TIERS,
  base: HealthModelVersion = MODEL_V1_1,
): HealthModelVersion {
  const ratingMap = Object.fromEntries(tiers.map((t) => [t.key, t.score]));
  const totalWeight = dimensions.reduce((a, d) => a + (d.weight || 0), 0) || 1;
  const children: HealthComponent[] = dimensions.map((d, i) => ({
    id: d.id,
    code: d.id,
    name: d.name,
    displayOrder: i + 1,
    weight: (d.weight || 0) / totalWeight,
    isEnabled: true,
    isMandatory: false,
    missingDataPolicy: "mark_not_assessed",
    formula: { type: "categorical_map", source_metric: d.metricKey, mapping: ratingMap },
  }));
  return {
    ...base,
    ratingScales: { ...base.ratingScales, cs_pulse: tiers },
    components: base.components.map((c) => (c.code === "cs_pulse" ? { ...c, children } : c)),
  };
}
