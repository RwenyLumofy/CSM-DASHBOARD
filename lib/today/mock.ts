/* =========================================================================
   Today page — illustrative mock data. EVERYTHING company/person/scenario
   specific lives here and nowhere else. Nothing in this file is referenced by
   product logic: components resolve entities through lib/today/repo.ts by id.

   Reference "today" for this dataset is 2026-07-19. Dates are fixed ISO
   strings (never computed from the wall clock) so historical snapshots stay
   stable and the past is never silently recalculated.
   ========================================================================= */

import type {
  Account, User, SignalPage, Signal, Commitment, Action, Opportunity,
  Priority, ChangeFeedItem, Pattern, PortfolioSummary, WorkCounts,
  HistoricalEvent, HistoricalSnapshot, TimelineEvent,
} from "./types";

export const TODAY_ISO = "2026-07-19";
export const VIEWER_USER_ID = "usr_mahmood";

/* ----------------------------------------------------------------- users */

export const USERS: User[] = [
  { id: "usr_mahmood", name: "Mahmood Malik", role: "Strategic CSM", team: "Customer Success", email: "mahmood@lumofy.com", route: "/team/usr_mahmood", accountIds: ["acc_arla", "acc_mep", "acc_gulfair", "acc_ikea", "acc_beyon"] },
  { id: "usr_zainab", name: "Zainab Ali", role: "Renewals Manager", team: "Customer Success", email: "zainab@lumofy.com", route: "/team/usr_zainab", accountIds: ["acc_mep", "acc_zain"] },
  { id: "usr_omar", name: "Omar Haddad", role: "Solutions Engineer", team: "Implementation", email: "omar@lumofy.com", route: "/team/usr_omar", accountIds: ["acc_gulfair", "acc_ikea"] },
  { id: "usr_layla", name: "Layla Nasser", role: "CSM Officer", team: "Customer Success", email: "layla@lumofy.com", route: "/team/usr_layla", accountIds: ["acc_beyon", "acc_stc"] },
  { id: "usr_khalid", name: "Khalid Rahman", role: "Product Manager", team: "Product", email: "khalid@lumofy.com", route: "/team/usr_khalid", accountIds: [] },
  { id: "usr_sara", name: "Sara Idris", role: "Support Lead", team: "Support", email: "sara@lumofy.com", route: "/team/usr_sara", accountIds: ["acc_ikea"] },
];

/* -------------------------------------------------------------- accounts */

export const ACCOUNTS: Account[] = [
  { id: "acc_arla", name: "Arla Foods", tier: "strategic", arr: 84000, renewalDate: "2026-07-15", csmUserId: "usr_mahmood", route: "/clients/acc_arla", industry: "FMCG", region: "EMEA" },
  { id: "acc_mep", name: "Ministry of Economy and Planning", tier: "strategic", arr: 96000, renewalDate: "2026-07-28", csmUserId: "usr_mahmood", route: "/clients/acc_mep", industry: "Public sector", region: "KSA" },
  { id: "acc_gulfair", name: "Gulf Air Group", tier: "enterprise", arr: 120000, renewalDate: "2026-09-10", csmUserId: "usr_mahmood", route: "/clients/acc_gulfair", industry: "Aviation", region: "GCC" },
  { id: "acc_ikea", name: "IKEA", tier: "enterprise", arr: 72000, renewalDate: "2026-08-30", csmUserId: "usr_mahmood", route: "/clients/acc_ikea", industry: "Retail", region: "EMEA" },
  { id: "acc_beyon", name: "Beyon", tier: "enterprise", arr: 68000, renewalDate: "2026-10-05", csmUserId: "usr_mahmood", route: "/clients/acc_beyon", industry: "Telecom", region: "GCC" },
  { id: "acc_zain", name: "Zain Group", tier: "enterprise", arr: 88000, renewalDate: "2026-11-20", csmUserId: "usr_zainab", route: "/clients/acc_zain", industry: "Telecom", region: "GCC" },
  { id: "acc_stc", name: "stc", tier: "strategic", arr: 140000, renewalDate: "2026-08-05", csmUserId: "usr_layla", route: "/clients/acc_stc", industry: "Telecom", region: "KSA" },
  { id: "acc_majid", name: "Majid Al Futtaim", tier: "enterprise", arr: 64000, renewalDate: "2026-12-01", csmUserId: "usr_mahmood", route: "/clients/acc_majid", industry: "Retail", region: "GCC" },
];

