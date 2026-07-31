/* =========================================================================
   Use cases — the published Lumofy taxonomy.

   SOURCE OF TRUTH is "Lumofy Use Cases by Category": 23 use cases across 6
   categories. Not the HubSpot `use_cases` picklist, which predates it and has
   drifted badly — 11 of the 23 cannot be selected in HubSpot at all (nobody
   can record AI Readiness or Digital Transformation on a deal), and two
   HubSpot options collapse into one published use case.

   THREE THINGS THIS FILE GETS RIGHT THAT THE PREVIOUS MODEL DID NOT

   1. A use case can belong to SEVERAL categories. 360° Feedback, Certification
      Preparation and TNA each sit in two — that's 26 category slots over 23
      distinct use cases. Modelling one group per use case loses the deck's own
      cross-references.

   2. Live HubSpot values are aliased onto canonical ids on READ. No migration,
      nothing rewritten, and every historical value stays resolvable.

   "Unclear" and "Other" were carried as selectable entries; they are gone.
   Neither names something a client is trying to achieve — they record that
   nobody wrote one down, which is a gap in the data, not a use case. The
   HubSpot values now resolve to nothing and surface as unrecognised, which
   states the same fact without pretending it is a category.

   3. A value with real usage and no canonical home is NOT silently folded away.
      Qiwa Disclosure is on 8 deals — the second most-used value in the whole
      book — and appears nowhere in the published 23. Quietly mapping it to
      Compliance Training would erase a distinct regulatory obligation and make
      the discrepancy invisible. It's carried in UNRESOLVED instead, so it keeps
      working and stays visible as a taxonomy decision somebody has to make.
   ========================================================================= */

export type UseCaseGroup =
  | "enablement" | "readiness" | "capability" | "performance" | "assessment" | "engagement";

export interface UseCaseOption {
  id: string;
  label: string;
  /** Short line from the deck. */
  summary: string;
  /** Every category this belongs to — several, for the cross-listed ones. */
  groups: UseCaseGroup[];
  /** True for values that carry real data but sit outside the published 23. */
  unresolved?: boolean;
}

export const USE_CASE_GROUPS: { id: UseCaseGroup; label: string; blurb: string }[] = [
  { id: "enablement", label: "Enablement", blurb: "Consolidate and activate L&D at scale" },
  { id: "readiness", label: "Readiness & Transformation", blurb: "Prepare the workforce for what's next" },
  { id: "capability", label: "Capability Building", blurb: "Build the skills the business needs" },
  { id: "performance", label: "Performance Management", blurb: "Connect goals, KPIs, and growth" },
  { id: "assessment", label: "Assessment", blurb: "Measure capability with evidence" },
  { id: "engagement", label: "Engagement", blurb: "Build connection, belonging, and motivation" },
];

