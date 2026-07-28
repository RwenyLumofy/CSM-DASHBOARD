/* =========================================================================
   The Use Case Universe — what each published use case actually MEANS.

   lib/use-cases.ts owns the taxonomy: the 23 ids, their categories, and the
   aliases that keep historical HubSpot values resolvable. This file owns the
   editorial layer on top: definition, what it looks like in practice, how you
   know it's working, how it usually fails, who owns it client-side.

   WHY IT EXISTS. The picker offered labels and nothing else, so "Job-Role-
   Specific Training" and "Technical Skills Training" were indistinguishable at
   the moment of choosing — which is exactly when the distinction matters.
   Selection without definition produces a taxonomy everybody fills in
   differently and nobody can report on.

   BASELINE, NOT SCRIPTURE. `definition` and `summary` follow the published
   deck. Everything else — practice, evidence, pitfalls — is a starting point
   written to be argued with. The team edits it in-app; overrides live in
   workspace_config under `use_case_library` and merge over these at read time,
   field by field, so a bad edit is always recoverable by clearing it and the
   shipped baseline is never destroyed.

   `stakeholderRoles` reuses ids from lib/stakeholders/profile so the Universe
   joins to real stakeholder records rather than restating them as prose.
   ========================================================================= */

import type { StakeholderRole } from "@/lib/stakeholders/profile";

export interface UseCaseEntry {
  /** Matches a UseCaseOption id in lib/use-cases.ts. */
  id: string;
  /** One sentence — what the client is trying to achieve. */
  definition: string;
  /** What it actually looks like inside the account. */
  inPractice: string;
  /** Recognisable activities — helps tell neighbouring use cases apart. */
  examples: string[];
  /** Observable evidence it is working. */
  evidence: string[];
  /** The way this one usually goes wrong. */
  pitfall: string;
  /** Who normally owns it on the client side. */
  stakeholderRoles: StakeholderRole[];
}