/* ------------------------------------------------------------ signal pages */

export const PAGES: SignalPage[] = [
  {
    id: "pg_mep_renewal", kind: "renewal_plan", title: "MEP Renewal Plan", icon: "FileText",
    createdByUserId: "usr_mahmood", lastEditedByUserId: "usr_zainab",
    createdAt: "2026-06-30T09:00:00Z", updatedAt: "2026-07-17T14:20:00Z",
    primaryAccountId: "acc_mep", relatedUserIds: ["usr_zainab"], relatedSignalIds: ["sig_mep_commitment"], relatedActionIds: ["act_mep_confirm"], relatedCommitmentIds: ["cmt_mep_confirm"],
    route: "/pages/pg_mep_renewal",
    blocks: [
      { type: "heading", level: 2, text: "Renewal objective" },
      { type: "paragraph", spans: [{ text: "Secure a confirmed decision date for " }, { mention: { type: "account", id: "acc_mep" } }, { text: " before 28 July. Two open commitments must close first." }] },
      { type: "checklist", items: [
        { checked: true, spans: [{ text: "Executive sponsor identified" }] },
        { checked: false, spans: [{ text: "Assessment mapping signed off" }] },
        { checked: false, spans: [{ text: "Decision date confirmed with procurement" }] },
      ] },
      { type: "callout", tone: "warning", spans: [{ text: "Blocker: assessment mapping owned by " }, { mention: { type: "user", id: "usr_zainab" } }, { text: " is at risk." }] },
    ],
  },
  {
    id: "pg_arla_rescue", kind: "intervention_plan", title: "Arla Foods rescue plan", icon: "LifeBuoy",
    createdByUserId: "usr_mahmood", lastEditedByUserId: "usr_mahmood",
    createdAt: "2026-07-16T08:00:00Z", updatedAt: "2026-07-18T10:00:00Z",
    primaryAccountId: "acc_arla", relatedUserIds: [], relatedSignalIds: ["sig_arla_overdue"], relatedActionIds: ["act_arla_escalate"], relatedCommitmentIds: [],
    route: "/pages/pg_arla_rescue",
    blocks: [
      { type: "heading", level: 2, text: "Situation" },
      { type: "paragraph", spans: [{ text: "Renewal is overdue with no confirmed decision date. Escalate to the executive sponsor." }] },
    ],
  },
  {
    id: "pg_gulfair_expansion", kind: "expansion_brief", title: "Gulf Air Group expansion brief", icon: "TrendingUp",
    createdByUserId: "usr_mahmood", lastEditedByUserId: "usr_mahmood",
    createdAt: "2026-07-14T11:00:00Z", updatedAt: "2026-07-18T09:30:00Z",
    primaryAccountId: "acc_gulfair", relatedUserIds: ["usr_omar"], relatedSignalIds: ["sig_gulfair_usage"], relatedActionIds: [], relatedCommitmentIds: ["cmt_gulfair_analysis"],
    route: "/pages/pg_gulfair_expansion",
    blocks: [
      { type: "heading", level: 2, text: "Opportunity" },
      { type: "paragraph", spans: [{ text: "Licence utilisation is at 94% with active demand for 40 more seats. Estimated expansion $48K." }] },
    ],
  },
  {
    id: "pg_ikea_data", kind: "risk_assessment", title: "IKEA telemetry investigation", icon: "AlertTriangle",
    createdByUserId: "usr_omar", lastEditedByUserId: "usr_omar",
    createdAt: "2026-07-17T13:00:00Z", updatedAt: "2026-07-17T13:40:00Z",
    primaryAccountId: "acc_ikea", relatedUserIds: ["usr_sara"], relatedSignalIds: ["sig_ikea_stale"], relatedActionIds: ["act_ikea_investigate"], relatedCommitmentIds: [],
    route: "/pages/pg_ikea_data",
    blocks: [
      { type: "heading", level: 2, text: "Data confidence" },
      { type: "paragraph", spans: [{ text: "Product telemetry has not refreshed for 12 days. Health cannot be trusted until the connection is restored." }] },
    ],
  },
];

