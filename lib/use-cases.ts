/* =========================================================================
   Use cases — what the client actually bought the platform to achieve.

   THE PROBLEM THIS FIXES

   Use cases only ever existed on the DEAL (client_deals.use_cases, a jsonb
   array fed from HubSpot's `use_cases` multi-select). The account-level view,
   `use_cases_rollup`, is a derived union of the tracked deals and is READ-ONLY
   — so a CSM who learns in month four that the account is really doing
   succession planning has nowhere to say so. The only writable copy is a field
   sales filled in before the account existed.

   The picklist itself has problems visible in the live data:

     "Talenet Assesments"   a typo, in the option list AND on a real deal
     "Unclear"              a use-case option meaning "we don't know"
     26 flat options        one ungrouped multi-select, no search

   WHAT THIS MODULE DOES

   - Groups the 26 options into 5 themes, so choosing is a two-step decision
     ("what kind of thing?" then "which one?") rather than scanning a wall.
   - Maps misspellings and drifted labels onto canonical ids via ALIASES, so
     existing data keeps working with no migration and no data loss. Nothing is
     rewritten in place; normalisation happens on read, the same approach
     normalizeStakeholderMappings already uses.
   - Keeps "Unclear" and "Other" as real, selectable values but marks them
     `provisional`. They ARE the honest answer early on; the point is to be
     able to SEE that an account is still unclear, which a flat list cannot.
   - Separates the sales-declared use cases (deal, HubSpot's) from the
     CS-confirmed ones (account, ours). Both are kept. When they disagree, that
     disagreement is itself worth showing.
   ========================================================================= */

export type UseCaseGroup = "learning" | "capability" | "talent" | "compliance" | "platform";

export interface UseCaseOption {
  /** Stable id. Never rendered; never changes once shipped. */
  id: string;
  label: string;
  group: UseCaseGroup;
  /** True for "we don't know yet" answers. Selectable, but reportable as
   *  unresolved rather than silently counted as a real use case. */
  provisional?: boolean;
}

export const USE_CASE_GROUPS: { id: UseCaseGroup; label: string; blurb: string }[] = [
  { id: "learning", label: "Learning & enablement", blurb: "Getting people the knowledge to do the job." },
  { id: "capability", label: "Capability building", blurb: "Growing skills and leadership over time." },
  { id: "talent", label: "Talent & performance", blurb: "Assessing, developing and moving people." },
  { id: "compliance", label: "Compliance & regulatory", blurb: "Obligations that must be evidenced." },
  { id: "platform", label: "Platform & consolidation", blurb: "Why Lumofy rather than the status quo." },
];

/** The canonical list. `label` matches the HubSpot option text where one
 *  exists, so a value round-trips unchanged — except where HubSpot's text is
 *  misspelled, which ALIASES handles instead of propagating the error. */
export const USE_CASES: UseCaseOption[] = [
  { id: "onboarding_new_joiner", label: "Onboarding new joiners", group: "learning" },
  { id: "product_knowledge", label: "Product knowledge", group: "learning" },
  { id: "service_knowledge", label: "Service knowledge", group: "learning" },
  { id: "functional_knowledge", label: "Functional knowledge", group: "learning" },
  { id: "job_related_skills", label: "Building job-related skills", group: "learning" },
  { id: "internal_knowledge_base", label: "Internal knowledge base development", group: "learning" },

  { id: "leadership_capabilities", label: "Building leadership capabilities", group: "capability" },
  { id: "upskilling_reskilling", label: "Upskilling / reskilling", group: "capability" },
  { id: "succession_development", label: "Preparing for a new role (succession)", group: "capability" },
  { id: "certification_prep", label: "Preparation for certification", group: "capability" },
  { id: "top_performer_sharing", label: "Sharing experience of top performers", group: "capability" },
  { id: "sme_sharing", label: "Sharing experience of an SME", group: "capability" },
  { id: "graduate_development", label: "Graduate development programme", group: "capability" },

  { id: "performance_management", label: "Performance management", group: "talent" },
  { id: "competency_framework", label: "Competency framework development", group: "talent" },
  { id: "feedback_360", label: "360-degree feedback", group: "talent" },
  { id: "engagement_surveys", label: "Engagement surveys", group: "talent" },
  { id: "hiring_selection", label: "Hiring & selection", group: "talent" },
  { id: "talent_assessments", label: "Talent assessments", group: "talent" },
  { id: "idp", label: "Individual development plans (IDPs)", group: "talent" },
  { id: "tna", label: "Training needs analysis (TNA)", group: "talent" },

  { id: "compliance_regulatory", label: "Compliance & regulatory requirements", group: "compliance" },
  { id: "qiwa_disclosure", label: "Qiwa disclosure", group: "compliance" },

  { id: "centralise_lnd", label: "Centralising L&D on one platform", group: "platform" },

  { id: "unclear", label: "Not yet established", group: "platform", provisional: true },
  { id: "other", label: "Other", group: "platform", provisional: true },
];

