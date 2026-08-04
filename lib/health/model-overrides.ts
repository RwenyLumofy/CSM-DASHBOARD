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

/**
 * One tunable rule — a qualification gate or a status rule.
 *
 * Deliberately NOT a condition builder. An admin can turn a rule off, move the
 * number in it, and change where it caps to; they cannot author arbitrary
 * logic. The conditions encode what a signal MEANS ("renewal intent is
 * negative"), and letting that be retyped in a text box produces a model that
 * compiles and silently measures something else.
 */
export interface RuleOverride {
  enabled?: boolean;
  /** Replaces the single numeric bound in the rule's condition, when it has
   *  exactly one. Rules with no number, or more than one, are toggle-only. */
  threshold?: number;
  /** The status a cap/force lands on. Status rules only. */
  targetStatus?: string;
}

export interface HealthModelOverrides {
  /** id → percentage (0–100). Stored as percentages because that is what the
   *  editor shows; the model itself uses 0–1 fractions. */
  componentWeights?: Partial<Record<WeightedComponentId, number>>;
  /** Highest first. A score lands in the first band whose minScore it meets. */
  bands?: HealthBandOverride[];
  /** Qualification gate id → override. */
  gates?: Record<string, RuleOverride>;
  /** Status rule id → override. */
  rules?: Record<string, RuleOverride>;
  /** Share of enabled weight that must have data, 0–1. Below it the account is
   *  Not Assessed rather than scored on a fraction of the picture. */
  minCoverage?: number;
}

/** The numeric operators a threshold can live in, in the order we look. */
const NUM_OPS = ["gte", "gt", "lte", "lt"] as const;

/**
 * The single editable number in a condition set, or null when there isn't
 * exactly one. `{ cs_pulse_score: { gte: 75 } }` yields 75; a two-key condition
 * like the renewal-window rule yields null and stays toggle-only, because
 * "which of these two numbers did you mean" has no honest answer in a form.
 */
export function editableThreshold(when: Record<string, Record<string, unknown>>): number | null {
  const found: number[] = [];
  for (const cmp of Object.values(when ?? {})) {
    for (const op of NUM_OPS) {
      const v = (cmp as Record<string, unknown>)[op];
      if (typeof v === "number") found.push(v);
    }
  }
  return found.length === 1 ? found[0] : null;
}

/** Write a new bound back into whichever numeric operator the condition uses. */
function setThreshold(when: Record<string, Record<string, unknown>>, value: number): void {
  for (const cmp of Object.values(when ?? {})) {
    for (const op of NUM_OPS) {
      if (typeof (cmp as Record<string, unknown>)[op] === "number") {
        (cmp as Record<string, unknown>)[op] = value;
        return;
      }
    }
  }
}

function applyRuleOverride(
  rule: { id: string; isEnabled: boolean; when: Record<string, Record<string, unknown>>; targetStatus?: string },
  o: RuleOverride | undefined,
): void {
  if (!o) return;
  if (o.enabled != null) rule.isEnabled = o.enabled;
  if (o.threshold != null && editableThreshold(rule.when) != null) setThreshold(rule.when, o.threshold);
  if (o.targetStatus) rule.targetStatus = o.targetStatus;
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

  for (const g of model.qualificationRules) {
    applyRuleOverride(g as never, overrides.gates?.[g.id]);
  }
  for (const r of model.statusRules) {
    applyRuleOverride(r as never, overrides.rules?.[r.id]);
  }

  if (overrides.minCoverage != null) {
    model.minCoverageForAssessment = Math.max(0, Math.min(1, overrides.minCoverage));
  }

  return model;
}