/** The published 23, in deck order, plus the unresolved tail. */
export const USE_CASES: UseCaseOption[] = [
  // ── Enablement (2)
  { id: "talent_strategy_activation", label: "End-to-End Talent Strategy Activation", summary: "Align talent initiatives with organizational goals.", groups: ["enablement"] },
  { id: "centralized_learning_academy", label: "Centralized Learning Academy", summary: "Consolidate all programs, content, and reporting.", groups: ["enablement"] },

  // ── Readiness & Transformation (9)
  { id: "employee_onboarding", label: "Employee Onboarding", summary: "Streamline onboarding across teams.", groups: ["readiness"] },
  { id: "compliance_training", label: "Compliance Training", summary: "Meet evolving regulatory needs.", groups: ["readiness"] },
  { id: "certification_prep", label: "Certification Preparation", summary: "Support industry certification readiness.", groups: ["readiness", "capability"] },
  { id: "gdp", label: "Graduate Development Program (GDP)", summary: "Develop graduates into ready professionals.", groups: ["readiness"] },
  { id: "succession_hipo", label: "Succession Development (HiPo)", summary: "Prepare successors for future leadership roles.", groups: ["readiness"] },
  { id: "career_transition", label: "Career Transition Readiness", summary: "Prepare employees to succeed in their next role.", groups: ["readiness"] },
  { id: "hiring_role_assessments", label: "Hiring & Role-Based Assessments", summary: "Improve talent decisions across job roles.", groups: ["readiness"] },
  { id: "ai_readiness", label: "AI Readiness", summary: "Build understanding and readiness for AI integration.", groups: ["readiness"] },
  { id: "digital_transformation", label: "Digital Transformation", summary: "Prepare workforce for digital maturity and adoption.", groups: ["readiness"] },

  // ── Capability Building (6 — certification_prep is cross-listed above)
  { id: "upskilling_reskilling", label: "Upskilling & Reskilling", summary: "Build future-ready capabilities across roles.", groups: ["capability"] },
  { id: "technical_skills", label: "Technical Skills Training", summary: "Build functional and role-specific capabilities.", groups: ["capability"] },
  { id: "job_role_specific", label: "Job-Role-Specific Training", summary: "Build the skills employees need to perform.", groups: ["capability"] },
  { id: "leadership_development", label: "Leadership Development", summary: "Strengthen leadership behaviors and decision-making.", groups: ["capability"] },
  { id: "products_services_knowledge", label: "Products & Services Knowledge Enablement", summary: "Deepen understanding of company offerings.", groups: ["capability"] },

  // ── Performance Management (5)
  { id: "performance_management", label: "Performance Management", summary: "Align goals with KPIs.", groups: ["performance"] },
  { id: "competency_framework", label: "Competency Framework Development", summary: "Define clear role expectations.", groups: ["performance"] },
  { id: "idp", label: "Individual Development Plans (IDPs)", summary: "Define personalized development actions.", groups: ["performance"] },
  { id: "feedback_360", label: "360° Feedback", summary: "Get insight from peers and managers.", groups: ["performance", "assessment"] },
  { id: "tna", label: "Training Needs Analysis (TNA)", summary: "Discover skill gaps to guide learning.", groups: ["performance", "assessment"] },

  // ── Assessment (3 — feedback_360 and tna cross-listed above)
  { id: "internal_assessment_hub", label: "Building Internal Assessment Hub", summary: "Centralize talent assessments across the org.", groups: ["assessment"] },

  // ── Engagement (1)
  { id: "culture_engagement", label: "Culture & Engagement", summary: "Foster connection, belonging, and motivation.", groups: ["engagement"] },

  /* ── Outside the published 23 ────────────────────────────────────────────
     Real values with real deal data and no canonical home. Kept selectable so
     nothing breaks and no history becomes unreadable, and flagged so the
     discrepancy stays visible rather than being resolved by silent guesswork. */
  { id: "qiwa_disclosure", label: "Qiwa Disclosure", summary: "Saudi Qiwa training-disclosure obligations.", groups: ["readiness"], unresolved: true },
  { id: "internal_knowledge_base", label: "Internal Knowledge Base Development", summary: "Capture institutional knowledge internally.", groups: ["enablement"], unresolved: true },
  { id: "expertise_sharing", label: "Expertise Sharing (top performers / SMEs)", summary: "Turn what the best people know into shared content.", groups: ["capability"], unresolved: true },

];

export const USE_CASE_BY_ID = new Map(USE_CASES.map((u) => [u.id, u]));

/** Use cases in a category, honouring cross-listing. */
export const useCasesInGroup = (g: UseCaseGroup): UseCaseOption[] =>
  USE_CASES.filter((u) => u.groups.includes(g));

/**
 * Incoming label (HubSpot text, or a previously-stored id) → canonical id.
 *
 * Two things worth knowing:
 *  - "Talenet Assesments" is HubSpot's own option text, misspelled twice. It is
 *    mapped rather than corrected at source because we don't own that picklist,
 *    and deals already carrying the string must keep resolving even after it's
 *    fixed there.
 *  - Product Knowledge and Service Knowledge are separate in HubSpot and a
 *    SINGLE use case in the published taxonomy. Both map to the same id, which
 *    is why 11 deal-uses collapse to one entry.
 */
