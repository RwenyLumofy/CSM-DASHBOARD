/* =========================================================================
   The contract tab's view of a contract record, and the way back.

   The tab edits a draft shaped for the screen (a list of library providers
   beside their terms, short date names). `toView` builds that from a stored
   record; `toFields` turns a draft back into what is stored; `changedFields`
   is the patch a Save sends, so a Save only ever writes what the person
   changed. Pure, and tested in view.test.ts.
   ========================================================================= */

import type { Currency } from "./ledger";
import type { ContractRecord } from "./repo";
import { MILESTONE_KEYS, type ContractFields, type ContractKind, type ContractSource, type LibraryTerm, type OneTimeFee } from "./validate";

export type { LibraryTerm, OneTimeFee };

export type ContractView = {
  id: string;
  kind: ContractKind;
  source: ContractSource;
  name: string;
  /** sale / renewal: licence ARR for year 1. expansion / downgrade: the change. churn: ARR lost (0 = all). */
  amount: number;
  licences: number | null;
  complementary: number | null;
  pricePerUser: number | null;
  modules: string[];
  /** Global library providers on this record; empty = no global library. */
  library: string[];
  /** Each provider's own licences, start and expiry. */
  libraryTerms?: Record<string, LibraryTerm>;
  start: string | null;
  end: string | null;
  renewal: string | null;
  milestones: Record<string, string | null>;
  /** The modules the rollout starts with — a subset of `modules`. */
  startingModules?: string[];
  /** Whether a global library choice has been made ("None" counts as a choice). */
  libraryDecided?: boolean;
  supportLevel?: string | null;
  /** Annual support fee, in the record's currency. Counts toward ARR. */
  supportAmount?: number | null;
  /** Implementation, content development, AI credits… Recorded, never ARR. */
  oneTimeFees: OneTimeFee[];
  implementationLevel?: string | null;
  aiCredits?: number | null;
  /** Churn reason ids from Settings → Churn taxonomy. */
  reasons?: string[];
  note?: string;
  /** Who recorded it in Signal, and the day (YYYY-MM-DD). */
  recordedBy?: string;
  recordedOn?: string;
  /** false = kept as history only, or voided; doesn't move ARR. */
  counted?: boolean;
  voided?: { on: string; by: string | null; reason: string | null } | null;
  /** The Expansion-page opportunity this record came from, if any. */
  opportunityId?: string;
  currency?: Currency;
  /** Multi-year contracts priced per year: licence ARR for year 1, 2, 3… */
  yearAmounts?: number[];
  /** Where a HubSpot sale came from: Direct Sales, Indirect (Jisr), … */
  channel?: string | null;
  /** The deal in HubSpot, for a sale. */
  hubspotUrl?: string;
};

/** A provider's terms; one just added starts blank, running for the contract's term. */
export function libraryTerm(r: Pick<ContractView, "libraryTerms" | "start" | "end">, provider: string): LibraryTerm {
  return r.libraryTerms?.[provider] ?? { licences: null, start: r.start, expiry: r.end };
}

export function toView(r: ContractRecord, hubspotPortalId?: string): ContractView {
  const byPerson = r.source === "signal" && r.createdBy && r.createdBy !== "import";
  return {
    id: r.id, kind: r.kind, source: r.source, name: r.name, amount: r.amount,
    licences: r.licences, complementary: r.complementary, pricePerUser: r.pricePerUser,
    modules: r.modules, library: Object.keys(r.libraryTerms), libraryTerms: r.libraryTerms,
    start: r.startDate, end: r.endDate, renewal: r.renewalDate, milestones: r.milestones,
    startingModules: r.startingModules, libraryDecided: r.libraryDecided,
    supportLevel: r.supportLevel, supportAmount: r.supportAmount, oneTimeFees: r.oneTimeFees,
    implementationLevel: r.implementationLevel, aiCredits: r.aiCredits,
    reasons: r.churnReasons, note: r.note ?? undefined,
    recordedBy: byPerson ? r.createdBy! : undefined, recordedOn: byPerson ? r.createdAt.slice(0, 10) : undefined,
    counted: r.counted && !r.voidedAt,
    voided: r.voidedAt ? { on: r.voidedAt.slice(0, 10), by: r.voidedBy, reason: r.voidReason } : null,
    opportunityId: r.opportunityId ?? undefined,
    currency: r.currency, yearAmounts: r.yearAmounts ?? undefined, channel: r.channel,
    hubspotUrl: r.source === "hubspot" && r.hubspotDealId && hubspotPortalId
      ? `https://app.hubspot.com/contacts/${hubspotPortalId}/record/0-3/${r.hubspotDealId}` : undefined,
  };
}

export function toFields(v: ContractView): ContractFields {
  return {
    name: v.name.trim(), currency: v.currency ?? "USD", amount: v.amount,
    yearAmounts: v.yearAmounts && v.yearAmounts.length > 1 ? v.yearAmounts : null,
    supportLevel: v.supportLevel ?? null, supportAmount: v.supportLevel ? v.supportAmount ?? null : null,
    oneTimeFees: v.oneTimeFees.map((f) => ({ label: f.label.trim(), amount: f.amount })),
    licences: v.licences, complementary: v.complementary, pricePerUser: v.pricePerUser,
    modules: v.modules, startingModules: (v.startingModules ?? []).filter((m) => v.modules.includes(m)),
    libraryDecided: !!v.libraryDecided || v.library.length > 0,
    libraryTerms: Object.fromEntries(v.library.map((p) => [p, libraryTerm(v, p)])),
    implementationLevel: v.implementationLevel ?? null, aiCredits: v.aiCredits ?? null,
    milestones: Object.fromEntries(MILESTONE_KEYS.filter((k) => k in v.milestones).map((k) => [k, v.milestones[k] ?? null])),
    startDate: v.start, endDate: v.end, renewalDate: v.renewal,
    churnReasons: v.reasons ?? [], note: v.note?.trim() ? v.note.trim() : null,
  };
}

/** The fields that differ, taking `after`'s values. */
export function changedFields(before: ContractFields, after: ContractFields): Partial<ContractFields> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(after) as (keyof ContractFields)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = after[k];
  }
  return out as Partial<ContractFields>;
}
