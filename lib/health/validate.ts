/* =============================================================================
   Publish-time validation (§9, §11, §15). A draft may only be published when it
   is structurally sound: weights total 100%, bands tile 0–100 without gaps or
   overlaps, formulas are well-formed, no duplicate/circular component ids, and
   every rule targets a real status. Returns human-readable errors, never throws.
   ============================================================================= */

import type { Formula, HealthComponent, HealthModelVersion } from "./model";

const EPS = 1e-6;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

function validateFormula(f: Formula, path: string, errors: string[]) {
  const inRange = (n: number) => n >= 0 && n <= 100;
  switch (f.type) {
    case "ratio":
    case "stage_adjusted_ratio":
      if (!f.zero_denominator_policy) errors.push(`${path}: ratio needs a zero_denominator_policy`);
      break;
    case "categorical_map":
      if (!Object.keys(f.mapping).length) errors.push(`${path}: categorical_map has an empty mapping`);
      Object.entries(f.mapping).forEach(([k, v]) => { if (!inRange(v)) errors.push(`${path}: mapping "${k}" = ${v} out of 0–100`); });
      break;
    case "boolean_map":
      if (!inRange(f.true_score) || !inRange(f.false_score)) errors.push(`${path}: boolean_map scores out of 0–100`);
      break;
    case "threshold_table":
      if (!f.rules.length) errors.push(`${path}: threshold_table has no rules`);
      if (typeof f.default_score !== "number") errors.push(`${path}: threshold_table needs a default_score`);
      break;
    case "weighted_average":
      if (f.inputs.some((i) => i.weight <= 0)) errors.push(`${path}: weighted_average has non-positive weights`);
      break;
    default:
      break;
  }
}

function validateComponents(components: HealthComponent[], path: string, errors: string[], seenIds: Set<string>) {
  const enabled = components.filter((c) => c.isEnabled);
  const weightSum = enabled.reduce((s, c) => s + c.weight, 0);
  if (enabled.length && !near(weightSum, 1)) {
    errors.push(`${path}: enabled child weights total ${(weightSum * 100).toFixed(1)}%, must be 100%`);
  }
  for (const c of components) {
    if (seenIds.has(c.id)) errors.push(`Duplicate component id "${c.id}"`);
    seenIds.add(c.id);
    const p = `${path}/${c.code}`;
    if (c.children && c.children.length) {
      if (c.formula) errors.push(`${p}: a branch component must not also have a formula`);
      validateComponents(c.children, p, errors, seenIds);
    } else if (c.formula) {
      validateFormula(c.formula, p, errors);
    } else if (c.isEnabled) {
      errors.push(`${p}: leaf component has no formula`);
    }
  }
}

function validateBands(model: HealthModelVersion, errors: string[]) {
  const bands = [...model.bands].sort((a, b) => a.minScore - b.minScore);
  if (!bands.length) { errors.push("No health bands defined"); return; }
  const names = new Set<string>();
  for (const b of bands) {
    if (names.has(b.name)) errors.push(`Duplicate band name "${b.name}"`);
    names.add(b.name);
    if (b.minScore > b.maxScore) errors.push(`Band "${b.name}" has min > max`);
    if (b.minScore < 0 || b.maxScore > 100) errors.push(`Band "${b.name}" out of 0–100`);
  }
  if (!near(bands[0].minScore, 0)) errors.push("Lowest band must start at 0 (full coverage of the score range)");
  // Adjacent bands must be contiguous: each min equals the previous band's ceiling.
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].minScore < bands[i - 1].maxScore - EPS) errors.push(`Bands "${bands[i - 1].name}" and "${bands[i].name}" overlap`);
    if (bands[i].minScore > bands[i - 1].maxScore + 1) errors.push(`Gap between "${bands[i - 1].name}" and "${bands[i].name}"`);
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateModelVersion(model: HealthModelVersion): ValidationResult {
  const errors: string[] = [];
  const statuses = new Set([...model.severityOrder, ...model.replacementStates]);

  validateComponents(model.components, "model", errors, new Set());
  validateBands(model, errors);

  for (const r of model.statusRules) {
    if (r.targetStatus && !statuses.has(r.targetStatus)) errors.push(`Status rule "${r.name}" targets unknown status "${r.targetStatus}"`);
  }
  for (const q of model.qualificationRules) {
    if (!statuses.has(q.capTo)) errors.push(`Qualification rule "${q.name}" caps to unknown status "${q.capTo}"`);
  }
  if (!statuses.has(model.coverageCapTo)) errors.push(`coverageCapTo "${model.coverageCapTo}" is not a known status`);

  return { ok: errors.length === 0, errors };
}