/* ---------------------------------------------------------------- signals */

export const SIGNALS: Signal[] = [
  {
    id: "sig_arla_overdue", accountId: "acc_arla", type: "Renewal overdue, no decision date",
    category: "commercial", direction: "negative", severity: "critical", confidence: "high",
    detectedAt: "2026-07-16T06:00:00Z", source: "CRM + Renewals",
    evidence: [
      { id: "ev_arla_1", label: "Renewal date passed 4 days ago", observedAt: "2026-07-15T00:00:00Z", source: "CRM", detail: "Contract end 15 Jul 2026" },
      { id: "ev_arla_2", label: "No decision date on record", observedAt: "2026-07-18T08:00:00Z", source: "Renewals", detail: "Procurement unresponsive since 8 Jul" },
    ],
    commercialImpact: 84000, recommendedAction: "Escalate to executive sponsor and secure a decision date",
    status: "active", dataFreshness: { level: "recent", updatedAt: "2026-07-18T08:00:00Z", source: "CRM engagement" },
  },
  {
    id: "sig_mep_commitment", accountId: "acc_mep", type: "Renewal approaching with unresolved commitments",
    category: "commercial", direction: "negative", severity: "high", confidence: "medium",
    detectedAt: "2026-07-17T09:00:00Z", source: "Commitments + CRM",
    evidence: [
      { id: "ev_mep_1", label: "Renews in 9 days", observedAt: "2026-07-19T00:00:00Z", source: "CRM", detail: "Contract end 28 Jul 2026" },
      { id: "ev_mep_2", label: "Assessment mapping commitment at risk", observedAt: "2026-07-17T14:00:00Z", source: "Commitments" },
    ],
    commercialImpact: 96000, recommendedAction: "Close the assessment mapping commitment before the renewal decision",
    status: "active", dataFreshness: { level: "fresh", updatedAt: "2026-07-19T07:00:00Z", source: "CRM engagement" },
  },
  {
    id: "sig_gulfair_usage", accountId: "acc_gulfair", type: "Licence utilisation at 94% with expansion demand",
    category: "expansion", direction: "positive", severity: "medium", confidence: "high",
    detectedAt: "2026-07-18T05:00:00Z", source: "Product telemetry",
    evidence: [
      { id: "ev_gulf_1", label: "94% of licensed seats active (30-day)", observedAt: "2026-07-19T02:00:00Z", source: "Product telemetry", detail: "Updated 2 hours ago" },
      { id: "ev_gulf_2", label: "Champion requested 40 more seats", observedAt: "2026-07-16T10:00:00Z", source: "CRM" },
    ],
    commercialImpact: 48000, recommendedAction: "Create an expansion opportunity for 40 seats",
    status: "new", dataFreshness: { level: "fresh", updatedAt: "2026-07-19T02:00:00Z", source: "Product telemetry" },
  },
  {
    id: "sig_ikea_stale", accountId: "acc_ikea", type: "Product telemetry stale for 12 days",
    category: "data_quality", direction: "systemic", severity: "high", confidence: "low",
    detectedAt: "2026-07-17T12:00:00Z", source: "Data pipeline",
    evidence: [
      { id: "ev_ikea_1", label: "Telemetry connection last refreshed 12 days ago", observedAt: "2026-07-07T00:00:00Z", source: "Data pipeline", detail: "Health scores cannot be trusted" },
    ],
    commercialImpact: 72000, recommendedAction: "Investigate the telemetry connection before assessing risk",
    status: "active", dataFreshness: { level: "stale", updatedAt: "2026-07-07T00:00:00Z", source: "Product telemetry" },
  },
  {
    id: "sig_beyon_relationship", accountId: "acc_beyon", type: "Manager participation declining",
    category: "relationship", direction: "negative", severity: "medium", confidence: "medium",
    detectedAt: "2026-07-15T09:00:00Z", source: "Engagement analytics",
    evidence: [
      { id: "ev_beyon_1", label: "Manager logins down 60% over 30 days", observedAt: "2026-07-18T00:00:00Z", source: "Product telemetry" },
      { id: "ev_beyon_2", label: "Single active stakeholder remaining", observedAt: "2026-07-14T00:00:00Z", source: "CRM" },
    ],
    commercialImpact: 68000, recommendedAction: "Re-establish a second stakeholder relationship",
    status: "reviewed", dataFreshness: { level: "recent", updatedAt: "2026-07-18T00:00:00Z", source: "Engagement analytics" },
  },
  {
    id: "sig_beyon_singledep", accountId: "acc_beyon", type: "Single-stakeholder dependency",
    category: "organisational_change", direction: "negative", severity: "medium", confidence: "medium",
    detectedAt: "2026-07-14T09:00:00Z", source: "CRM",
    evidence: [{ id: "ev_beyon_3", label: "Only one active champion mapped", observedAt: "2026-07-14T00:00:00Z", source: "CRM" }],
    commercialImpact: 68000, recommendedAction: "Map and engage a second stakeholder",
    status: "active", dataFreshness: { level: "aging", updatedAt: "2026-07-14T00:00:00Z", source: "CRM" },
  },
];

