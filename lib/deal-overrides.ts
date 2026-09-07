/* =========================================================================
   Per-deal CSM overrides — the mechanism that lets a CSM edit ANY deal prop
   in-app and have that edit survive the daily HubSpot sync.

   Why overrides instead of writing the deal columns directly: the daily sync's
   engagement pass (syncClientEngagement) re-pulls and re-writes every deal's
   columns for every client on every run, so a direct column write would be
   clobbered within a day. Instead, CSM edits live in the client's `properties`
   jsonb (which the sync preserves via its `||` merge) under three keys:

     __deal_overrides[dealId][field]  — overrides of HubSpot-synced deal fields
                                         (amount, licenses, package, dates …).
                                         Display = override ?? synced value.
                                         Cleared by the Settings "Full re-sync".
     __deal_dates[dealId][key]        — CSM-only milestone dates (no HubSpot
                                         source). Preserved by Full re-sync.
     __deal_briefs[dealId]            — CSM brief override (HubSpot use_case_brief
                                         is the fallback). Preserved by Full re-sync.

   This module is import-safe from both server and client components (pure data).
   ========================================================================= */

import type { Deal } from "@/lib/types";

export const DEAL_OVERRIDES_KEY = "__deal_overrides";
export const DEAL_DATES_KEY = "__deal_dates";
export const DEAL_BRIEFS_KEY = "__deal_briefs";

export type DealOverridesMap = Record<string, Record<string, unknown>>;
export type DealDatesMap = Record<string, Record<string, string | null>>;
export type DealBriefsMap = Record<string, string>;

export type OverrideFieldType = "text" | "number" | "currency" | "date" | "tags" | "single_select" | "multi_select";

/**
 * Deal field key → the property-definition key that holds its select options.
 * `referralSource` reuses the existing account-level `referral_source` property;
 * the rest are deal-scoped picklists ingested live from HubSpot (see the sync's
 * option reconciliation). When a definition is absent the editor still works —
 * the select self-unions whatever values are already stored on the deal.
 */
export const DEAL_FIELD_OPTION_KEYS: Record<string, string> = {
  referralSource: "referral_source",
  ownerName: "deal_account_executive",
  products: "deal_modules",
  useCases: "deal_use_cases",
  globalLibraryPackage: "deal_global_libraries",
  supportLevel: "deal_support_level",
  implementationLevel: "deal_implementation_level",
};

/**
 * Built-in option lists for the deal-card select editors, mirrored from the
 * live HubSpot deal-property picklists. These are the immediate fallback so the
 * dropdowns are never empty before the first sync runs `reconcileDealSelectOptions`,
 * which then keeps the persisted definitions in lockstep with HubSpot. The
 * editor unions these with the synced definition's options + any stored value.
 */
export const DEAL_FIELD_FALLBACK_OPTIONS: Record<string, string[]> = {
  // `modules` → "Module"
  products: ["Perform", "Develop", "Engage", "Other"],
  // `use_cases` → "Use case"
  useCases: [
    "Unclear", "Onboarding New Joiner", "Preparing for a New Role (Succession Development)",
    "Building Leadership Capabilities", "Preparation for Certification", "Building Job-related Skills",
    "Compliance and Regulatory Requirements", "Product Knowledge", "Service Knowledge",
    "Functional Knowledge", "Sharing Experience of Top Performers",
    "Sharing Experience of a Subject Matter Expert (SME)", "Qiwa Disclosure", "Upskilling / Reskilling",
    "Centralizing L&D under One Digital Platform", "Training Needs Analysis (TNA)", "Performance Management",
    "Competency Framework Development", "360 Degree Feedback", "Engagement Surveys",
    "Graduate Development Program (GDP)", "Hiring & Selection", "Talenet Assesments",
    "Internal Knowledge Base Development", "Individual Development Plans (IDPs)", "Other",
  ],
  // `global_libraries` → "Global library"
  globalLibraryPackage: ["Go1", "Opensesame", "Udemy", "Linkedin", "Almentor", "Entalaqa", "Pluralsight", "None"],
  // `support_level` → "Support level"
  supportLevel: ["Level 1", "Level 2", "Level 3"],
  // `implementation_level` → "Implementation level"
  implementationLevel: ["Self-Serve", "Guided", "White Glove"],
  // `account_executive` → "Account Executive" (HubSpot owner picklist, names)
  ownerName: [
    "Mahmood Malik", "Safa AlFulaij", "Ahmed Faraj", "Tasneem Elghareeb", "Rania Qasim", "Mustafa Abbas",
    "Batool Momani", "Ali Abbas", "Mohamed Shamlooh", "Ruba Sinokrot", "Zainab Ali", "Mohamed Shantory",
    "Sakina Asghar", "Reem Sharar", "Suzan Alkhriesat", "Sara Abdulwahab", "Hussain Alsayyad",
    "Hasan AlHashimi", "Fatema almasoud", "Taif Saleh", "mahmoud elrweny", "Qasim Alshakhoori",
    "Sara Mashhoor", "Shehab Beram", "Sayed Hussain Almukhtar",
  ],
  // `referral_source` → "Acquisition Channel"
  referralSource: ["Direct Sales", "Tamkeen", "Jisr", "FutureX", "Indirect"],
};

