/* =========================================================================
   What may be saved on a contract record. Pure, so it is tested on its own
   and the server actions and the form share one set of rules.

   The rules that matter most:
     - A HubSpot sale's money (amount, licences, user price, complementary,
       currency) and its name belong to HubSpot. Signal never changes them;
       the sync does. CS may change everything else on a sale.
     - Sales are never created in Signal. They arrive from HubSpot.
     - Expansions are recorded on the Expansion page, not here.
     - A churn needs an effective date and at least one reason.
     - So does any other loss of ARR: every downgrade, and a renewal worth
       less than the ARR it replaces. The reasons come from the same churn
       taxonomy and are stored on the record (churnReasons).
     - A support amount needs a support level, and can't be negative.
     - One-time fees are listed with a label and never count toward ARR.
   ========================================================================= */

import { CURRENCIES, toUSD, type Currency } from "./ledger";

export type ContractKind = "sale" | "renewal" | "expansion" | "downgrade" | "churn";
export type ContractSource = "hubspot" | "signal" | "imported" | "expansion";

export interface LibraryTerm { licences: number | null; start: string | null; expiry: string | null }
export interface OneTimeFee { label: string; amount: number }

/** Every field a person can set on a contract record. */
export interface ContractFields {
  name: string;
  currency: Currency;
  amount: number;
  yearAmounts: number[] | null;
  supportLevel: string | null;
  supportAmount: number | null;
  oneTimeFees: OneTimeFee[];
  licences: number | null;
  complementary: number | null;
  pricePerUser: number | null;
  modules: string[];
  startingModules: string[];
  libraryDecided: boolean;
  libraryTerms: Record<string, LibraryTerm>;
  implementationLevel: string | null;
  aiCredits: number | null;
  milestones: Record<string, string | null>;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  churnReasons: string[];
  note: string | null;
}

/** Fields HubSpot owns on a sale. Signal never writes them. */
export const HUBSPOT_OWNED: (keyof ContractFields)[] = ["name", "currency", "amount", "licences", "complementary", "pricePerUser"];

