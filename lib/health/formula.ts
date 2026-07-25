/* =============================================================================
   Safe formula engine. Interprets validated, structured Formula config into a
   0–100 score (or null = missing). NO eval / Function / runtime code — only the
   closed set of formula types and comparison operators defined in model.ts.
   ============================================================================= */

import type { Comparison, ConditionSet, Formula, MetricBag, MetricInput } from "./model";

export type Scalar = number | string | boolean | null;

const clamp = (n: number, min?: number, max?: number): number => {
  let v = n;
  if (typeof min === "number") v = Math.max(v, min);
  if (typeof max === "number") v = Math.min(v, max);
  return v;
};

/** Round to 3 dp so score-band boundaries (e.g. 64.999) are deterministic. */
export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The scalar a condition compares against for a metric key: an explicit
 *  boolean, else a category string, else the numeric value. */
function metricScalar(metrics: MetricBag, key: string): Scalar {
  const m = metrics[key];
  if (!m || m.isValid === false) return null;
  if (m.boolean != null) return m.boolean;
  if (m.categorical != null) return m.categorical;
  return m.value;
}

/** Evaluate one Comparison against a resolved scalar. Multiple operators on a
 *  single comparison are AND-ed. Missing/non-numeric facts fail numeric ops. */
export function matchComparison(fact: Scalar, c: Comparison): boolean {
  if (c.present !== undefined) return (fact != null) === c.present;
  if (c.isTrue) return fact === true;
  if (c.isFalse) return fact === false;
  if (c.eq !== undefined && fact !== c.eq) return false;
  if (c.ne !== undefined && fact === c.ne) return false;
  if (c.in !== undefined && !(typeof fact !== "object" && fact !== null && c.in.includes(fact as number | string))) return false;
  const numOps = c.gte ?? c.gt ?? c.lte ?? c.lt;
  if (numOps !== undefined) {
    if (typeof fact !== "number") return false;
    if (c.gte !== undefined && !(fact >= c.gte)) return false;
    if (c.gt !== undefined && !(fact > c.gt)) return false;
    if (c.lte !== undefined && !(fact <= c.lte)) return false;
    if (c.lt !== undefined && !(fact < c.lt)) return false;
  }
  return true;
}

/** Every key's comparison must hold (AND). `resolve` maps a key to its scalar. */
export function matchConditionSet(resolve: (key: string) => Scalar, when: ConditionSet): boolean {
  for (const [key, cmp] of Object.entries(when)) {
    if (!matchComparison(resolve(key), cmp)) return false;
  }
  return true;
}

export interface FormulaResult {
  score: number | null;
  missing: boolean;
  reason?: string;
}

const num = (m: MetricInput | undefined): number | null => (m && m.isValid !== false ? m.value : null);

/** Evaluate a formula against the metric bag. Returns a 0–100 score, or missing
 *  when required inputs are absent (respecting each formula's declared policy). */
export function evalFormula(formula: Formula, metrics: MetricBag): FormulaResult {
  const resolve = (k: string) => metricScalar(metrics, k);
  const avgAvailable = (keys: string[]) => {
    const vals = keys.map((k) => num(metrics[k])).filter((v): v is number => v != null);
    return vals.length ? { vals } : null;
  };

  switch (formula.type) {
    case "constant":
      return { score: round3(formula.value), missing: false };

    case "constant_if":
      return { score: round3(matchConditionSet(resolve, formula.when) ? formula.value : formula.else_value), missing: false };

    case "ratio":
    case "stage_adjusted_ratio": {
      const nKey = formula.type === "ratio" ? formula.numerator_metric : formula.actual_metric;
      const dKey = formula.type === "ratio" ? formula.denominator_metric : formula.expected_metric;
      const n = num(metrics[nKey]);
      const d = num(metrics[dKey]);
      const mult = formula.multiplier ?? 100;
      if (n == null || d == null) return { score: null, missing: true, reason: "numerator or denominator missing" };
      if (d === 0) {
        switch (formula.zero_denominator_policy) {
          case "score_zero": return { score: clamp(0, formula.minimum, formula.maximum), missing: false, reason: "zero denominator → 0" };
          case "score_full": return { score: clamp(100, formula.minimum, formula.maximum), missing: false, reason: "zero denominator → full" };
          case "not_applicable":
          case "use_fallback":
          case "missing":
          default: return { score: null, missing: true, reason: "zero denominator" };
        }
      }
      return { score: round3(clamp((n / d) * mult, formula.minimum ?? 0, formula.maximum ?? 100)), missing: false };
    }

    case "percentage": {
      const v = num(metrics[formula.source_metric]);
      if (v == null) return { score: null, missing: true };
      return { score: round3(clamp(v, formula.minimum ?? 0, formula.maximum ?? 100)), missing: false };
    }

    case "categorical_map": {
      const c = metrics[formula.source_metric]?.categorical ?? null;
      if (c == null) return { score: null, missing: true, reason: "no category" };
      const s = formula.mapping[c];
      if (s == null) return { score: null, missing: true, reason: `unmapped category "${c}"` };
      return { score: round3(s), missing: false };
    }

    case "boolean_map": {
      const b = metrics[formula.source_metric]?.boolean ?? null;
      if (b == null) return { score: null, missing: true, reason: "no boolean value" };
      return { score: round3(b ? formula.true_score : formula.false_score), missing: false };
    }

    case "threshold_table": {
      for (const rule of formula.rules) {
        if (matchConditionSet(resolve, rule.when)) return { score: round3(rule.score), missing: false };
      }
      return { score: round3(formula.default_score), missing: false };
    }

    case "weighted_average": {
      const avail = formula.inputs.map((i) => ({ w: i.weight, v: num(metrics[i.metric]) })).filter((x) => x.v != null) as { w: number; v: number }[];
      const wSum = avail.reduce((s, x) => s + x.w, 0);
      if (!avail.length || wSum <= 0) return { score: null, missing: true };
      return { score: round3(avail.reduce((s, x) => s + x.v * (x.w / wSum), 0)), missing: false };
    }

    case "simple_average": {
      const a = avgAvailable(formula.metrics);
      if (!a) return { score: null, missing: true };
      return { score: round3(a.vals.reduce((s, v) => s + v, 0) / a.vals.length), missing: false };
    }

    case "minimum": {
      const a = avgAvailable(formula.metrics);
      return a ? { score: round3(Math.min(...a.vals)), missing: false } : { score: null, missing: true };
    }
    case "maximum": {
      const a = avgAvailable(formula.metrics);
      return a ? { score: round3(Math.max(...a.vals)), missing: false } : { score: null, missing: true };
    }
    case "sum": {
      const a = avgAvailable(formula.metrics);
      return a ? { score: round3(a.vals.reduce((s, v) => s + v, 0)), missing: false } : { score: null, missing: true };
    }
    case "count": {
      const c = formula.metrics.filter((k) => num(metrics[k]) != null).length;
      return { score: c, missing: false };
    }

    case "latest_valid_value": {
      for (const k of formula.metrics) {
        const v = num(metrics[k]);
        if (v != null) return { score: round3(v), missing: false };
      }
      return { score: null, missing: true };
    }

    default: {
      // Exhaustiveness guard — a new formula type must be handled explicitly.
      const _never: never = formula;
      return { score: null, missing: true, reason: `unknown formula ${(_never as { type: string }).type}` };
    }
  }
}