/* ------------------------------------------------------------ commitments */

export const COMMITMENTS: Commitment[] = [
  { id: "cmt_mep_confirm", accountId: "acc_mep", title: "Confirm renewal decision date", kind: "Renewal confirmation", ownerUserId: "usr_zainab", dueDate: "2026-07-22", impact: "Renewal timing", status: "at_risk", relatedSignalId: "sig_mep_commitment", relatedPageId: "pg_mep_renewal" },
  { id: "cmt_mep_mapping", accountId: "acc_mep", title: "Assessment mapping sign-off", kind: "Assessment mapping", ownerUserId: "usr_mahmood", dueDate: "2026-07-20", impact: "Blocks renewal decision", status: "escalation_required", relatedSignalId: "sig_mep_commitment", relatedPageId: "pg_mep_renewal" },
  { id: "cmt_arla_remediation", accountId: "acc_arla", title: "Reporting defect remediation", kind: "Product remediation", ownerUserId: "usr_khalid", dueDate: "2026-07-14", impact: "Trust · renewal", status: "overdue", relatedSignalId: "sig_arla_overdue" },
  { id: "cmt_gulfair_analysis", accountId: "acc_gulfair", title: "Expansion analysis for 40 seats", kind: "Expansion analysis", ownerUserId: "usr_omar", dueDate: "2026-07-24", impact: "Expansion $48K", status: "on_track", relatedSignalId: "sig_gulfair_usage", relatedPageId: "pg_gulfair_expansion" },
  { id: "cmt_ikea_integration", accountId: "acc_ikea", title: "Telemetry integration fix", kind: "Integration delivery", ownerUserId: "usr_omar", dueDate: "2026-07-21", impact: "Data confidence", status: "awaiting_internal", relatedSignalId: "sig_ikea_stale" },
  { id: "cmt_beyon_exec", accountId: "acc_beyon", title: "Executive check-in meeting", kind: "Executive meeting", ownerUserId: "usr_layla", dueDate: "2026-07-25", impact: "Relationship", status: "awaiting_customer", relatedSignalId: "sig_beyon_relationship" },
  { id: "cmt_stc_security", accountId: "acc_stc", title: "Security questionnaire response", kind: "Security response", ownerUserId: "usr_layla", dueDate: "2026-07-19", impact: "Renewal · compliance", status: "at_risk" },
];

/* ---------------------------------------------------------------- actions */

