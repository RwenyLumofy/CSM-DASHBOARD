import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAccountHealth, bandFor, momentumFor } from "./engine";
import { evalFormula } from "./formula";
import { normalizePulse, PULSE_RISK_FLAGS, PULSE_COVERAGE } from "./pulse";
import { buildAccountFacts } from "./facts";
import { validateModelVersion } from "./validate";
import { MODEL_V1_1 } from "./model-v1";
import type { AccountFacts, HealthModelVersion, MetricBag } from "./model";

const M = MODEL_V1_1;
const TS = "2026-07-23T00:00:00.000Z";

const num = (value: number | null, extra: Record<string, unknown> = {}) => ({ value, ...extra });
const cat = (categorical: string | null) => ({ value: null, categorical });

/** A fully-valid, comfortably-Healthy account; tests override slices of it. */
function healthyMetrics(over: MetricBag = {}): MetricBag {
  return {
    meaningfully_active_users: num(72), target_cohort: num(100),
    actual_progress: num(72), expected_progress: num(100),
    completed_matured_workflows: num(72), total_matured_workflows: num(100),
    participating_managers: num(72), expected_managers: num(100),
    stakeholder_coverage_rating: cat("strong"),
    engagement_execution_rating: cat("strong"),
    renewal_readiness_rating: cat("strong"),
    tickets_resolved_within_target: num(90, { observationCount: 100 }), eligible_resolved_tickets: num(100, { observationCount: 100 }),
    active_critical_incidents: num(0), aged_high_severity_incidents: num(0), resolved_high_severity_incidents: num(0),
    aged_or_reopened_tickets: num(0),
    satisfied_rated_tickets: num(9, { observationCount: 10 }), total_valid_rated_tickets: num(10, { observationCount: 10 }),
    sentiment_nps: num(80),
    ...over,
  };
}

function facts(over: Partial<AccountFacts> = {}, metricsOver: MetricBag = {}): AccountFacts {
  const { signals: sOver, metrics: mOver, ...rest } = over;
  return {
    accountId: "acc1",
    eligible: true,
    ...rest,
    metrics: mOver ?? healthyMetrics(metricsOver),
    signals: { active_critical_incidents: 0, single_threaded: false, ...(sOver ?? {}) },
  };
}

/* ------------------------------------------------- §28.3 validation */