/** The HubSpot-synced deal fields a CSM may override, in card display order. */
export interface DealFieldSpec {
  /** Deal field name — also the key under __deal_overrides[dealId]. */
  key: keyof Deal;
  type: OverrideFieldType;
}

/** Read the per-deal override bag for one deal from a client's properties. */
export function dealOverridesMap(props: Record<string, unknown> | undefined | null): DealOverridesMap {
  return (props?.[DEAL_OVERRIDES_KEY] as DealOverridesMap | undefined) ?? {};
}

/** Merge a deal's CSM overrides on top of its synced values → the effective deal. */
export function applyDealOverrides(deal: Deal, override: Record<string, unknown> | undefined): Deal {
  if (!override || Object.keys(override).length === 0) return deal;
  return { ...deal, ...override } as Deal;
}

/**
 * Does this deal actually have a global library? `globalLibraryPackage` is a
 * multi-select whose picklist includes a literal "None" option (see
 * DEAL_FIELD_FALLBACK_OPTIONS above) — a deal can deliberately have no
 * library. When it doesn't, the library's start/expiry dates are meaningless,
 * so they're only required (and only shown at full opacity) when a real
 * library IS selected. Both the deal-card date fields (ClientProfileTabs) and
 * the account completeness badge (lib/profile-completeness.ts) key off this
 * same check, so the two can never disagree about what "no library" means.
 */
export function hasGlobalLibrary(deal: Pick<Deal, "globalLibraryPackage">): boolean {
  const pkg = deal.globalLibraryPackage;
  return Array.isArray(pkg) && pkg.length > 0 && !pkg.includes("None");
}

/** Union of every tracked deal's use cases (already override-applied by the
 *  caller — see applyDealOverrides). Feeds the "use_case_set" health metric
 *  and the read-only use_cases_rollup client property. */
export function computeUseCasesRollup(trackedDeals: Pick<Deal, "useCases">[]): string[] {
  const set = new Set<string>();
  for (const d of trackedDeals) {
    for (const uc of d.useCases ?? []) set.add(uc);
  }
  return [...set].sort();
}

/** Renewal = effective contract start + 1 year (auto, never stored). */
export function computeRenewal(contractStart: string | null | undefined): string | null {
  if (!contractStart) return null;
  const d = new Date(contractStart);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

/**
 * What the deal card may honestly say about a renewal date.
 *
 * The card used to render `computeRenewal(contractStartDate)` under a flat
 * `Auto · +1yr` badge, unconditionally — including on deals with no contract
 * start date at all, which read as an em-dash next to a badge asserting an
 * automatic annual renewal. The brief's standing instruction is not to infer
 * renewal terms and to say so when the evidence is unclear, so this decides
 * which of three things is actually known.
 *
 * `contractDuration` cannot resolve the term (see the field's comment in
 * lib/types.ts — HubSpot writes months, CSMs write years, and the two overlap
 * at 1-3). So the only safe readings are:
 *
 *   - absent, or 1 — assume one year, and SAY it is an assumption. A value of
 *     1 is annual under either unit, since a one-month contract is not a thing
 *     this business sells.
 *   - anything else — the term is definitely not one year under at least one
 *     reading, and which reading applies is unknowable. Show no date.
 *
 * Deliberately no fallback to the deal's close date. That is a different
 * question ("when was this booked") wearing the answer's clothes, and the
 * account header already makes that substitution for 16 accounts — which is
 * why their header shows a renewal date while every card below reads "—".
 */
export type RenewalDisplay =
  /** Contract start known, term assumed annual. `date` is safe to show. */
  | { kind: "assumed"; date: string; note: string }
  /** Term is declared and is not annual — no date can be derived. */
  | { kind: "term_unknown"; date: null; note: string }
  /** No contract effective date on the deal — nothing to count from. */
  | { kind: "no_start"; date: null; note: string };

export function renewalDisplay(
  contractStart: string | null | undefined,
  contractDuration: number | null | undefined,
): RenewalDisplay {
  if (!contractStart) {
    return { kind: "no_start", date: null, note: "Needs contract start date" };
  }
  if (contractDuration != null && contractDuration !== 1) {
    return { kind: "term_unknown", date: null, note: "Term needs confirmation" };
  }
  const date = computeRenewal(contractStart);
  if (!date) {
    return { kind: "no_start", date: null, note: "Needs contract start date" };
  }
  return { kind: "assumed", date, note: "Assumed 1 year · confirm" };
}