export const ACTIONS: Action[] = [
  { id: "act_arla_escalate", accountId: "acc_arla", title: "Escalate overdue renewal to executive sponsor", ownerUserId: "usr_mahmood", dueDate: "2026-07-19", priority: "urgent", state: "open", originSignalId: "sig_arla_overdue", intendedOutcome: "Secure a confirmed decision date", relatedPageId: "pg_arla_rescue" },
  { id: "act_mep_confirm", accountId: "acc_mep", title: "Close assessment mapping with procurement", ownerUserId: "usr_mahmood", dueDate: "2026-07-19", priority: "urgent", state: "in_progress", originCommitmentId: "cmt_mep_mapping", originSignalId: "sig_mep_commitment", intendedOutcome: "Unblock the renewal decision", relatedPageId: "pg_mep_renewal" },
  { id: "act_gulfair_opp", accountId: "acc_gulfair", title: "Create expansion opportunity for 40 seats", ownerUserId: "usr_mahmood", dueDate: "2026-07-20", priority: "high", state: "open", originSignalId: "sig_gulfair_usage", intendedOutcome: "Convert utilisation into $48K expansion", relatedPageId: "pg_gulfair_expansion" },
  { id: "act_ikea_investigate", accountId: "acc_ikea", title: "Investigate stale telemetry connection", ownerUserId: "usr_omar", dueDate: "2026-07-19", priority: "high", state: "awaiting_internal", originSignalId: "sig_ikea_stale", intendedOutcome: "Restore trustworthy health data", relatedPageId: "pg_ikea_data" },
  { id: "act_beyon_stakeholder", accountId: "acc_beyon", title: "Map a second stakeholder relationship", ownerUserId: "usr_mahmood", dueDate: "2026-07-21", priority: "normal", state: "open", originSignalId: "sig_beyon_singledep", intendedOutcome: "Reduce single-stakeholder dependency" },
  { id: "act_mep_brief", accountId: "acc_mep", title: "Prepare executive briefing pack", ownerUserId: "usr_mahmood", dueDate: "2026-07-18", priority: "high", state: "open", originSignalId: "sig_mep_commitment", intendedOutcome: "Support the renewal decision meeting", relatedPageId: "pg_mep_renewal" },
  { id: "act_stc_security", accountId: "acc_stc", title: "Coordinate security questionnaire response", ownerUserId: "usr_mahmood", dueDate: "2026-07-17", priority: "high", state: "awaiting_internal", originCommitmentId: "cmt_stc_security", intendedOutcome: "Unblock compliance for renewal" },
  { id: "act_beyon_customer", accountId: "acc_beyon", title: "Await customer confirmation of exec check-in", ownerUserId: "usr_mahmood", dueDate: "2026-07-22", priority: "normal", state: "awaiting_customer", originCommitmentId: "cmt_beyon_exec", intendedOutcome: "Re-engage declining stakeholder" },
];

/* ------------------------------------------------------------ opportunities */

export const OPPORTUNITIES: Opportunity[] = [
  { id: "opp_gulfair", accountId: "acc_gulfair", title: "Gulf Air — 40 additional seats", estimatedValue: 48000, confidence: "high", createdAt: "2026-07-18T09:00:00Z", relatedSignalIds: ["sig_gulfair_usage"] },
];

/* ---------------------------------------------------- priorities (Focus now) */

