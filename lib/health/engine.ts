/* =============================================================================
   Client Health calculation engine. Deterministic, config-driven. Produces the
   full explainable result (§2/§19): calculated score + band kept SEPARATE from
   the applied operational status, with every driver, coverage figure, triggered
   rule and override preserved.
   ============================================================================= */

import { evalFormula, matchConditionSet, round3, type Scalar } from "./formula";
import type {
  AccountFacts, AccountHealthResult, ComponentResult, Formula, HealthComponent,
  HealthModelVersion, MetricBag, MetricResult, TriggeredRule,
} from "./model";

/* ------------------------------------------------------------- helpers */

export function bandFor(model: HealthModelVersion, score: number): string {
  const sorted = [...model.bands].sort((a, b) => b.minScore - a.minScore);
  for (const b of sorted) if (score >= b.minScore) return b.name;
  return sorted[sorted.length - 1]?.name ?? "Unknown";
}

export function momentumFor(model: HealthModelVersion, delta: number | null): string {
  if (delta == null) return "Insufficient History";
  const sorted = [...model.momentumThresholds].sort((a, b) => b.minDelta - a.minDelta);
  for (const t of sorted) if (delta >= t.minDelta) return t.label;
  return sorted[sorted.length - 1]?.label ?? "Stable";
}

function confidenceFor(model: HealthModelVersion, coverage: number): string {
  if (coverage < model.minCoverageForAssessment) return "Not Assessed";
  const sorted = [...model.confidenceThresholds].sort((a, b) => b.minCoverage - a.minCoverage);
  for (const t of sorted) if (coverage >= t.minCoverage) return t.label;
  return "Not Assessed";
}

/** Metric keys a formula references — for the explainability breakdown. */
function formulaMetricKeys(f: Formula): string[] {
  switch (f.type) {
    case "ratio": return [f.numerator_metric, f.denominator_metric];
    case "stage_adjusted_ratio": return [f.actual_metric, f.expected_metric];
    case "percentage":
    case "categorical_map":
    case "boolean_map": return [f.source_metric];
    case "weighted_average": return f.inputs.map((i) => i.metric);
    case "simple_average":
    case "minimum":
    case "maximum":
    case "sum":
    case "count":
    case "latest_valid_value": return f.metrics;
    case "threshold_table": return [...new Set(f.rules.flatMap((r) => Object.keys(r.when)))];
    case "constant_if": return Object.keys(f.when);
    case "constant": return [];
    default: return [];
  }
}

function metricResults(keys: string[], metrics: MetricBag): MetricResult[] {
  return keys.map((key) => {
    const m = metrics[key];
    const missing = !m || m.isValid === false || m.value == null;
    return {
      key,
      value: m?.value ?? null,
      numerator: m?.numerator ?? null,
      denominator: m?.denominator ?? null,
      score: null,
      isValid: !missing,
      isMissing: missing,
      isProxy: m?.isProxy ?? false,
      fallbackUsed: false,
      observationCount: m?.observationCount,
      source: m?.source,
      measurementPeriod: m?.measurementPeriod,
      label: m?.label,
    };
  });
}

const applyFloorCeil = (score: number, c: HealthComponent): number => {
  let s = score;
  if (typeof c.scoreFloor === "number") s = Math.max(s, c.scoreFloor);
  if (typeof c.scoreCeiling === "number") s = Math.min(s, c.scoreCeiling);
  return round3(s);
};

/* --------------------------------------------------- component compute */

function computeComponent(component: HealthComponent, metrics: MetricBag): ComponentResult {
  const base: ComponentResult = {
    id: component.id, code: component.code, name: component.name,
    score: null, originalWeight: component.weight, effectiveWeight: 0, weightedContribution: null,
    isApplicable: component.isEnabled, isMissing: true, isValid: false, fallbackUsed: false,
  };
  if (!component.isEnabled) return { ...base, isApplicable: false, isMissing: false };

  // Branch: reweighted average of applicable, valid children.
  if (component.children && component.children.length) {
    const childResults = component.children.map((c) => computeComponent(c, metrics));
    const available = childResults.filter((r) => r.score != null);
    const wSum = available.reduce((s, r) => s + r.originalWeight, 0);
    if (!available.length || wSum <= 0) return { ...base, children: childResults, missingReason: "no valid subcomponents" };
    let score = available.reduce((s, r) => s + (r.score as number) * (r.originalWeight / wSum), 0);
    available.forEach((r) => { r.effectiveWeight = r.originalWeight / wSum; r.weightedContribution = round3((r.score as number) * r.effectiveWeight); });
    score = applyFloorCeil(score, component);
    return { ...base, score, isMissing: false, isValid: true, children: childResults };
  }

  // Leaf: evaluate its formula, with fallback + minimum-observation handling.
  if (!component.formula) return { ...base, missingReason: "no formula configured" };
  let res = evalFormula(component.formula, metrics);
  let fallbackUsed = false;

  // Minimum valid observations — treat as missing when under-observed.
  if (!res.missing && component.minimumValidObservations) {
    const keys = formulaMetricKeys(component.formula);
    const obs = Math.max(0, ...keys.map((k) => metrics[k]?.observationCount ?? 0));
    if (obs < component.minimumValidObservations) res = { score: null, missing: true, reason: `under ${component.minimumValidObservations} observations` };
  }

  // Fallback metric (e.g. login proxy) when the primary metric is missing.
  if (res.missing && component.missingDataPolicy === "use_fallback_metric" && component.fallbackMetric) {
    const fb = metrics[component.fallbackMetric];
    if (fb && fb.isValid !== false && fb.value != null) {
      res = { score: round3(Math.max(0, Math.min(100, fb.value))), missing: false, reason: "fallback metric" };
      fallbackUsed = true;
    }
  }

  const mres = metricResults(formulaMetricKeys(component.formula), metrics);
  if (res.missing) return { ...base, missingReason: res.reason, metrics: mres, fallbackUsed };
  return { ...base, score: applyFloorCeil(res.score as number, component), isMissing: false, isValid: true, metrics: mres, fallbackUsed };
}