export const USE_CASE_LIBRARY: UseCaseEntry[] = [
  /* ── Enablement ─────────────────────────────────────────────────────── */
  {
    id: "talent_strategy_activation",
    definition: "Aligning every talent initiative — learning, performance, assessment — behind the organisation's stated goals.",
    inPractice: "The broadest engagement there is. Multiple programmes run under one strategy, usually sponsored at executive level and reviewed against business objectives rather than completion rates.",
    examples: ["A talent strategy with learning, performance and assessment tracks running together", "Executive reporting tying platform activity to business objectives", "Multi-year roadmap with staged programme launches"],
    evidence: ["Several use cases live on one account rather than a single programme", "Executive sponsor engaged in review cycles, not just at signature", "Reporting requested at organisation level, not team level"],
    pitfall: "Sold as a strategy and delivered as a content library, so the alignment never materialises and renewal is judged on usage numbers alone.",
    stakeholderRoles: ["executive_sponsor", "economic_buyer", "decision_maker"],
  },
  {
    id: "centralized_learning_academy",
    definition: "Consolidating all programmes, content and reporting into one place.",
    inPractice: "A consolidation programme — the value is as much in what gets switched off as in what gets used.",
    examples: ["Migrating content from legacy systems", "Retiring departmental tools", "One reporting view across previously separate functions"],
    evidence: ["Breadth of adoption across departments rather than depth in one", "Legacy tools actually decommissioned", "Reporting used by people who previously had none"],
    pitfall: "The old tools are never switched off, so Lumofy becomes an additional system rather than a replacement — and renewal turns into a cost conversation.",
    stakeholderRoles: ["economic_buyer", "executive_sponsor", "technical_evaluator", "administrator"],
  },

  /* ── Readiness & Transformation ─────────────────────────────────────── */
  {
    id: "employee_onboarding",
    definition: "Streamlining onboarding so new joiners become productive faster, and consistently.",
    inPractice: "A structured path a joiner is enrolled on from day one, mixing company context, role content and early checkpoints.",
    examples: ["A 30/60/90 path assigned on start date", "Induction content with completion tracking", "Manager check-in prompts at set intervals"],
    evidence: ["Joiners activating within days of start date, not weeks", "Consistent completion across cohorts rather than a few keen individuals", "Time-to-productivity shortening cohort over cohort"],
    pitfall: "Built once for one department and never adapted, so joiners elsewhere get content that doesn't describe their job and quietly stop.",
    stakeholderRoles: ["administrator", "manager", "implementer"],
  },
  {
    id: "compliance_training",
    definition: "Meeting regulatory obligations, with evidence.",
    inPractice: "Non-negotiable, deadline-bound and audited. Completion is the outcome, not a proxy for one.",
    examples: ["Mandatory annual modules", "Certification of completion for audit", "Automatic reassignment on expiry"],
    evidence: ["Completion approaching total — partial is an audit finding", "Evidence exportable in the form the regulator wants", "Expiry handled before the deadline, not after"],
    pitfall: "Judged by engagement metrics, which are beside the point — nobody enjoys compliance training and that was never the goal.",
    stakeholderRoles: ["administrator", "legal", "decision_maker"],
  },
  {
    id: "certification_prep",
    definition: "Getting people through an external certification the business needs them to hold.",
    inPractice: "Time-boxed and deadline-driven, with a hard external pass/fail at the end. Cross-listed under Capability Building because it also builds durable skill.",
    examples: ["Exam-prep paths with practice assessments", "Cohorts aligned to exam dates", "Tracking who holds which certification and when it lapses"],
    evidence: ["Activity concentrating before exam dates", "Pass rates as the outcome measure", "Renewal cycles handled before expiry"],
    pitfall: "Treated as a content problem when it's a scheduling one — people fail because nobody protected their study time.",
    stakeholderRoles: ["manager", "administrator"],
  },
  {
    id: "gdp",
    definition: "Developing graduates into ready professionals through a structured early-career programme.",
    inPractice: "A defined cohort, fixed curriculum and rotation, running one to two years with visible progression milestones.",
    examples: ["A graduate cohort on a shared curriculum", "Rotation checkpoints", "Cohort assessments and feedback cycles"],
    evidence: ["The whole cohort progressing rather than fragmenting", "Retention through the programme", "Placement into permanent roles at the end"],
    pitfall: "Designed around the intake and never around the exit, so graduates finish with no defined destination.",
    stakeholderRoles: ["manager", "administrator", "executive_sponsor"],
  },
  {
    id: "succession_hipo",
    definition: "Preparing identified high-potential people for specific future leadership roles.",
    inPractice: "A small, high-value population with individual plans, visible to senior leadership and usually confidential.",
    examples: ["Development plans for identified successors", "Readiness assessment against the target role", "Stretch assignments tracked alongside learning"],
    evidence: ["Plans that change over time — a static plan is a filed one", "Readiness scores moving", "Actual internal appointments from the pool"],
    pitfall: "Confidentiality means very few people discuss it, so it drifts off the platform into a spreadsheet nobody else can see.",
    stakeholderRoles: ["executive_sponsor", "decision_maker", "manager"],
  },
  {
    id: "career_transition",
    definition: "Preparing employees to succeed in their next role, whatever that turns out to be.",
    inPractice: "Broader than succession: not a named successor for a named role, but people moving laterally, into new functions, or through restructuring.",
    examples: ["Transition paths between job families", "Readiness content for people changing function", "Support during restructuring or redeployment"],
    evidence: ["Internal mobility actually happening", "Engagement from people mid-transition rather than only at announcement", "Time-to-competency in the new role"],
    pitfall: "Confused with upskilling. Upskilling grows capability in place; this is about moving somebody somewhere else, and the measures differ.",
    stakeholderRoles: ["manager", "administrator", "end_user_representative"],
  },
  {
    id: "hiring_role_assessments",
    definition: "Improving talent decisions across job roles using structured assessment.",
    inPractice: "Sits in the recruitment or placement process, often with volume and time pressure attached.",
    examples: ["Pre-hire assessments in the funnel", "Structured scoring against role requirements", "Benchmarking candidates against a role profile"],
    evidence: ["Assessment volume tracking hiring volume", "Consistency of scoring across assessors", "Quality-of-hire measured after the fact"],
    pitfall: "Owned by recruitment rather than L&D, so it is invisible to the CS relationship until renewal — and nobody in the conversation uses it.",
    stakeholderRoles: ["decision_maker", "administrator"],
  },
  {
    id: "ai_readiness",
    definition: "Building organisational understanding and readiness for AI integration.",
    inPractice: "Usually starts as awareness across a broad population, then narrows to role-specific application. Often executive-initiated and fast-moving.",
    examples: ["AI literacy content across the organisation", "Role-specific application for functions adopting AI tools", "Policy and responsible-use content alongside capability"],
    evidence: ["Broad initial reach followed by depth in specific functions", "Content refreshed as the tooling changes", "Demand emerging from functions rather than only from the centre"],
    pitfall: "Delivered once as generic awareness, which ages within months and never converts into anyone doing their job differently.",
    stakeholderRoles: ["executive_sponsor", "champion", "technical_evaluator"],
  },
  {
    id: "digital_transformation",
    definition: "Preparing the workforce for digital maturity and adoption.",
    inPractice: "The people half of a technology programme — usually running alongside a system implementation with its own deadlines.",
    examples: ["Capability building ahead of a system rollout", "Digital skills baselines by function", "Change-adoption content tied to go-live dates"],
    evidence: ["Activity synchronised with the wider programme's milestones", "Adoption of the new systems, not just completion of the training", "Sustained use after go-live rather than a spike"],
    pitfall: "Scheduled after the technology instead of before it, so training lands when people have already formed workarounds.",
    stakeholderRoles: ["executive_sponsor", "technical_evaluator", "manager"],
  },

  /* ── Capability Building ────────────────────────────────────────────── */
  {
    id: "upskilling_reskilling",
    definition: "Building future-ready capabilities across roles, rather than hiring for them.",
    inPractice: "Tied to a strategic shift — new technology, new market, restructuring — with a defined target population.",
    examples: ["Reskilling paths for a role being automated", "Digital-skills programmes across a population", "Transition paths into scarce roles"],
    evidence: ["A defined population moving through together", "Internal moves into the target roles", "Sustained engagement over months, not a launch spike"],
    pitfall: "Announced as strategic, then measured only by completion, so nobody can say whether anyone's capability actually changed.",
    stakeholderRoles: ["executive_sponsor", "economic_buyer", "manager"],
  },
  {
    id: "technical_skills",
    definition: "Building functional and role-specific technical capability.",
    inPractice: "Depth within a function — engineering, finance, operations — owned by that function as its own standard.",
    examples: ["A function-owned technical curriculum", "Certification-adjacent technical content", "Tooling and systems training for specialists"],
    evidence: ["Adoption spread across the function rather than one team", "Content referenced in the function's own onboarding", "Managers assigning it without prompting"],
    pitfall: "Overlaps Job-Role-Specific Training so heavily that the two get used interchangeably, and neither can then be reported on.",
    stakeholderRoles: ["manager", "champion", "technical_evaluator"],
  },
  {
    id: "job_role_specific",
    definition: "Building the specific skills employees need to perform their current role.",
    inPractice: "Content mapped to roles, so a person sees what their role requires rather than a general catalogue.",
    examples: ["Role-based learning paths", "Per-person skill gaps identified and filled", "Practical assessment against the role's actual tasks"],
    evidence: ["Assignment following role changes", "Completion concentrated in the targeted roles", "Managers using gaps in review conversations"],
    pitfall: "The broadest label available, so it becomes the default whenever nobody is certain — which is why it is on 23 deals, far more than any other, and why that number should be treated with suspicion.",
    stakeholderRoles: ["manager", "administrator", "end_user_representative"],
  },
  {
    id: "leadership_development",
    definition: "Strengthening leadership behaviours and decision-making.",
    inPractice: "A cohort programme for existing or prospective leaders, usually with assessment and a development plan attached.",
    examples: ["A leadership programme run in cohorts", "360 feedback feeding individual plans", "A leadership competency framework applied in reviews"],
    evidence: ["Cohorts progressing together rather than drifting apart", "Feedback cycles completing, not just launching", "Plans updated after each cycle"],
    pitfall: "Sponsored by an executive who then disengages, leaving a programme with budget and no authority.",
    stakeholderRoles: ["executive_sponsor", "champion", "manager"],
  },
  {
    id: "products_services_knowledge",
    definition: "Deepening understanding of the company's own offerings, so staff can explain and deliver them.",
    inPractice: "Content maintained alongside releases, consumed by commercial and frontline teams. Covers both product and service knowledge — HubSpot still splits these into two options; the taxonomy treats them as one.",
    examples: ["A module per product or service line, refreshed each release", "Short assessments before a launch", "A reference library used in the field"],
    evidence: ["Usage spiking around release dates rather than staying flat", "Repeat visits to the same reference material — it's being used, not just completed", "Assessment scores rising on newer offerings"],
    pitfall: "Content ages faster than anyone updates it, and the library becomes actively misleading.",
    stakeholderRoles: ["manager", "administrator"],
  },

  /* ── Performance Management ─────────────────────────────────────────── */
  {
    id: "performance_management",
    definition: "Aligning individual goals with organisational KPIs, through a recurring cycle.",
    inPractice: "Hard dates, near-total population, and every manager involved.",
    examples: ["Goal setting at cycle start", "Mid-year and year-end reviews", "Calibration across managers"],
    evidence: ["Completion rates near total — a half-completed cycle is a failed one", "Managers submitting on time", "Ratings distributed rather than clustered"],
    pitfall: "Adoption looks strong during the cycle and collapses between them. Read without accounting for that rhythm, the trough looks like churn risk.",
    stakeholderRoles: ["executive_sponsor", "economic_buyer", "administrator", "manager"],
  },
  {
    id: "competency_framework",
    definition: "Defining clear role expectations — what good looks like, per role.",
    inPractice: "Foundational and usually slow. A prerequisite for assessment, IDPs and succession rather than an end in itself.",
    examples: ["Competency definitions per job family", "Proficiency levels per competency", "Roles mapped onto the framework"],
    evidence: ["The framework actually referenced by other processes", "Coverage across job families rather than one pilot", "Revision over time rather than a single publication"],
    pitfall: "Built to perfection and never applied. A framework nothing else uses is a cost, not an asset.",
    stakeholderRoles: ["decision_maker", "administrator", "champion"],
  },
  {
    id: "idp",
    definition: "Defining personalised development actions per person.",
    inPractice: "The connective tissue between assessment and learning — where an identified gap becomes a commitment with a date.",
    examples: ["Plans created after assessment or review", "Manager-agreed objectives with target dates", "Progress reviewed at set points"],
    evidence: ["Plans updated between cycles rather than written once", "Linked learning actually started", "Manager participation, not just employee"],
    pitfall: "Created during the review cycle and never opened again, so it becomes a compliance artefact rather than a plan.",
    stakeholderRoles: ["manager", "end_user_representative"],
  },
  {
    id: "feedback_360",
    definition: "Gathering insight on an individual from peers, managers and reports.",
    inPractice: "Run in cycles for a defined population, feeding development plans. Cross-listed under Assessment because it is also a measurement instrument.",
    examples: ["360 cycles for a leadership population", "Reports delivered with a development conversation", "Repeat cycles measuring movement"],
    evidence: ["Response rates high enough to be credible", "Reports actually opened and discussed", "A second cycle happening at all"],
    pitfall: "Run once, reports distributed, no conversation scheduled — which teaches everyone that responding is pointless, and kills the next cycle.",
    stakeholderRoles: ["administrator", "manager", "champion"],
  },
  {
    id: "tna",
    definition: "Discovering skill gaps to guide what learning gets built or bought.",
    inPractice: "A diagnostic exercise, often annual, that shapes the L&D plan and budget. Cross-listed under Assessment.",
    examples: ["Needs analysis across functions", "Gap analysis against the competency framework", "A prioritised training plan derived from findings"],
    evidence: ["Findings visibly shaping what gets built", "Repeat analysis year over year", "Budget allocated against identified gaps"],
    pitfall: "Analysis performed, plan written, and then content bought on a completely different basis.",
    stakeholderRoles: ["administrator", "economic_buyer", "champion"],
  },

  /* ── Assessment ─────────────────────────────────────────────────────── */
  {
    id: "internal_assessment_hub",
    definition: "Centralising talent assessment across the organisation.",
    inPractice: "Assessment as shared infrastructure rather than a one-off exercise — the same instruments used for hiring, development and succession.",
    examples: ["A standard assessment library available to every function", "Consistent instruments across hiring and development", "Assessment history retained per person"],
    evidence: ["Assessments run by more than one function", "Output feeding actual decisions, not filed", "Reuse of instruments rather than new ones each time"],
    pitfall: "Assessment as an event with no decision attached — data gathered, nothing changed.",
    stakeholderRoles: ["decision_maker", "administrator", "manager"],
  },

  /* ── Engagement ─────────────────────────────────────────────────────── */
  {
    id: "culture_engagement",
    definition: "Fostering connection, belonging and motivation across the organisation.",
    inPractice: "Measurement plus action — surveys owned by HR, reported to the executive, with visible follow-through.",
    examples: ["Engagement or pulse surveys", "Results broken down by team", "Action plans tracked against results"],
    evidence: ["Participation high enough to be representative", "Action plans created after results, not just reports circulated", "Movement between waves"],
    pitfall: "Surveying without acting, which reduces participation every wave until the data is worthless.",
    stakeholderRoles: ["executive_sponsor", "administrator"],
  },

  /* ── Outside the published 23 ───────────────────────────────────────── */
  {
    id: "qiwa_disclosure",
    definition: "Meeting Saudi Qiwa platform training-disclosure obligations.",
    inPractice: "A specific regulatory reporting requirement in the Saudi market, with defined data and deadlines. It is on 8 deals — more than most published use cases — but appears nowhere in the published taxonomy, so it needs a decision: fold it into Compliance Training, or add it as a 24th.",
    examples: ["Recording training hours in the required form", "Producing disclosure reports on schedule", "Keeping evidence aligned to the regulation"],
    evidence: ["Disclosure submitted on time", "Data complete enough to satisfy the requirement", "No remediation requests"],
    pitfall: "Treated as a reporting afterthought, so the underlying data was never captured in the shape the regulator wants.",
    stakeholderRoles: ["administrator", "legal", "procurement"],
  },
  {
    id: "internal_knowledge_base",
    definition: "Capturing what the organisation knows internally so it survives people leaving.",
    inPractice: "Internally authored content built up over time. Closest published relative is Centralized Learning Academy, but the emphasis is authoring rather than consolidation.",
    examples: ["Documented internal processes", "Recorded walkthroughs of internal systems", "A searchable library of institutional know-how"],
    evidence: ["Content volume growing from internal authors", "Search and repeat access rather than one-time completion", "Referenced during onboarding"],
    pitfall: "Authoring depends on a few enthusiasts; when they move on the base freezes and slowly becomes wrong.",
    stakeholderRoles: ["champion", "administrator"],
  },
  {
    id: "expertise_sharing",
    definition: "Turning what top performers and subject-matter experts know into content others can use.",
    inPractice: "Two HubSpot options — top performers and SMEs — folded into one, since the mechanism is identical and only the motivation differs (performance versus scarcity).",
    examples: ["Recorded sessions from top performers", "SME-authored deep dives", "Peer-led content series"],
    evidence: ["Contribution from more than one or two people", "Consumption by the intended peer group", "Questions arriving to content rather than to the individual"],
    pitfall: "The best people are also the busiest. Asked to author on top of a full workload with no time allocated, it never starts.",
    stakeholderRoles: ["champion", "technical_evaluator"],
  },
  {
    id: "unclear",
    definition: "Nobody has yet established what this account is trying to achieve.",
    inPractice: "An honest early state and a legitimate answer during onboarding. It stops being acceptable once the account is live and adopting.",
    examples: ["Bought on a general capability argument with no specific programme", "The original sponsor left before the purpose was documented", "Several departments bought in for different reasons, none recorded"],
    evidence: ["There is none, and that is the point — an account here cannot be measured against intent, because no intent exists to measure against."],
    pitfall: "Left in place indefinitely. An account with no established purpose has no definition of success, so renewal becomes a price negotiation rather than a value conversation.",
    stakeholderRoles: ["champion", "executive_sponsor"],
  },
  {
    id: "other",
    definition: "A genuine use case the taxonomy does not yet cover.",
    inPractice: "Should be rare. Recurring use is a signal the taxonomy needs a new entry, not that the account is unusual.",
    examples: ["A market-specific requirement with no equivalent elsewhere", "A use case emerging ahead of the taxonomy"],
    evidence: ["Written up in the account notes so it can be recognised if it recurs"],
    pitfall: "Used as a shortcut when the right option exists but wasn't obvious — which is a picker problem, and it hides real patterns.",
    stakeholderRoles: [],
  },
];