export const PRIORITIES: Priority[] = [
  {
    id: "pri_arla", rank: 1, accountId: "acc_arla", state: "rescue", confidence: "high",
    reason: "Renewal is overdue by 4 days with no confirmed decision date.",
    drivers: [
      { label: "Overdue 4 days", weight: "primary" },
      { label: "ARR exposure $84K", weight: "primary" },
      { label: "Procurement unresponsive 11 days", weight: "secondary" },
    ],
    signalIds: ["sig_arla_overdue"], valueAtStake: 84000, valueKind: "exposure", timing: "Overdue 4 days",
    recommendedAction: "Escalate to the executive sponsor and secure a decision date",
    suggestedActionOwnerId: "usr_mahmood", dueDate: "2026-07-19",
    primaryCta: "escalate", secondaryCta: "review_account", _score: 98,
  },
  {
    id: "pri_mep", rank: 2, accountId: "acc_mep", state: "renew", confidence: "medium",
    reason: "Renews in 9 days but two commitments are unresolved.",
    drivers: [
      { label: "Renews in 9 days", weight: "primary" },
      { label: "ARR exposure $96K", weight: "primary" },
      { label: "Assessment mapping blocked", weight: "secondary" },
    ],
    signalIds: ["sig_mep_commitment"], valueAtStake: 96000, valueKind: "exposure", timing: "Renews in 9 days",
    recommendedAction: "Close the assessment mapping commitment with procurement",
    suggestedActionOwnerId: "usr_mahmood", dueDate: "2026-07-20",
    primaryCta: "take_action", secondaryCta: "review_account", _score: 92,
  },
  {
    id: "pri_gulfair", rank: 3, accountId: "acc_gulfair", state: "grow", confidence: "high",
    reason: "Licence utilisation at 94% with active demand for 40 more seats.",
    drivers: [
      { label: "Utilisation 94%", weight: "primary" },
      { label: "Expansion value $48K", weight: "primary" },
      { label: "Champion requested seats", weight: "secondary" },
    ],
    signalIds: ["sig_gulfair_usage"], valueAtStake: 48000, valueKind: "expansion", timing: "Demand active now",
    recommendedAction: "Create an expansion opportunity for 40 seats",
    suggestedActionOwnerId: "usr_mahmood", dueDate: "2026-07-20",
    primaryCta: "create_opportunity", secondaryCta: "review_account", _score: 80,
  },
  {
    id: "pri_ikea", rank: 4, accountId: "acc_ikea", state: "investigate", confidence: "low",
    reason: "Product telemetry has been stale for 12 days — health cannot be trusted.",
    drivers: [
      { label: "Telemetry stale 12 days", weight: "primary" },
      { label: "Confidence: low", weight: "primary" },
      { label: "Renews in 42 days", weight: "secondary" },
    ],
    signalIds: ["sig_ikea_stale"], valueAtStake: 72000, valueKind: "exposure", timing: "Data unreliable",
    recommendedAction: "Investigate the telemetry connection before assessing risk",
    suggestedActionOwnerId: "usr_omar", dueDate: "2026-07-19",
    primaryCta: "investigate", secondaryCta: "review_account", _score: 74,
  },
  {
    id: "pri_beyon", rank: 5, accountId: "acc_beyon", state: "stabilise", confidence: "medium",
    reason: "Manager participation is declining and the account depends on one stakeholder.",
    drivers: [
      { label: "Manager logins −60%", weight: "primary" },
      { label: "Single-stakeholder dependency", weight: "primary" },
      { label: "ARR exposure $68K", weight: "secondary" },
    ],
    signalIds: ["sig_beyon_relationship", "sig_beyon_singledep"], valueAtStake: 68000, valueKind: "exposure", timing: "Renews in 78 days",
    recommendedAction: "Re-establish a second stakeholder relationship",
    suggestedActionOwnerId: "usr_mahmood", dueDate: "2026-07-21",
    primaryCta: "create_intervention", secondaryCta: "review_account", _score: 66,
  },
];

/* --------------------------------------------------------- what changed */

export const CHANGES: ChangeFeedItem[] = [
  { id: "chg_gulfair", kind: "opportunity", accountId: "acc_gulfair", title: "Gulf Air became expansion-ready", explanation: "Licence utilisation crossed 94% with active seat demand.", occurredAt: "2026-07-18T05:00:00Z", significance: "high", evidenceIds: ["ev_gulf_1", "ev_gulf_2"] },
  { id: "chg_beyon", kind: "relationship", accountId: "acc_beyon", title: "Executive engagement declined at Beyon", explanation: "Manager logins dropped 60% over 30 days.", occurredAt: "2026-07-18T00:00:00Z", significance: "medium", evidenceIds: ["ev_beyon_1"] },
  { id: "chg_ikea_systemic", kind: "systemic", title: "Telemetry pipeline degraded for 3 accounts", explanation: "A connector fault left IKEA, Beyon and Majid Al Futtaim with stale product data.", occurredAt: "2026-07-17T12:00:00Z", significance: "high", evidenceIds: ["ev_ikea_1"] },
  { id: "chg_arla", kind: "risk", accountId: "acc_arla", title: "Arla renewal became overdue", explanation: "Contract end date passed with no decision on record.", occurredAt: "2026-07-16T00:00:00Z", significance: "high", evidenceIds: ["ev_arla_1"] },
  { id: "chg_ikea_data", kind: "data_confidence", accountId: "acc_ikea", title: "IKEA telemetry became stale", explanation: "No refresh for 12 days — health confidence downgraded to low.", occurredAt: "2026-07-17T00:00:00Z", significance: "medium", evidenceIds: ["ev_ikea_1"] },
  { id: "chg_stc", kind: "commercial", accountId: "acc_stc", title: "stc security response now at risk", explanation: "Questionnaire due today is awaiting an internal owner.", occurredAt: "2026-07-19T06:00:00Z", significance: "medium", evidenceIds: [] },
  { id: "chg_mep_recover", kind: "recovery", accountId: "acc_mep", title: "MEP executive sponsor re-engaged", explanation: "Sponsor confirmed availability for a decision meeting.", occurredAt: "2026-07-17T15:00:00Z", significance: "low", evidenceIds: ["ev_mep_2"] },
];

