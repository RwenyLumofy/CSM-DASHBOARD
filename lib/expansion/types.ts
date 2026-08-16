/* =========================================================================
   Expansion — the domain model.

   Account → Opportunity. Three active stages plus Closed, three closed
   outcomes. Nothing else: no probability, no weighted pipeline, no second
   pipeline. Spec: docs/specs/revenue/expansion-opportunities-specification.md

   Pure types, labels and vocabularies — no React, no DB, no server-only
   imports, so both the client components and the server read layer share one
   definition of every value the feature can hold.

   Dates: `YYYY-MM-DD` strings for the date columns (a close date is a calendar
   day, not an instant); full ISO strings for the two timestamps. Nothing in
   this feature hands a Date object to a client component.
   ========================================================================= */

export type Stage = "identified" | "qualified" | "proposed" | "closed";
export type Outcome = "won" | "lost" | "dropped";
export type AgreementType = "verbal" | "written";
export type ExpansionType = "module" | "licences" | "geography" | "content" | "services" | "use_case";
/** High / Medium / Low, as the team already tracks it. Deliberately not a percentage. */
export type Confidence = "high" | "medium" | "low";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "identified", label: "Identified" },
  { id: "qualified", label: "Qualified" },
  { id: "proposed", label: "Proposed" },
  { id: "closed", label: "Closed" },
];

/** The three stages a card can be dragged between without being asked anything.
 *  Only a drop on Closed asks a question, because only Closed is hard to undo. */
export const ACTIVE_STAGES: Stage[] = ["identified", "qualified", "proposed"];

export const STAGE_LABEL: Record<Stage, string> = {
  identified: "Identified", qualified: "Qualified", proposed: "Proposed", closed: "Closed",
};

export const OUTCOME_LABEL: Record<Outcome, string> = { won: "Won", lost: "Lost", dropped: "Dropped" };

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

export const TYPES: ExpansionType[] = ["module", "licences", "geography", "content", "services", "use_case"];

export const TYPE_LABEL: Record<ExpansionType, string> = {
  module: "Module",
  licences: "Licences",
  geography: "Geography",
  content: "Content",
  services: "Services",
  use_case: "Use case",
};

/* Loss and drop reasons are a FIXED LIST plus an optional note (decision D-2).
   Free text alone cannot be counted, and "why do we lose expansion" is the
   first question anyone will ask of this data. */
export const LOSS_REASONS = [
  "No budget", "Chose another vendor", "No longer a priority", "Sponsor left", "Price", "Other",
] as const;
export const DROP_REASONS = [
  "Not a genuine need", "Account at risk — wrong time", "Superseded", "No capacity to deliver", "Other",
] as const;

/* ── Records ──────────────────────────────────────────────────────────────── */

export interface NextStep {
  id: string;
  text: string;
  /** "YYYY-MM-DD". */
  dueDate: string;
}

export interface OpportunityNote {
  id: string;
  body: string;
  authorEmail: string | null;
  authorName: string;
  /** ISO. */
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  what: string;
  actorName: string;
  /** ISO. */
  at: string;
}

/**
 * One expansion motion on one account, as the UI reads it.
 *
 * `accountName`, `ownerName` and `accountArr` are resolved joins, not columns —
 * the row stores `clientId` and `ownerEmail` and nothing else about either.
 */
export interface Opportunity {
  id: string;
  clientId: string;
  accountName: string;
  name: string;
  description: string | null;

  stage: Stage;
  outcome: Outcome | null;

  expectedArr: number | null;
  currency: string;
  expansionType: ExpansionType;
  /** The thing being sold — "Perform", "Develop". Null when it is not a named product. */
  product: string | null;

  ownerEmail: string | null;
  ownerName: string | null;
  /** "YYYY-MM-DD". Null when nobody has committed to a date. */
  expectedCloseDate: string | null;
  confidence: Confidence | null;

  /** A queue, not a checklist. The soonest-due one drives the card and attention. */
  nextSteps: NextStep[];
  /** ISO. Anything at all happening. Drives waiting and stalled. */
  lastActivityAt: string;
  /** ISO. When it entered its current stage. Stored, never parsed out of the log. */
  stageChangedAt: string;

  latestNote: OpportunityNote | null;