/* --------------------------------------------------- applied status */

interface StatusOutcome {
  status: string;
  triggered: TriggeredRule[];
}

function resolveAppliedStatus(model: HealthModelVersion, band: string, factBag: Record<string, Scalar>, coverage: number, overrides: AccountFacts["overrides"]): StatusOutcome {
  const sev = (s: string) => { const i = model.severityOrder.indexOf(s); return i < 0 ? 0 : i; };
  const triggered: TriggeredRule[] = [];
  let idx = sev(band);
  let replacement: string | null = null;
  const record = (id: string, name: string, action: TriggeredRule["action"], reason: string, priority: number, before: string, after: string) =>
    triggered.push({ ruleId: id, ruleName: name, action, reason, priority, previousStatus: before, resultingStatus: after });

  // Coverage cap (§14): below threshold, status cannot exceed the cap.
  if (coverage < model.coverageCapThreshold) {
    const before = model.severityOrder[idx];
    idx = Math.max(idx, sev(model.coverageCapTo));
    if (model.severityOrder[idx] !== before) record("coverage_cap", "Low data coverage", "cap_max", `Data Coverage ${Math.round(coverage * 100)}% below ${Math.round(model.coverageCapThreshold * 100)}%`, 5, before, model.severityOrder[idx]);
  }

  // Healthy qualification (§16.1): only bites when the calculated band is Healthy.
  if (band === "Healthy") {
    for (const q of model.qualificationRules) {
      if (!q.isEnabled) continue;
      if (!matchConditionSet((k) => factBag[k] ?? null, q.when)) {
        const before = model.severityOrder[idx];
        idx = Math.max(idx, sev(q.capTo));
        record(q.id, q.name, "cap_max", q.reasonTemplate, 6, before, model.severityOrder[idx]);
      }
    }
  }

  // Applied-status rules, priority order.
  for (const rule of [...model.statusRules].sort((a, b) => a.priority - b.priority)) {
    if (!rule.isEnabled) continue;
    if (!matchConditionSet((k) => factBag[k] ?? null, rule.when)) continue;
    const before = replacement ?? model.severityOrder[idx];
    if (rule.action === "churned" || rule.action === "not_assessed" || rule.action === "replace") {
      replacement = rule.action === "churned" ? "Churned" : rule.action === "not_assessed" ? "Not Assessed" : (rule.targetStatus ?? "Not Assessed");
      record(rule.id, rule.name, rule.action, rule.reasonTemplate, rule.priority, before, replacement);
    } else if (rule.action === "force" || rule.action === "cap_max") {
      idx = Math.max(idx, sev(rule.targetStatus ?? band));
      record(rule.id, rule.name, rule.action, rule.reasonTemplate, rule.priority, before, replacement ?? model.severityOrder[idx]);
    } else {
      record(rule.id, rule.name, "warn", rule.reasonTemplate, rule.priority, before, before);
    }
  }

  // Manual overrides (non-expired) — force / cap_max, never destroy the score.
  for (const o of overrides ?? []) {
    const before = replacement ?? model.severityOrder[idx];
    if (o.overrideType === "force") idx = sev(o.targetStatus);
    else idx = Math.max(idx, sev(o.targetStatus));
    record(o.id, `Override: ${o.reason}`, o.overrideType === "force" ? "force" : "cap_max", o.reason, 0, before, replacement ?? model.severityOrder[idx]);
  }

  return { status: replacement ?? model.severityOrder[idx], triggered };
}

/* --------------------------------------------------- public entrypoint */