const ALIASES: Record<string, string> = {
  // live HubSpot values
  "building job-related skills": "job_role_specific",
  "qiwa disclosure": "qiwa_disclosure",
  "centralizing l&d under one digital platform": "centralized_learning_academy",
  "centralising l&d under one digital platform": "centralized_learning_academy",
  "building leadership capabilities": "leadership_development",
  "upskilling / reskilling": "upskilling_reskilling",
  "upskilling/reskilling": "upskilling_reskilling",
  "upskilling & reskilling": "upskilling_reskilling",
  "product knowledge": "products_services_knowledge",
  "service knowledge": "products_services_knowledge",
  "compliance and regulatory requirements": "compliance_training",
  // An earlier import stored this one already slugified ("compliance_regulatory"),
  // which matched neither the full HubSpot label above nor any canonical id, so
  // it resolved to nothing on the accounts carrying it.
  "compliance regulatory": "compliance_training",
  "compliance training": "compliance_training",
  "functional knowledge": "technical_skills",
  "technical skills training": "technical_skills",
  "preparing for a new role (succession development)": "succession_hipo",
  "succession development (hipo)": "succession_hipo",
  "training needs analysis (tna)": "tna",
  "internal knowledge base development": "internal_knowledge_base",
  "onboarding new joiner": "employee_onboarding",
  "employee onboarding": "employee_onboarding",
  "preparation for certification": "certification_prep",
  "certification preparation": "certification_prep",
  "sharing experience of top performers": "expertise_sharing",
  "sharing experience of a subject matter expert (sme)": "expertise_sharing",
  "talenet assesments": "internal_assessment_hub",
  "talent assesments": "internal_assessment_hub",
  "talent assessments": "internal_assessment_hub",
  // deck labels not yet in HubSpot
  "end-to-end talent strategy activation": "talent_strategy_activation",
  "centralized learning academy": "centralized_learning_academy",
  "graduate development program (gdp)": "gdp",
  "graduate development programme": "gdp",
  "career transition readiness": "career_transition",
  "hiring & role-based assessments": "hiring_role_assessments",
  "hiring & selection": "hiring_role_assessments",
  "hiring and selection": "hiring_role_assessments",
  "ai readiness": "ai_readiness",
  "digital transformation": "digital_transformation",
  "job-role-specific training": "job_role_specific",
  "leadership development": "leadership_development",
  "products & services knowledge enablement": "products_services_knowledge",
  "performance management": "performance_management",
  "competency framework development": "competency_framework",
  "individual development plans (idps)": "idp",
  "360° feedback": "feedback_360",
  "360 degree feedback": "feedback_360",
  "360-degree feedback": "feedback_360",
  "building internal assessment hub": "internal_assessment_hub",
  "culture & engagement": "culture_engagement",
  "engagement surveys": "culture_engagement",
};

export function resolveUseCase(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  if (USE_CASE_BY_ID.has(key)) return key;
  return USE_CASES.find((u) => u.label.toLowerCase() === key)?.id ?? null;
}

export interface ResolvedUseCases {
  ids: string[];
  /** Values we couldn't map — shown, never silently dropped. */
  unmapped: string[];
}

/**
 * Resolves raw stored strings (account-confirmed ids, or HubSpot deal values)
 * against the shipped taxonomy ONLY — the 26 ids in USE_CASES plus ALIASES.
 * This module is deliberately unaware of the separate, editable Use Case
 * database: an id that only exists there is exactly as unresolvable here as
 * one that doesn't exist anywhere, and is reported in `unmapped` rather than
 * silently accepted. The two systems do not share ids.
 */
export function normalizeUseCases(raw: unknown): ResolvedUseCases {
  const list = Array.isArray(raw) ? raw : [];
  const ids = new Set<string>();
  const unmapped: string[] = [];
  for (const v of list) {
    if (typeof v !== "string" || !v.trim()) continue;
    const raw0 = v.trim();
    const id = resolveUseCase(raw0);
    if (id) ids.add(id);
    else if (!unmapped.includes(raw0)) unmapped.push(raw0);
  }
  const order = new Map(USE_CASES.map((u, i) => [u.id, i]));
  return { ids: [...ids].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)), unmapped };
}

export const useCaseLabel = (id: string): string => USE_CASE_BY_ID.get(id)?.label ?? id;

/** Selected use cases that sit outside the published 23. */
export const unresolvedSelections = (ids: string[]): UseCaseOption[] =>
  ids.map((id) => USE_CASE_BY_ID.get(id)).filter((u): u is UseCaseOption => !!u?.unresolved);

export const ACCOUNT_USE_CASES_KEY = "account_use_cases";

export interface UseCaseComparison {
  confirmed: string[];
  declared: string[];
  /** Declared by sales, not confirmed by CS. */
  unconfirmed: string[];
  /** Confirmed by CS, never on a deal. */
  emergent: string[];
  unmapped: string[];
}

export function compareUseCases(accountRaw: unknown, dealRaw: unknown): UseCaseComparison {
  const account = normalizeUseCases(accountRaw);
  const deal = normalizeUseCases(dealRaw);
  const confirmedSet = new Set(account.ids);
  const declaredSet = new Set(deal.ids);
  return {
    confirmed: account.ids,
    declared: deal.ids,
    unconfirmed: deal.ids.filter((id) => !confirmedSet.has(id)),
    emergent: account.ids.filter((id) => !declaredSet.has(id)),
    unmapped: [...new Set([...account.unmapped, ...deal.unmapped])],
  };
}