test("§28.3 Version 1.1 seed is a valid publishable model", () => {
  const r = validateModelVersion(M);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test("§28.3 validation rejects weights that don't total 100%", () => {
  const bad: HealthModelVersion = structuredClone(M);
  bad.components[0].weight = 0.9; // now 0.9+0.25+0.15+0.10 = 1.4
  const r = validateModelVersion(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /100%/.test(e)));
});

test("§28.3 validation rejects overlapping bands", () => {
  const bad: HealthModelVersion = structuredClone(M);
  bad.bands = [{ name: "A", minScore: 0, maxScore: 60 }, { name: "B", minScore: 50, maxScore: 100 }];
  assert.equal(validateModelVersion(bad).ok, false);
});

/* --------------------------------------------- §28.1 formula units */

test("§28.1 ratio formula caps at 100 and honours zero-denominator policy", () => {
  const m: MetricBag = { a: num(150), b: num(100), z: num(0) };
  assert.equal(evalFormula({ type: "ratio", numerator_metric: "a", denominator_metric: "b", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" }, m).score, 100);
  const zd = evalFormula({ type: "ratio", numerator_metric: "a", denominator_metric: "z", multiplier: 100, zero_denominator_policy: "missing" }, m);
  assert.equal(zd.missing, true);
  const zz = evalFormula({ type: "ratio", numerator_metric: "a", denominator_metric: "z", multiplier: 100, zero_denominator_policy: "score_zero" }, m);
  assert.equal(zz.score, 0);
});

test("§28.1 categorical, boolean and threshold formulas", () => {
  assert.equal(evalFormula({ type: "categorical_map", source_metric: "r", mapping: { strong: 100, weak: 40 } }, { r: cat("weak") }).score, 40);
  assert.equal(evalFormula({ type: "boolean_map", source_metric: "s", true_score: 0, false_score: 100 }, { s: { value: null, boolean: true } }).score, 0);
  const tt = evalFormula({ type: "threshold_table", rules: [{ when: { inc: { gte: 1 } }, score: 0 }], default_score: 100 }, { inc: num(2) });
  assert.equal(tt.score, 0);
});

test("§28.1 latest_valid_value picks NPS over CSAT by priority", () => {
  assert.equal(evalFormula({ type: "latest_valid_value", metrics: ["sentiment_nps", "sentiment_csat"] }, { sentiment_nps: num(80), sentiment_csat: num(50) }).score, 80);
  assert.equal(evalFormula({ type: "latest_valid_value", metrics: ["sentiment_nps", "sentiment_csat"] }, { sentiment_csat: num(50) }).score, 50);
});

/* --------------------------------------- §28.2 band boundary matrix */

test("§28.2 band boundaries resolve to exactly one band", () => {
  assert.equal(bandFor(M, 100), "Healthy");
  assert.equal(bandFor(M, 65), "Healthy");
  assert.equal(bandFor(M, 64.999), "Watch");
  assert.equal(bandFor(M, 50), "Watch");
  assert.equal(bandFor(M, 49.999), "At Risk");
  assert.equal(bandFor(M, 25), "At Risk");
  assert.equal(bandFor(M, 24.999), "Critical");
  assert.equal(bandFor(M, 0), "Critical");
});

test("§28.2 momentum thresholds", () => {
  assert.equal(momentumFor(M, 5), "Improving");
  assert.equal(momentumFor(M, 0), "Stable");
  assert.equal(momentumFor(M, -5), "Declining");
  assert.equal(momentumFor(M, -10), "Rapidly Declining");
  assert.equal(momentumFor(M, null), "Insufficient History");
});

/* --------------------------------------- §28.2 integration scenarios */

test("§28.2 healthy account → Healthy applied status", () => {
  const r = calculateAccountHealth(M, facts(), TS);
  assert.equal(r.calculatedBand, "Healthy");
  assert.equal(r.appliedStatus, "Healthy");
  assert.equal(r.dataCoverage, 1);
  assert.equal(r.dataConfidence, "High");
  assert.equal(r.notAssessed, false);
});

test("§28.2 healthy score but weak adoption → capped to Watch, score preserved", () => {
  // Product ~40 (<65), everything else strong → overall still ≥65 (Healthy band).
  const r = calculateAccountHealth(M, facts({}, { meaningfully_active_users: num(40), actual_progress: num(40), completed_matured_workflows: num(40), participating_managers: num(40) }), TS);
  assert.equal(r.calculatedBand, "Healthy");
  assert.equal(r.appliedStatus, "Watch");
  assert.ok(r.calculatedScore! >= 65);
  assert.ok(r.activeStatusRules.some((t) => /Product Adoption/.test(t.reason)));
});

/** Minimal two-component model to exercise coverage math precisely: a mandatory
 *  `a` and an optional `b`, each a plain percentage of its metric. */
function covModel(aWeight: number, bWeight: number): HealthModelVersion {
  return {
    ...structuredClone(M),
    components: [
      { id: "a", code: "a", name: "A", displayOrder: 1, weight: aWeight, isEnabled: true, isMandatory: true, missingDataPolicy: "mark_not_assessed", formula: { type: "percentage", source_metric: "a" } },
      { id: "b", code: "b", name: "B", displayOrder: 2, weight: bWeight, isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight", formula: { type: "percentage", source_metric: "b" } },
    ],
  };
}

test("§28.2 / §14 coverage 70–85% caps applied status at Watch", () => {
  // a present (score 90), b missing ⇒ coverage 80% (< 85%, ≥ 70%).
  const r = calculateAccountHealth(covModel(0.8, 0.2), { accountId: "c", eligible: true, metrics: { a: num(90) }, signals: { single_threaded: false, active_critical_incidents: 0 } }, TS);
  assert.equal(r.dataCoverage, 0.8);
  assert.equal(r.dataConfidence, "Moderate");
  assert.equal(r.calculatedBand, "Healthy"); // score 90
  assert.equal(r.appliedStatus, "Watch"); // coverage-capped
  assert.ok(r.activeStatusRules.some((t) => /Coverage/i.test(t.reason)));
});

test("§28.2 / §14 coverage below 70% → Not Assessed", () => {
  // a present, b missing ⇒ coverage 60% (< 70%).
  const r = calculateAccountHealth(covModel(0.6, 0.4), { accountId: "c", eligible: true, metrics: { a: num(90) }, signals: {} }, TS);
  assert.equal(r.dataCoverage, 0.6);
  assert.equal(r.notAssessed, true);
  assert.equal(r.appliedStatus, "Not Assessed");
});

test("§28.2 single-threaded account cannot be Healthy", () => {
  const r = calculateAccountHealth(M, facts({ signals: { single_threaded: true, active_critical_incidents: 0 } }), TS);
  assert.equal(r.calculatedBand, "Healthy");
  assert.equal(r.appliedStatus, "Watch");
});

test("§28.2 active critical incident caps At Risk but preserves the calculated score", () => {
  const r = calculateAccountHealth(M, facts({ signals: { active_critical_incidents: 1, single_threaded: false } }), TS);
  assert.equal(r.calculatedBand, "Healthy");
  assert.equal(r.appliedStatus, "At Risk");
  assert.ok(r.calculatedScore! >= 65); // score untouched
  assert.ok(r.activeStatusRules.some((t) => /critical incident/i.test(t.reason)));
});

test("§28.2 confirmed termination → Churned, calculated score preserved", () => {
  const r = calculateAccountHealth(M, facts({ signals: { confirmed_termination: true, active_critical_incidents: 0 } }), TS);
  assert.equal(r.appliedStatus, "Churned");
  assert.equal(r.calculatedBand, "Healthy");
  assert.ok(r.calculatedScore! >= 65);
});

test("§28.2 missing sentiment redistributes weight; coverage 90%", () => {
  const m = healthyMetrics();
  delete m.sentiment_nps; delete m.sentiment_csat;
  const r = calculateAccountHealth(M, facts({ metrics: m }), TS);
  assert.equal(r.dataCoverage, 0.9);
  assert.equal(r.notAssessed, false);
  assert.ok(r.components.find((c) => c.id === "sentiment")?.isMissing);
});

test("§28.2 missing mandatory component → Not Assessed", () => {
  const m = healthyMetrics();
  delete m.stakeholder_coverage_rating; delete m.engagement_execution_rating; delete m.renewal_readiness_rating; // pulse fully gone
  const r = calculateAccountHealth(M, facts({ metrics: m }), TS);
  assert.equal(r.notAssessed, true);
  assert.equal(r.appliedStatus, "Not Assessed");
  assert.ok(/Mandatory/.test(r.notAssessedReason ?? ""));
});

test("§28.2 not-eligible account uses an Implementation state, no score", () => {
  const r = calculateAccountHealth(M, facts({ eligible: false, eligibilityReason: "Not launched", lifecycleState: "Implementation" }), TS);
  assert.equal(r.appliedStatus, "Implementation");
  assert.equal(r.calculatedScore, null);
});

test("§28.2 expired manual override is not active", () => {
  const r = calculateAccountHealth(M, facts({ overrides: [{ id: "o1", overrideType: "force", targetStatus: "Critical", reason: "old", expiresAt: "2020-01-01T00:00:00.000Z" }] }), TS);
  assert.equal(r.activeOverrides.length, 0);
  assert.equal(r.appliedStatus, "Healthy"); // override ignored
});

test("§28.2 momentum reflects score change", () => {
  const r = calculateAccountHealth(M, facts({ previousScore: 60 }), TS);
  assert.ok(r.scoreDelta! > 5);
  assert.equal(r.momentum, "Improving");
});

/* ---------------------------- pulse coverage: unknown ≠ "no" -------------- */

test("unanswered sponsor access does NOT cap the account — unknown is not a No", () => {
  // sponsor_access omitted entirely: computeFacts leaves it null so the
  // r_no_sponsor `isFalse` rule can't fire on an unanswered question.
  const r = calculateAccountHealth(M, facts({ signals: { sponsor_access: null } }), TS);
  assert.equal(r.appliedStatus, "Healthy");
  assert.ok(!r.activeStatusRules.some((x) => x.ruleId === "r_no_sponsor"), "no-sponsor rule must not fire on unknown");
});

test("an explicit No on sponsor access DOES cap the account to Watch", () => {
  const r = calculateAccountHealth(M, facts({ signals: { sponsor_access: false } }), TS);
  assert.equal(r.appliedStatus, "Watch");
  assert.ok(r.activeStatusRules.some((x) => x.ruleId === "r_no_sponsor"), "an affirmative No must still penalise");
});



test("normalizePulse keeps coverage answers three-state, so 'not sure' survives to the engine", () => {
  const unanswered = normalizePulse({ ratings: {}, signals: {}, updatedAt: TS })!;
  assert.equal(unanswered.signals.sponsorAccess, undefined, "absent must stay undefined, never coerce to false");
  assert.equal(unanswered.signals.economicBuyerKnown, undefined);

  const answered = normalizePulse({ ratings: {}, signals: { sponsorAccess: false, economicBuyerKnown: true }, updatedAt: TS })!;
  assert.equal(answered.signals.sponsorAccess, false, "an explicit No is preserved");
  assert.equal(answered.signals.economicBuyerKnown, true);

  // Risk flags are three-state too, so computeFacts can tell "the CSM said no"
  // from "the CSM didn't answer" — the latter lets single_threaded fall back to
  // the derived contact-count read instead of being overridden by a false.
  assert.equal(unanswered.signals.singleThreaded, undefined);
  assert.equal(unanswered.signals.championLeft, undefined);
  assert.equal(unanswered.signals.competitiveReplacement, undefined);

  const flagged = normalizePulse({ ratings: {}, signals: { singleThreaded: true, championLeft: false }, updatedAt: TS })!;
  assert.equal(flagged.signals.singleThreaded, true);
  assert.equal(flagged.signals.championLeft, false, "an explicit 'not happening' is preserved, not collapsed to unknown");
});

test("an unanswered single-threaded flag lets the contact-count fallback decide", () => {
  const base = { clientId: "acc1", status: "active", renewalDate: null, primaryContactCount: 1 };

  // Unanswered → derived from the contact record (1 primary contact ⇒ true).
  const derived = buildAccountFacts({ ...base, pulse: { ratingsByMetricKey: {} } }, new Date(TS));
  assert.equal(derived.signals.single_threaded, true, "one primary contact should read as single-threaded");

  // An explicit No from the CSM overrides that derived read.
  const asserted = buildAccountFacts(
    { ...base, pulse: { ratingsByMetricKey: {}, singleThreaded: false } }, new Date(TS),
  );
  assert.equal(asserted.signals.single_threaded, false, "the CSM's explicit answer wins over the derived one");
});

/* --- the drawer's "caps status at X" hints must match the real rules -------- */

test("every pulse signal's advertised cap matches the status rule that enforces it", () => {
  const rules = new Map(M.statusRules.map((r) => [r.id, r]));

  for (const s of [...PULSE_RISK_FLAGS, ...PULSE_COVERAGE]) {
    const rule = rules.get(s.ruleId);
    assert.ok(rule, `${s.id}: rule ${s.ruleId} no longer exists — the drawer hint is now a lie`);
    assert.equal(rule!.targetStatus, s.capsTo,
      `${s.id}: drawer says it caps to "${s.capsTo}" but ${s.ruleId} targets "${rule!.targetStatus}"`);
    // Polarity: a risk fires on the fact being TRUE, coverage on it being FALSE.
    const cond = (rule!.when as Record<string, { isTrue?: boolean; isFalse?: boolean }>)[s.fact];
    assert.ok(cond, `${s.id}: ${s.ruleId} no longer reads the "${s.fact}" fact`);
    const firesOnRisk = (PULSE_RISK_FLAGS as readonly { id: string }[]).some((r) => r.id === s.id);
    assert.equal(firesOnRisk ? cond.isTrue === true : cond.isFalse === true, true,
      `${s.id}: rule polarity flipped — the Yes/No colouring in the drawer would be backwards`);
  }
});
