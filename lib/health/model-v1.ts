/* =============================================================================
   "Lumofy Client Health Model" — Version 1.1 seed (config only, no logic).
   Encodes §4–§8 (components/weights/formulas), §15 (bands), §16 (status +
   qualification rules), §18 (momentum), §14 (coverage/confidence). Every number
   here is data the engine interprets — changing the model is changing this
   config (or a DB row), never the engine code.
   ============================================================================= */

import type { HealthModelVersion, RatingTier } from "./model";

/** CS Pulse rating tiers — STABLE keys, renameable labels (Settings), scores.
 *  Defaults are proper CS terms (no "soft"); rename any label in Settings
 *  without breaking stored pulse values or the engine. */
export const CS_PULSE_TIERS: RatingTier[] = [
  { key: "strong", label: "Strong", score: 100 },
  { key: "moderate", label: "Moderate", score: 75 },
  { key: "weak", label: "Weak", score: 40 },
  { key: "critical", label: "Critical", score: 0 },
];
const RATING_MAP = Object.fromEntries(CS_PULSE_TIERS.map((t) => [t.key, t.score]));

export const MODEL_V1_1: HealthModelVersion = {
  modelName: "Lumofy Client Health Model",
  version: "1.1",
  status: "published",
  ratingScales: { cs_pulse: CS_PULSE_TIERS },

  components: [
    /* ---- 50% Product Adoption and Value Realization (mandatory) ---- */
    {
      id: "product", code: "product_adoption", name: "Product Adoption and Value Realization",
      displayOrder: 1, weight: 0.5, isEnabled: true, isMandatory: true, missingDataPolicy: "mark_not_assessed",
      children: [
        {
          id: "reach", code: "meaningful_reach", name: "Meaningful Reach", displayOrder: 1, weight: 0.4,
          isEnabled: true, isMandatory: false, missingDataPolicy: "use_fallback_metric",
          fallbackMetric: "login_proxy_active_users",
          formula: { type: "ratio", numerator_metric: "meaningfully_active_users", denominator_metric: "target_cohort", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
        {
          id: "progress", code: "workflow_progress", name: "Workflow Progress", displayOrder: 2, weight: 0.3,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
          formula: { type: "stage_adjusted_ratio", actual_metric: "actual_progress", expected_metric: "expected_progress", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
        {
          id: "outcomes", code: "completion_outcomes", name: "Completion and Outcomes", displayOrder: 3, weight: 0.2,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
          formula: { type: "ratio", numerator_metric: "completed_matured_workflows", denominator_metric: "total_matured_workflows", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
        {
          id: "participation", code: "manager_admin_participation", name: "Manager and Admin Participation", displayOrder: 4, weight: 0.1,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
          formula: { type: "ratio", numerator_metric: "participating_managers", denominator_metric: "expected_managers", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
      ],
    },

    /* ---- 25% Customer Success Pulse (mandatory) ---- */
    {
      id: "pulse", code: "cs_pulse", name: "Customer Success Pulse",
      displayOrder: 2, weight: 0.25, isEnabled: true, isMandatory: true, missingDataPolicy: "mark_not_assessed",
      validityWindowDays: 30,
      children: [
        {
          id: "stakeholder", code: "stakeholder_coverage", name: "Stakeholder Coverage", displayOrder: 1, weight: 0.35,
          isEnabled: true, isMandatory: false, missingDataPolicy: "mark_not_assessed",
          formula: { type: "categorical_map", source_metric: "stakeholder_coverage_rating", mapping: RATING_MAP },
        },
        {
          id: "engagement", code: "engagement_execution", name: "Engagement and Execution", displayOrder: 2, weight: 0.3,
          isEnabled: true, isMandatory: false, missingDataPolicy: "mark_not_assessed",
          formula: { type: "categorical_map", source_metric: "engagement_execution_rating", mapping: RATING_MAP },
        },
        {
          id: "renewal", code: "renewal_readiness", name: "Renewal Readiness", displayOrder: 3, weight: 0.35,
          isEnabled: true, isMandatory: false, missingDataPolicy: "mark_not_assessed",
          formula: { type: "categorical_map", source_metric: "renewal_readiness_rating", mapping: RATING_MAP },
        },
      ],
    },

    /* ---- 15% Support and Reliability (optional) ---- */
    {
      id: "support", code: "support_reliability", name: "Support and Reliability",
      displayOrder: 3, weight: 0.15, isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
      children: [
        {
          id: "sla", code: "sla_resolution", name: "SLA and Resolution Performance", displayOrder: 1, weight: 0.3,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight", minimumValidObservations: 1,
          formula: { type: "ratio", numerator_metric: "tickets_resolved_within_target", denominator_metric: "eligible_resolved_tickets", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
        {
          id: "incidents", code: "incident_burden", name: "Critical and High-Severity Incident Burden", displayOrder: 2, weight: 0.3,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
          formula: {
            type: "threshold_table",
            rules: [
              { when: { active_critical_incidents: { gte: 1 } }, score: 0 },
              { when: { aged_high_severity_incidents: { gte: 2 } }, score: 40 },
              { when: { resolved_high_severity_incidents: { gte: 1 } }, score: 75 },
            ],
            default_score: 100,
          },
        },
        {
          id: "aged", code: "aged_reopened", name: "Aged and Reopened Tickets", displayOrder: 3, weight: 0.2,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight",
          formula: {
            type: "threshold_table",
            rules: [
              { when: { serious_persistent_issue: { isTrue: true } }, score: 0 },
              { when: { aged_or_reopened_tickets: { gte: 3 } }, score: 40 },
              { when: { aged_or_reopened_tickets: { gte: 1 } }, score: 75 },
            ],
            default_score: 100,
          },
        },
        {
          id: "ticket_sat", code: "ticket_satisfaction", name: "Ticket Satisfaction", displayOrder: 4, weight: 0.2,
          isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight", minimumValidObservations: 3, validityWindowDays: 90,
          formula: { type: "ratio", numerator_metric: "satisfied_rated_tickets", denominator_metric: "total_valid_rated_tickets", multiplier: 100, minimum: 0, maximum: 100, zero_denominator_policy: "missing" },
        },
      ],
    },

    /* ---- 10% Client Sentiment (optional) — NPS only ---- */
    {
      id: "sentiment", code: "client_sentiment", name: "Client Sentiment",
      displayOrder: 4, weight: 0.1, isEnabled: true, isMandatory: false, missingDataPolicy: "redistribute_weight", validityWindowDays: 90,
      // Survey NPS, normalised to 0–100 as (nps+100)/2. Platform/survey CSAT is
      // deliberately NOT a sentiment input (Ticket CSAT lives in Support &
      // Reliability instead) — sentiment tracks relationship advocacy via NPS.
      formula: { type: "latest_valid_value", metrics: ["sentiment_nps"] },
    },
  ],

  /* ---- §15 calculated bands (resolved by lower bound) ---- */
  bands: [
    { name: "Healthy", minScore: 65, maxScore: 100 },
    { name: "Watch", minScore: 50, maxScore: 64.999 },
    { name: "At Risk", minScore: 25, maxScore: 49.999 },
    { name: "Critical", minScore: 0, maxScore: 24.999 },
  ],

  /* ---- §16.1 Healthy qualification (each `when` must HOLD, else cap) ---- */
  qualificationRules: [
    { id: "q_product", name: "Product adoption ≥ 65", when: { product_adoption_score: { gte: 65 } }, capTo: "Watch", reasonTemplate: "Product Adoption below the Healthy minimum of 65", isEnabled: true },
    { id: "q_pulse", name: "CS Pulse ≥ 75", when: { cs_pulse_score: { gte: 75 } }, capTo: "Watch", reasonTemplate: "CS Pulse below the Healthy minimum of 75", isEnabled: true },
    { id: "q_coverage", name: "Data coverage ≥ 85%", when: { data_coverage: { gte: 0.85 } }, capTo: "Watch", reasonTemplate: "Data Coverage below the Healthy minimum of 85%", isEnabled: true },
    { id: "q_multithreaded", name: "Not single-threaded", when: { single_threaded: { isFalse: true } }, capTo: "Watch", reasonTemplate: "Account is single-threaded", isEnabled: true },
    { id: "q_pulse_valid", name: "Valid CS Pulse exists", when: { valid_cs_pulse_exists: { isTrue: true } }, capTo: "Watch", reasonTemplate: "No valid CS Pulse review on record", isEnabled: true },
  ],

  /* ---- §16.2–§16.5 applied-status rules (priority: low = first) ---- */
  statusRules: [
    // Replacement states
    { id: "r_churned", name: "Confirmed termination", priority: 1, when: { confirmed_termination: { isTrue: true } }, action: "churned", targetStatus: "Churned", reasonTemplate: "Confirmed written termination; relationship ended", isEnabled: true },
    // Force Critical (§16.4)
    { id: "r_termination_notice", name: "Termination notice received", priority: 10, when: { termination_notice_received: { isTrue: true } }, action: "force", targetStatus: "Critical", reasonTemplate: "Termination notice received; churn date not yet reached", isEnabled: true },
    { id: "r_imminent_churn", name: "Imminent churn evidence", priority: 11, when: { imminent_churn: { isTrue: true } }, action: "force", targetStatus: "Critical", reasonTemplate: "High-confidence evidence of imminent churn", isEnabled: true },
    { id: "r_exec_escalation", name: "Unresolved executive escalation", priority: 12, when: { executive_escalation_unresolved: { isTrue: true } }, action: "force", targetStatus: "Critical", reasonTemplate: "Executive stakeholders escalated a serious unresolved failure", isEnabled: true },
    // Cap At Risk (§16.3)
    { id: "r_critical_incident", name: "Active critical incident", priority: 20, when: { active_critical_incidents: { gte: 1 } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "Active critical incident", isEnabled: true },
    { id: "r_negative_renewal", name: "Negative renewal intent", priority: 21, when: { renewal_intent: { eq: "negative" } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "Renewal intent is explicitly negative", isEnabled: true },
    { id: "r_suspension", name: "Suspension requested", priority: 22, when: { suspension_requested: { isTrue: true } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "Client requested suspension", isEnabled: true },
    { id: "r_scope_reduction", name: "Material scope reduction requested", priority: 23, when: { scope_reduction_requested: { isTrue: true } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "Client requested a material scope reduction", isEnabled: true },
    { id: "r_no_activity_60", name: "No activity 60d post-launch", priority: 24, when: { days_since_meaningful_activity: { gte: 60 } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "No meaningful product activity for 60 days after launch", isEnabled: true },
    { id: "r_pulse_below_60", name: "CS Pulse < 60", priority: 25, when: { cs_pulse_score: { lt: 60 } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "Customer Success Pulse score is below 60", isEnabled: true },
    { id: "r_competitor", name: "Competitive replacement underway", priority: 26, when: { competitive_replacement: { isTrue: true } }, action: "cap_max", targetStatus: "At Risk", reasonTemplate: "A credible competitive replacement process is underway", isEnabled: true },
    // Cap Watch (§16.2)
    { id: "r_low_adoption", name: "Product adoption < 65", priority: 40, when: { product_adoption_score: { lt: 65 } }, action: "cap_max", targetStatus: "Watch", reasonTemplate: "Product Adoption score is below 65", isEnabled: true },
    { id: "r_single_threaded", name: "Single-threaded account", priority: 41, when: { single_threaded: { isTrue: true } }, action: "cap_max", targetStatus: "Watch", reasonTemplate: "Account is single-threaded", isEnabled: true },
    { id: "r_no_sponsor", name: "No sponsor / economic-buyer access", priority: 42, when: { sponsor_access: { isFalse: true } }, action: "cap_max", targetStatus: "Watch", reasonTemplate: "No credible sponsor or economic-buyer access", isEnabled: true },
    { id: "r_champion_left", name: "Champion left without replacement", priority: 43, when: { champion_left: { isTrue: true } }, action: "cap_max", targetStatus: "Watch", reasonTemplate: "Champion has left without a replacement", isEnabled: true },
    { id: "r_renewal_eb_unknown", name: "Renewal <90d, economic buyer unknown", priority: 44, when: { renewal_within_90d: { isTrue: true }, economic_buyer_known: { isFalse: true } }, action: "cap_max", targetStatus: "Watch", reasonTemplate: "Renewal within 90 days and the economic buyer is unknown", isEnabled: true },
  ],

  /* ---- §18 momentum thresholds (resolved by min delta, sorted desc) ---- */
  momentumThresholds: [
    { label: "Improving", minDelta: 5 },
    { label: "Stable", minDelta: -4.999 },
    { label: "Declining", minDelta: -9.999 },
    { label: "Rapidly Declining", minDelta: -Infinity },
  ],

  /* ---- §14 confidence labels (resolved by min coverage, sorted desc) ---- */
  confidenceThresholds: [
    { label: "High", minCoverage: 0.85 },
    { label: "Moderate", minCoverage: 0.7 },
  ],

  severityOrder: ["Healthy", "Watch", "At Risk", "Critical", "Churned"],
  replacementStates: ["Implementation", "Implementation At Risk", "Not Assessed", "Churned"],
  minCoverageForAssessment: 0.7,
  coverageCapThreshold: 0.85,
  coverageCapTo: "Watch",
};