export const USE_CASE_BY_ID = new Map(USE_CASES.map((u) => [u.id, u]));

/**
 * Incoming label (HubSpot text, or a previously-stored value) → canonical id.
 *
 * "Talenet Assesments" is HubSpot's actual option text, misspelled twice. It is
 * mapped rather than corrected at source because we do not own that picklist —
 * and even once it is fixed there, deals already carrying the old string must
 * keep resolving. Same reasoning for every other entry: this table only ever
 * grows, and no historical value is allowed to become unreadable.
 */
const ALIASES: Record<string, string> = {
  "talenet assesments": "talent_assessments",
  "talent assesments": "talent_assessments",
  "talent assessments": "talent_assessments",
  "onboarding new joiner": "onboarding_new_joiner",
  "preparing for a new role (succession development)": "succession_development",
  "building leadership capabilities": "leadership_capabilities",
  "preparation for certification": "certification_prep",
  "building job-related skills": "job_related_skills",
  "compliance and regulatory requirements": "compliance_regulatory",
  "product knowledge": "product_knowledge",
  "service knowledge": "service_knowledge",
  "functional knowledge": "functional_knowledge",
  "sharing experience of top performers": "top_performer_sharing",
  "sharing experience of a subject matter expert (sme)": "sme_sharing",
  "qiwa disclosure": "qiwa_disclosure",
  "upskilling / reskilling": "upskilling_reskilling",
  "upskilling/reskilling": "upskilling_reskilling",
  "centralizing l&d under one digital platform": "centralise_lnd",
  "centralising l&d under one digital platform": "centralise_lnd",
  "training needs analysis (tna)": "tna",
  "performance management": "performance_management",
  "competency framework development": "competency_framework",
  "360 degree feedback": "feedback_360",
  "360-degree feedback": "feedback_360",
  "engagement surveys": "engagement_surveys",
  "graduate development program (gdp)": "graduate_development",
  "graduate development programme": "graduate_development",
  "hiring & selection": "hiring_selection",
  "hiring and selection": "hiring_selection",
  "internal knowledge base development": "internal_knowledge_base",
  "individual development plans (idps)": "idp",
  "unclear": "unclear",
  "not yet established": "unclear",
  "other": "other",
};

/**
 * Resolve any stored or synced value to a canonical id.
 *
 * Returns null for something we genuinely don't recognise — callers surface
 * that as an unmapped value rather than dropping it, because silently
 * discarding a use case somebody typed is worse than showing it as unknown.
 */
export function resolveUseCase(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  if (USE_CASE_BY_ID.has(key)) return key;
  const byLabel = USE_CASES.find((u) => u.label.toLowerCase() === key);
  return byLabel?.id ?? null;
}

export interface ResolvedUseCases {
  /** Canonical ids, de-duplicated, in taxonomy order. */
  ids: string[];
  /** Values we couldn't map — shown, never silently dropped. */
  unmapped: string[];
}

export function normalizeUseCases(raw: unknown): ResolvedUseCases {
  const list = Array.isArray(raw) ? raw : [];
  const ids = new Set<string>();
  const unmapped: string[] = [];
  for (const v of list) {
    if (typeof v !== "string" || !v.trim()) continue;
    const id = resolveUseCase(v);
    if (id) ids.add(id);
    else if (!unmapped.includes(v.trim())) unmapped.push(v.trim());
  }
  const order = new Map(USE_CASES.map((u, i) => [u.id, i]));
  return { ids: [...ids].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)), unmapped };
}

export const useCaseLabel = (id: string): string => USE_CASE_BY_ID.get(id)?.label ?? id;

/** True when the account has only provisional answers — "Unclear"/"Other" and
 *  nothing else. Distinct from having none at all, and worth acting on
 *  differently: one is unanswered, the other is answered "we don't know". */
export function isProvisionalOnly(ids: string[]): boolean {
  return ids.length > 0 && ids.every((id) => USE_CASE_BY_ID.get(id)?.provisional);
}

/** Where the account's confirmed use cases are stored (client.properties). */
export const ACCOUNT_USE_CASES_KEY = "account_use_cases";

/**
 * What sales declared (deals) vs what CS confirmed (account), and the delta.
 *
 * The delta is the interesting part: a use case sales sold that CS never
 * confirmed is a promise nobody has validated, and one CS added that was never
 * sold is expansion signal. Both are invisible while the two lists are merged.
 */
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