/* ---------------------------------------------------------- patterns */

export const PATTERNS: Pattern[] = [
  { id: "pat_exec", title: "Executive engagement declining across strategic accounts", explanation: "Senior-stakeholder participation is trending down at three strategic accounts over the last 30 days.", accountIds: ["acc_beyon", "acc_arla", "acc_mep"], arrAffected: 248000, arrKind: "exposure", confidence: "medium", freshness: { level: "recent", updatedAt: "2026-07-18T00:00:00Z", source: "Engagement analytics" } },
  { id: "pat_telemetry", title: "One telemetry connector fault affects multiple customers", explanation: "A single pipeline issue left three accounts with stale product data, undermining health confidence.", accountIds: ["acc_ikea", "acc_beyon", "acc_majid"], arrAffected: 204000, arrKind: "exposure", confidence: "high", freshness: { level: "fresh", updatedAt: "2026-07-19T04:00:00Z", source: "Data pipeline" } },
  { id: "pat_expansion", title: "Aviation & telecom segment showing credible expansion demand", explanation: "High licence utilisation with seat requests suggests expansion capacity across two enterprise accounts.", accountIds: ["acc_gulfair", "acc_zain"], arrAffected: 92000, arrKind: "opportunity", confidence: "medium", freshness: { level: "fresh", updatedAt: "2026-07-19T02:00:00Z", source: "Product telemetry" } },
];

/* ----------------------------------------------------- portfolio summary */

export const PORTFOLIO_SUMMARY: PortfolioSummary = {
  needsAttention: { status: "ok", value: 7, formatted: "7", deltaLabel: "+2 this week", deltaTone: "up", sub: "accounts" },
  arrExposed: { status: "ok", value: 284000, formatted: "$284K", deltaLabel: "+$31K this week", deltaTone: "up", sub: "at risk" },
  renewing90: { status: "ok", value: 412000, formatted: "$412K", sub: "8 accounts · 63% have a confirmed plan" },
  expansionReady: { status: "ok", value: 236000, formatted: "$236K", sub: "5 qualified accounts" },
};

export const WORK_COUNTS: WorkCounts = { overdue: 3, dueToday: 4, awaitingInternal: 2, awaitingCustomer: 1 };

/* ------------------------------------------------- historical snapshots */

/** As of 2026-07-12 the picture was materially different — Arla was not yet
 *  overdue, Gulf Air had not crossed the expansion threshold, IKEA telemetry
 *  was still fresh. Snapshots are stored, never recomputed from "now". */
