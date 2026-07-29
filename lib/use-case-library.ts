/* =========================================================================
   What gets recorded about a use case.

   lib/use-cases.ts owns the taxonomy — ids, names, categories — which are
   published and not editable here. This file owns the definition, and it ships
   EMPTY: an earlier version shipped written entries for all 23, authored in
   this repo rather than by Lumofy. Invented prose in the same typeface as a
   real taxonomy is worse than a blank, so everything displayed is written
   through the product and carries its own provenance.

   THE FIELD SET IS DELIBERATELY SMALL

   Enough to define a use case consistently, find it, and attach it to an
   account. No delivery blueprint, no evidence repository, no maturity model,
   no measurement integrations — those only earn their place once the team is
   actually filling these in.

   Two fields answer the questions a page of bullet points didn't:

     customerProblem   what is wrong at the client, in prose. A reader gets it
                       in one paragraph rather than inferring it from quotes.
     desiredOutcome    what "working" looks like. Its absence was why the page
                       read as a feature list.

   `delivers` is retained but no longer rendered. It holds the Deliverables
   column imported from the written Notion pages; dropping the field would
   destroy real content for a layout change, so it stays until there is a
   section that wants it.
   ========================================================================= */

import type { StakeholderRole } from "@/lib/stakeholders/profile";

/** Lumofy's products. Matches the `products` picklist on a HubSpot deal and
 *  the three sections of the company profile. Distinct from CAPABILITIES,
 *  which are the features inside them that a use case actually leans on. */
export const PRODUCTS = ["Perform", "Develop", "Engage"] as const;
export type Product = (typeof PRODUCTS)[number];

/** A platform capability and what it does for this specific use case. The
 *  second half is the point — listing "Assessments" tells a CSM nothing on its
 *  own. */
export interface CapabilityRow {
  name: string;
  role: string;
}

export interface RelatedUseCase {
  id: string;
  /** How this use case differs from that one, in one line. */
  distinction: string;
}

/** Who the use case is for. Plain fields, not a persona system — the point is
 *  that a CSM can read it in five seconds, not that it models an org chart. */
export interface Audience {
  /** Who signs. */
  buyer: string;
  /** Who runs it day to day at the client. */
  operationalOwner: string;
  /** Which employees it touches. */
  targetPopulation: string;
  /** Regulatory, technical, market — when it typically comes up. */
  contexts: string;
}