export function calculateAccountHealth(model: HealthModelVersion, facts: AccountFacts, calculationTimestamp: string): AccountHealthResult {
  const empty: AccountHealthResult = {
    accountId: facts.accountId, eligible: facts.eligible, eligibilityReason: facts.eligibilityReason,
    modelName: model.modelName, modelVersion: model.version, calculationTimestamp,
    calculatedScore: null, calculatedBand: null, appliedStatus: "Not Assessed",
    momentum: "Insufficient History", scoreDelta: null, previousScore: facts.previousScore ?? null,
    dataCoverage: 0, dataConfidence: "Not Assessed",
    positiveDrivers: [], negativeDrivers: [], primaryRisk: null, nextAction: null, actionOwner: null, actionDueDate: null,
    activeStatusRules: [], activeOverrides: facts.overrides ?? [], components: [], notAssessed: true,
  };

  // §3 eligibility — not-launched accounts use implementation states, not a score.
  if (!facts.eligible) {
    return { ...empty, appliedStatus: facts.lifecycleState ?? "Implementation", notAssessedReason: facts.eligibilityReason ?? "Account not eligible for client health" };
  }

  // Compute the component tree.
  const components = model.components.map((c) => computeComponent(c, facts.metrics));
  const enabled = components.filter((c) => c.isApplicable);

  // Mandatory missing ⇒ Not Assessed.
  const mandatoryMissing = model.components.find((c) => c.isEnabled && c.isMandatory && components.find((r) => r.id === c.id)?.score == null);
  if (mandatoryMissing) {
    return { ...empty, components, notAssessedReason: `Mandatory component "${mandatoryMissing.name}" has no valid data` };
  }

  // Data coverage from ORIGINAL top-level weights (before redistribution).
  const enabledWeight = enabled.reduce((s, c) => s + c.originalWeight, 0) || 1;
  const availableWeight = enabled.filter((c) => c.score != null).reduce((s, c) => s + c.originalWeight, 0);
  const coverage = round3(availableWeight / enabledWeight);

  if (coverage < model.minCoverageForAssessment) {
    return { ...empty, components, dataCoverage: coverage, notAssessedReason: `Data Coverage ${Math.round(coverage * 100)}% below ${Math.round(model.minCoverageForAssessment * 100)}%` };
  }

  // Redistribute missing optional weight proportionally; weighted score.
  const available = enabled.filter((c) => c.score != null);
  const availSum = available.reduce((s, c) => s + c.originalWeight, 0);
  let score = 0;
  for (const c of available) {
    c.effectiveWeight = round3(c.originalWeight / availSum);
    c.weightedContribution = round3((c.score as number) * c.effectiveWeight);
    score += (c.score as number) * (c.originalWeight / availSum);
  }
  score = round3(score);
  const band = bandFor(model, score);

  // Momentum.
  const prev = facts.previousScore ?? null;
  const delta = prev == null ? null : round3(score - prev);
  const momentum = momentumFor(model, delta);

  // Fact bag for status + qualification rules: signals + derived component scores.
  const by = (id: string) => components.find((c) => c.id === id)?.score ?? null;
  const factBag: Record<string, Scalar> = {
    ...facts.signals,
    calculated_score: score,
    data_coverage: coverage,
    product_adoption_score: by("product"),
    cs_pulse_score: by("pulse"),
    support_reliability_score: by("support"),
    client_sentiment_score: by("sentiment"),
    momentum_delta: delta,
  };
  if (factBag.valid_cs_pulse_exists == null) factBag.valid_cs_pulse_exists = by("pulse") != null;
  if (factBag.renewal_within_90d == null && typeof facts.signals.days_to_renewal === "number") factBag.renewal_within_90d = (facts.signals.days_to_renewal as number) <= 90;

  const activeOverrides = (facts.overrides ?? []).filter((o) => !o.expiresAt || o.expiresAt >= calculationTimestamp);
  const { status: appliedStatus, triggered } = resolveAppliedStatus(model, band, factBag, coverage, activeOverrides);

  // Drivers.
  const positiveDrivers = available.filter((c) => (c.score as number) >= 65).sort((a, b) => (b.weightedContribution ?? 0) - (a.weightedContribution ?? 0)).slice(0, 3).map((c) => `${c.name} at ${Math.round(c.score as number)}`);
  const negativeDrivers = available.filter((c) => (c.score as number) < 50).sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 3).map((c) => `${c.name} at ${Math.round(c.score as number)}`);
  const capReasons = triggered.filter((t) => t.action !== "warn").map((t) => t.reason);
  const primaryRisk = capReasons[0] ?? negativeDrivers[0] ?? null;

  return {
    accountId: facts.accountId, eligible: true,
    modelName: model.modelName, modelVersion: model.version, calculationTimestamp,
    calculatedScore: score, calculatedBand: band, appliedStatus,
    momentum, scoreDelta: delta, previousScore: prev,
    dataCoverage: coverage, dataConfidence: confidenceFor(model, coverage),
    positiveDrivers, negativeDrivers, primaryRisk,
    nextAction: (facts.signals.next_action as string) ?? null,
    actionOwner: (facts.signals.action_owner as string) ?? null,
    actionDueDate: (facts.signals.action_due_date as string) ?? null,
    activeStatusRules: triggered, activeOverrides,
    components, notAssessed: false,
  };
}