export const LIBRARY_BY_ID = new Map(USE_CASE_LIBRARY.map((e) => [e.id, e]));

/** Team-authored additions, stored in workspace_config. */
export const LIBRARY_OVERRIDE_KEY = "use_case_library";

export type UseCaseOverride = Partial<Omit<UseCaseEntry, "id">> & {
  updatedAt?: string;
  updatedBy?: string;
};

/**
 * Baseline merged with the team's own edits.
 *
 * Field-level, not entry-level: correcting one pitfall must not blank the
 * definition and examples nobody touched. Arrays REPLACE rather than
 * concatenate, so an edit that removes a wrong example can actually remove it.
 */
export function mergeLibrary(overrides: Record<string, UseCaseOverride> | null | undefined): UseCaseEntry[] {
  if (!overrides) return USE_CASE_LIBRARY;
  return USE_CASE_LIBRARY.map((base) => {
    const o = overrides[base.id];
    if (!o) return base;
    return {
      ...base,
      definition: o.definition?.trim() || base.definition,
      inPractice: o.inPractice?.trim() || base.inPractice,
      examples: Array.isArray(o.examples) && o.examples.length ? o.examples : base.examples,
      evidence: Array.isArray(o.evidence) && o.evidence.length ? o.evidence : base.evidence,
      pitfall: o.pitfall?.trim() || base.pitfall,
      stakeholderRoles: Array.isArray(o.stakeholderRoles) && o.stakeholderRoles.length ? o.stakeholderRoles : base.stakeholderRoles,
    };
  });
}

/** True when the team has edited this entry away from the shipped baseline. */
export function isCustomised(id: string, overrides: Record<string, UseCaseOverride> | null | undefined): boolean {
  const o = overrides?.[id];
  if (!o) return false;
  return Object.keys(o).some((k) => k !== "updatedAt" && k !== "updatedBy");
}