export const LIFECYCLE_STATUSES = ["draft", "published", "archived"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export interface UseCaseEntry {
  id: string;

  /* ---- required to be usable ---- */
  /** One line, overriding the taxonomy's published summary when the team wants
   *  their own phrasing. */
  oneLiner: string;
  /** What is wrong at the client. One paragraph. */
  customerProblem: string;
  /** What "working" looks like. */
  desiredOutcome: string;
  products: Product[];
  /** Email of the internal owner of this definition. */
  ownerEmail: string | null;
  status: LifecycleStatus;

  /* ---- optional, repeating ---- */
  /** The client's own words, so a CSM can match a call to a use case. */
  clientPhrases: string[];
  audience: Audience;
  capabilities: CapabilityRow[];
  /** What good looks like. Statements for now, measurable fields later. */
  successIndicators: string[];
  /** Neighbours and the test that separates them. */
  relatedUseCases: RelatedUseCase[];

  /* ---- governance ---- */
  updatedAt: string | null;
  updatedBy: string | null;
  /** Null until somebody has actually checked the wording. */
  lastReviewedAt: string | null;
  reviewedBy: string | null;

  /** Preserved, not rendered. The Deliverables column from the Notion import. */
  delivers: string[];
  /** Provenance, so the fuller sales material is always one click away. */
  sourceUrl: string | null;
}

/** Ships empty. Everything shown is written through the product. */
export const USE_CASE_LIBRARY: UseCaseEntry[] = [];

export const LIBRARY_OVERRIDE_KEY = "use_case_library";

export type UseCaseOverride = Partial<Omit<UseCaseEntry, "id">>;

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

export const EMPTY_AUDIENCE: Audience = { buyer: "", operationalOwner: "", targetPopulation: "", contexts: "" };

function audienceOf(v: unknown): Audience {
  if (!v || typeof v !== "object") return { ...EMPTY_AUDIENCE };
  const a = v as Record<string, unknown>;
  return {
    buyer: str(a.buyer, 300),
    operationalOwner: str(a.operationalOwner, 300),
    targetPopulation: str(a.targetPopulation, 300),
    contexts: str(a.contexts, 300),
  };
}

/** Every entry the team has written. Nothing is invented to fill a gap: a use
 *  case nobody has written about has no entry, and the page says so. */
export function mergeLibrary(overrides: Record<string, UseCaseOverride> | null | undefined): UseCaseEntry[] {
  if (!overrides) return [];
  return Object.entries(overrides)
    .map(([id, o]): UseCaseEntry => ({
      id,
      oneLiner: str(o.oneLiner, 400),
      customerProblem: str(o.customerProblem),
      desiredOutcome: str(o.desiredOutcome),
      products: Array.isArray(o.products)
        ? o.products.filter((p): p is Product => (PRODUCTS as readonly string[]).includes(p as string)) : [],
      ownerEmail: strOrNull(o.ownerEmail)?.toLowerCase() ?? null,
      status: (LIFECYCLE_STATUSES as readonly string[]).includes(o.status as string)
        ? (o.status as LifecycleStatus) : "draft",
      clientPhrases: lines(o.clientPhrases),
      audience: audienceOf(o.audience),
      capabilities: Array.isArray(o.capabilities)
        ? o.capabilities
            .filter((c): c is CapabilityRow => !!c && typeof c === "object" && typeof (c as CapabilityRow).name === "string")
            .map((c) => ({ name: str(c.name, 120), role: str(c.role, 300) }))
            .filter((c) => c.name)
        : [],
      successIndicators: lines(o.successIndicators),
      relatedUseCases: Array.isArray(o.relatedUseCases)
        ? o.relatedUseCases
            .filter((r): r is RelatedUseCase => !!r && typeof r === "object" && typeof (r as RelatedUseCase).id === "string")
            .map((r) => ({ id: r.id, distinction: str(r.distinction, 400) }))
            .filter((r) => r.id)
        : [],
      updatedAt: strOrNull(o.updatedAt),
      updatedBy: strOrNull(o.updatedBy),
      lastReviewedAt: strOrNull(o.lastReviewedAt),
      reviewedBy: strOrNull(o.reviewedBy),
      delivers: lines(o.delivers),
      sourceUrl: strOrNull(o.sourceUrl),
    }))
    // Audit or metadata alone isn't a definition — the page should still read
    // as undocumented.
    .filter((e) => e.oneLiner || e.customerProblem || e.desiredOutcome
      || e.clientPhrases.length || e.capabilities.length || e.successIndicators.length);
}

export const blankEntry = (id: string): UseCaseEntry => ({
  id, oneLiner: "", customerProblem: "", desiredOutcome: "", products: [], ownerEmail: null,
  status: "draft", clientPhrases: [], audience: { ...EMPTY_AUDIENCE }, capabilities: [],
  successIndicators: [], relatedUseCases: [], updatedAt: null, updatedBy: null,
  lastReviewedAt: null, reviewedBy: null, delivers: [], sourceUrl: null,
});

/**
 * What is missing before this definition is usable, named rather than scored.
 *
 * A percentage tells a reader they are 60% done without saying 60% of what.
 * These strings are shown verbatim in the "Definition needs review" panel.
 */
export function missingFields(e: UseCaseEntry | undefined): string[] {
  if (!e) return ["Nothing has been written yet"];
  const gaps: string[] = [];
  if (!e.oneLiner) gaps.push("One-line definition");
  if (!e.customerProblem) gaps.push("Customer problem");
  if (!e.desiredOutcome) gaps.push("Desired outcome");
  if (!e.products.length) gaps.push("Applicable Lumofy product");
  if (!e.ownerEmail) gaps.push("Owner not confirmed");
  if (!e.capabilities.length) gaps.push("No capabilities listed");
  if (!e.successIndicators.length) gaps.push("No success indicators");
  if (!e.lastReviewedAt) gaps.push("Never reviewed");
  return gaps;
}

/** Ready to publish when every required field is present. Optional repeating
 *  fields don't block — a use case can be real without a related-use-case list. */
export function canPublish(e: UseCaseEntry | undefined): boolean {
  return !!e && !!e.oneLiner && !!e.customerProblem && !!e.desiredOutcome
    && e.products.length > 0 && !!e.ownerEmail;
}