  /** ISO. */
  createdAt: string;
  proposalDate: string | null;

  outcomeDate: string | null;
  finalArr: number | null;
  agreementType: AgreementType | null;
  confirmedBy: string | null;
  /** Won only. Whether this and the ARR ledger have been reconciled. */
  arrRecorded: boolean;
  closeReason: string | null;
  closeNote: string | null;
}

/** The full record behind the overlay — everything above plus its history. */
export interface OpportunityDetail extends Opportunity {
  notes: OpportunityNote[];
  history: ActivityEntry[];
}

/**
 * An account the create form may pick, and the context the record's account
 * panel shows. Expansion is always into an existing client, so this list is
 * exactly the accounts the viewer may see — never free text.
 *
 * Health is carried as the resolved TIER NAME and its colour, not as a fixed
 * enum: tiers are admin-defined in Settings → Workflows and are renameable, so
 * a hardcoded healthy/watch/at_risk would go stale the first time someone edits
 * one. See HealthScore in lib/types.ts.
 *
 * Current account ARR belongs HERE and only here — never on a board card, where
 * it competes with the expansion figure the card exists to show.
 */
export interface ExpansionAccount {
  id: string;
  name: string;
  currency: string;
  arr: number;
  /** The products the account holds, from its tracked deals — "Develop",
   *  "Develop + Perform". Null when no tracked deal names one. */
  plan: string | null;
  healthTier: string | null;
  /** Hex from the health model, so any custom tier renders without a lookup. */
  healthColor: string | null;
  healthScore: number | null;
  /** ISO, or null when the start date was never recorded. */
  since: string | null;
}

/** An assignable owner. Guests never appear: they cannot write, so they cannot own. */
export interface ExpansionPerson {
  email: string;
  name: string;
  /** The permission tier, used only to group the picker. */
  tier: "super_admin" | "admin" | "operator";
  /** The workspace's own word for that tier — admins rename these. */
  roleLabel: string;
}

/** Everything the page needs in one payload. */
export interface ExpansionBoardData {
  opportunities: Opportunity[];
  accounts: ExpansionAccount[];
  people: ExpansionPerson[];
  /** The signed-in user's email, so the create form can default the owner. */
  me: string | null;
  /** False for a guest: every control that writes is hidden AND gated server-side. */
  canWrite: boolean;
  /** "YYYY-MM-DD" resolved on the server, so every read-out agrees on the date. */
  today: string;
  /**
   * True when the database could not be read, as opposed to there being
   * nothing to show.
   *
   * These are the same empty array and must never be the same message: this
   * page's whole promise is that no motion is invisible, and "No expansion
   * opportunities yet" over a failed read is the page telling the exact lie it
   * exists to prevent.
   */
  unavailable: boolean;
}

/* ── Input shapes for the mutations ───────────────────────────────────────── */

export interface NewOpportunityInput {
  clientId: string;
  name: string;
  description?: string | null;
  expectedArr?: number | null;
  expansionType?: ExpansionType | null;
  product?: string | null;
  ownerEmail?: string | null;
  expectedCloseDate?: string | null;
  confidence?: Confidence | null;
  nextStep?: { text: string; dueDate: string } | null;
}

export interface CloseInput {
  outcome: Outcome;
  /** Won only. */
  finalArr?: number | null;
  agreementType?: AgreementType | null;
  confirmedBy?: string | null;
  arrRecorded?: boolean;
  /** Lost / dropped only — a value from LOSS_REASONS / DROP_REASONS. */
  closeReason?: string | null;
  closeNote?: string | null;
}

/* ── Narrowing helpers, so a DB string can never widen the union silently ─── */

export const isStage = (v: unknown): v is Stage =>
  v === "identified" || v === "qualified" || v === "proposed" || v === "closed";

export const isOutcome = (v: unknown): v is Outcome =>
  v === "won" || v === "lost" || v === "dropped";

export const isExpansionType = (v: unknown): v is ExpansionType =>
  typeof v === "string" && (TYPES as string[]).includes(v);

export const isConfidence = (v: unknown): v is Confidence =>
  v === "high" || v === "medium" || v === "low";

export const isAgreementType = (v: unknown): v is AgreementType =>
  v === "verbal" || v === "written";