export const SNAPSHOTS: HistoricalSnapshot[] = [
  {
    date: "2026-07-12",
    summary: {
      needsAttention: { status: "ok", value: 5, formatted: "5", deltaLabel: "+1 vs prior week", deltaTone: "up", sub: "accounts" },
      arrExposed: { status: "ok", value: 253000, formatted: "$253K", deltaLabel: "flat", deltaTone: "flat", sub: "at risk" },
      renewing90: { status: "ok", value: 412000, formatted: "$412K", sub: "8 accounts · 50% have a confirmed plan" },
      expansionReady: { status: "ok", value: 188000, formatted: "$188K", sub: "4 qualified accounts" },
    },
    priorityIds: ["pri_mep", "pri_beyon", "pri_gulfair"],
    changeIds: ["chg_mep_recover"],
    commitmentStatuses: {
      cmt_arla_remediation: "at_risk", cmt_mep_confirm: "on_track", cmt_mep_mapping: "at_risk",
      cmt_gulfair_analysis: "on_track", cmt_ikea_integration: "on_track", cmt_beyon_exec: "on_track", cmt_stc_security: "on_track",
    },
  },
];

/* --------------------------------------------------- historical events */

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  { id: "he_arla_overdue", entityType: "commitment", entityId: "cmt_arla_remediation", eventType: "status_changed", occurredAt: "2026-07-14T00:00:00Z", recordedAt: "2026-07-16T06:10:00Z", effectiveAt: "2026-07-15T00:00:00Z", previousValue: "at_risk", newValue: "overdue", source: "Commitments" },
  { id: "he_arla_renewal", entityType: "account", entityId: "acc_arla", eventType: "renewal_overdue", occurredAt: "2026-07-15T00:00:00Z", recordedAt: "2026-07-16T06:00:00Z", effectiveAt: "2026-07-16T00:00:00Z", previousValue: "renewal", newValue: "overdue", source: "CRM" },
  { id: "he_gulf_expansion", entityType: "signal", entityId: "sig_gulfair_usage", eventType: "signal_detected", occurredAt: "2026-07-18T05:00:00Z", recordedAt: "2026-07-18T05:05:00Z", effectiveAt: "2026-07-18T05:00:00Z", newValue: "expansion_ready", source: "Product telemetry" },
  { id: "he_ikea_stale", entityType: "signal", entityId: "sig_ikea_stale", eventType: "data_stale", occurredAt: "2026-07-07T00:00:00Z", recordedAt: "2026-07-17T12:00:00Z", effectiveAt: "2026-07-17T00:00:00Z", newValue: "stale", source: "Data pipeline" },
];

/* --------------------------------------------------- account timelines */

export const TIMELINE_EVENTS: TimelineEvent[] = [
  { id: "tl_arla_1", accountId: "acc_arla", filter: "commercial", title: "Renewal became overdue", previousState: "In renewal", newState: "Overdue", evidenceSource: "CRM", occurredAt: "2026-07-15T00:00:00Z", recordedAt: "2026-07-16T06:00:00Z" },
  { id: "tl_arla_2", accountId: "acc_arla", filter: "product", title: "Reporting defect logged", newState: "Open", evidenceSource: "Support", actorId: "usr_sara", occurredAt: "2026-07-02T00:00:00Z", recordedAt: "2026-07-02T09:00:00Z" },
  { id: "tl_arla_3", accountId: "acc_arla", filter: "commitments", title: "Remediation commitment slipped", previousState: "On track", newState: "Overdue", evidenceSource: "Commitments", actorId: "usr_khalid", occurredAt: "2026-07-14T00:00:00Z", recordedAt: "2026-07-16T06:10:00Z" },
  { id: "tl_mep_1", accountId: "acc_mep", filter: "relationship", title: "Executive sponsor re-engaged", previousState: "Unresponsive", newState: "Available", evidenceSource: "CRM", actorId: "usr_zainab", occurredAt: "2026-07-17T15:00:00Z", recordedAt: "2026-07-17T15:05:00Z" },
  { id: "tl_gulf_1", accountId: "acc_gulfair", filter: "adoption", title: "Licence utilisation crossed 94%", previousState: "81%", newState: "94%", evidenceSource: "Product telemetry", occurredAt: "2026-07-18T05:00:00Z", recordedAt: "2026-07-18T05:05:00Z" },
  { id: "tl_ikea_1", accountId: "acc_ikea", filter: "product", title: "Telemetry connection stalled", previousState: "Fresh", newState: "Stale (12 days)", evidenceSource: "Data pipeline", occurredAt: "2026-07-07T00:00:00Z", recordedAt: "2026-07-17T12:00:00Z" },
];