/** The kinds a person can record from the contract tab. */
export const RECORDABLE_KINDS: ContractKind[] = ["renewal", "downgrade", "churn"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const MILESTONE_KEYS = ["invoice_sent_date", "kickoff_meeting_date", "launch_date", "platform_start_date", "platform_end_date"];

export type Validation = { ok: true } | { ok: false; error: string };
const fail = (error: string): Validation => ({ ok: false, error });

/** Can this kind be created from the contract tab? */
export function validateKindForCreate(kind: string): Validation {
  if (kind === "sale") return fail("Sales come from HubSpot when a deal reaches Closed Won. They can't be created in Signal.");
  if (kind === "expansion") return fail("Expansions are recorded on the Expansion page.");
  if (!RECORDABLE_KINDS.includes(kind as ContractKind)) return fail("That isn't a kind of contract record.");
  return { ok: true };
}

/** What a record is checked against beyond its own fields. */
export interface RecordContext {
  /** The taxonomy's reason ids; when given, every reason must be one of them. */
  reasonIds?: Set<string>;
  /** For a renewal: the account's ARR in USD the day before it starts, i.e. the ARR it replaces. */
  replacesArr?: number;
  /** Skip the loss-reason rule: an edit that leaves a record's money and reasons alone
   *  doesn't have to add reasons to a record saved before they were required. */
  skipLossReasons?: boolean;
}

/** A renewal's annual value in USD: year-1 licence ARR plus support. */
const renewalArrUSD = (f: ContractFields) => toUSD(f.amount + (f.supportAmount ?? 0), f.currency);

/**
 * Does this record lose ARR? Every downgrade does. A renewal does when it is
 * worth more than a dollar less than the ARR it replaces (unknown = no).
 */
export function losesArr(kind: ContractKind, f: ContractFields, replacesArr?: number): boolean {
  if (kind === "downgrade") return true;
  if (kind === "renewal") return replacesArr !== undefined && renewalArrUSD(f) < replacesArr - 1;
  return false;
}

/** A complete record, as it would be stored. */
export function validateRecord(kind: ContractKind, f: ContractFields, ctx: RecordContext = {}): Validation {
  const churnReasonIds = ctx.reasonIds;
  if (!f.name.trim()) return fail("Give the record a name.");
  if (!CURRENCIES.includes(f.currency)) return fail("Currency must be USD, BHD or SAR.");
  if (!isNum(f.amount)) return fail("The amount must be a number.");
  if ((kind === "sale" || kind === "renewal") && f.amount < 0) return fail("A contract's ARR can't be negative.");
  if (kind === "downgrade" && f.amount > 0) return fail("A downgrade reduces ARR, so its amount is zero or negative.");
  if (kind === "expansion" && f.amount < 0) return fail("An expansion adds ARR, so its amount can't be negative.");

  for (const [label, v] of [["Start date", f.startDate], ["End date", f.endDate], ["Renewal date", f.renewalDate]] as const) {
    if (v !== null && !isDate(v)) return fail(`${label} isn't a valid date.`);
  }
  if (kind === "churn") {
    if (!f.startDate) return fail("A churn needs an effective date.");
    if (!f.churnReasons.length) return fail("Pick at least one churn reason.");
    if (churnReasonIds && f.churnReasons.some((r) => !churnReasonIds.has(r))) return fail("One of those churn reasons no longer exists in Settings.");
    return { ok: true };
  }
  if (!ctx.skipLossReasons) {
    if (losesArr(kind, f, ctx.replacesArr) && !f.churnReasons.length) {
      return fail(kind === "downgrade"
        ? "Pick at least one reason for the downgrade."
        : "This renewal is worth less than the contract it replaces. Pick at least one reason for the loss.");
    }
    if (churnReasonIds && f.churnReasons.some((r) => !churnReasonIds.has(r))) return fail("One of those reasons no longer exists in Settings.");
  }
  if (!f.startDate) return fail("A contract record needs a start date.");
  if (f.endDate && f.endDate < f.startDate) return fail("The end date is before the start date.");
  if (f.renewalDate && f.renewalDate <= f.startDate) return fail("The renewal date must be after the start date.");

  if (f.supportAmount !== null) {
    if (!isNum(f.supportAmount) || f.supportAmount < 0) return fail("The support amount must be zero or more.");
    if (!f.supportLevel) return fail("Choose a support level before entering a support amount.");
  }
  if (f.yearAmounts !== null) {
    if (kind !== "sale" && kind !== "renewal") return fail("Only a sale or renewal can be priced per year.");
    if (f.yearAmounts.length < 2 || f.yearAmounts.some((a) => !isNum(a) || a < 0)) return fail("Per-year ARR needs an amount of zero or more for each year.");
    if (f.yearAmounts[0] !== f.amount) return fail("Year 1 must match the contract's ARR.");
  }
  for (const fee of f.oneTimeFees) {
    if (!fee.label.trim()) return fail("Each one-time fee needs a label.");
    if (!isNum(fee.amount) || fee.amount < 0) return fail("A one-time fee must be zero or more.");
  }
  for (const n of [f.licences, f.complementary, f.pricePerUser, f.aiCredits]) {
    if (n !== null && !isNum(n)) return fail("Licences, price and credits must be numbers.");
  }
  if (f.startingModules.some((m) => !f.modules.includes(m))) return fail("The starting modules must be among the contracted modules.");
  for (const [provider, t] of Object.entries(f.libraryTerms)) {
    if (!provider.trim()) return fail("A global library needs a provider.");
    if (t.licences !== null && (!isNum(t.licences) || t.licences < 0)) return fail(`${provider}: licences must be zero or more.`);
    if ((t.start !== null && !isDate(t.start)) || (t.expiry !== null && !isDate(t.expiry))) return fail(`${provider}: start and expiry must be valid dates.`);
    if (t.start && t.expiry && t.expiry < t.start) return fail(`${provider}: expiry is before its start.`);
  }
  for (const [k, v] of Object.entries(f.milestones)) {
    if (!MILESTONE_KEYS.includes(k)) return fail("That isn't a milestone.");
    if (v !== null && !isDate(v)) return fail("A milestone isn't a valid date.");
  }
  return { ok: true };
}

/**
 * The part of a patch that may be applied to an existing record. On a HubSpot
 * sale, HubSpot-owned fields are dropped (and reported), never written.
 */
export function editablePatch(source: ContractSource, patch: Partial<ContractFields>): { patch: Partial<ContractFields>; refused: (keyof ContractFields)[] } {
  if (source !== "hubspot") return { patch, refused: [] };
  const refused = HUBSPOT_OWNED.filter((k) => k in patch);
  const allowed = Object.fromEntries(Object.entries(patch).filter(([k]) => !HUBSPOT_OWNED.includes(k as keyof ContractFields))) as Partial<ContractFields>;
  return { patch: allowed, refused };
}
