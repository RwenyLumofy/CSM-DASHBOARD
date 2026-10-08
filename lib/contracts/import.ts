/* =========================================================================
   One-time import: today's deals → contract records.

   Pure (no database), so the rules are tested and the import script and the
   dry-run comparison share them. The rules, agreed with the product owner
   (2026-10-04 … 10-08) and checked in the dry run (2026-10-05):

     - Direct / Indirect Closed Won deals become SALES owned by HubSpot. Their
       money fields (amount, licences, price, complementary) are HubSpot's
       values. Where HubSpot left one blank, CS's value fills it in; where both
       have a value and they differ, HubSpot's is used and the difference is
       flagged for review.
     - Modules, global library, service levels, AI credits and dates are owned
       by CS, so CS's edits (deal overrides) ARE carried over.
     - HubSpot CS-pipeline deals become Signal records marked "imported":
       Renewed → renewal, Expanded → expansion, Confirmed Churned → churn,
       Downgraded → downgrade.
     - A deal CS unticked stays as history and doesn't count (except churn and
       downgrade deals, which the sync always stored unticked).
     - Contract length: a value above 5 is read as months, else years; default 1.
     - Won Expansion-page opportunities whose ARR is recorded become expansion
       records (source "expansion"), replacing their ARR-ledger entry.
     - A churned account with no churn record gets one on its churn date, with
       the reasons already chosen on the account.
   ========================================================================= */

import type { Deal } from "@/lib/types";
import type { Currency } from "./ledger";

export type ContractKind = "sale" | "renewal" | "expansion" | "downgrade" | "churn";

export interface ImportedRecord {
  id: string;
  clientId: string;
  kind: ContractKind;
  source: "hubspot" | "imported" | "expansion" | "signal";
  hubspotDealId: string | null;
  opportunityId: string | null;
  channel: string | null;
  name: string;
  currency: Currency;
  amount: number;
  licences: number | null;
  complementary: number | null;
  pricePerUser: number | null;
  modules: string[];
  libraryDecided: boolean;
  libraryTerms: Record<string, { licences: number | null; start: string | null; expiry: string | null }>;
  supportLevel: string | null;
  implementationLevel: string | null;
  aiCredits: number | null;
  milestones: Record<string, string | null>;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  counted: boolean;
  churnReasons: string[];
  note: string | null;
}

export interface ImportInput {
  client: { id: string; status: string; churnedAt: string | null; currency: string; properties?: Record<string, unknown> };
  deals: Deal[];
  wonOpportunities: { id: string; name: string; finalArr: number | null; currency: string; outcomeDate: string | null; arrRecorded: boolean; product: string | null }[];
}

export interface ImportResult {
  records: ImportedRecord[];
  /** Things a person should look at before the import is trusted. */
  flags: string[];
}

const MILESTONE_KEYS = ["invoice_sent_date", "kickoff_meeting_date", "launch_date", "platform_start_date", "platform_end_date"];
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const asCurrency = (c: string): Currency => (c === "BHD" || c === "SAR" ? c : "USD");

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function kindOf(d: Deal): ContractKind {
  if (d.pipeline !== "cs") return "sale";
  if (d.category === "expansion") return "expansion";
  if (d.category === "confirmed_churn") return "churn";
  if (d.category === "downgraded") return "downgrade";
  return "renewal";
}

export function buildContractRecords({ client, deals, wonOpportunities }: ImportInput): ImportResult {
  const props = client.properties ?? {};
  const overrides = (props.__deal_overrides as Record<string, Record<string, unknown>> | undefined) ?? {};
  const dealDates = (props.__deal_dates as Record<string, Record<string, string | null>> | undefined) ?? {};
  const currency = asCurrency(client.currency);
  const flags: string[] = [];
  const records: ImportedRecord[] = [];

  for (const deal of deals) {
    const ov = overrides[deal.id] ?? {};
    const kind = kindOf(deal);
    const isSale = kind === "sale";
    // HubSpot owns a sale's money. A CS value only fills a field HubSpot left blank.
    const blank = (v: unknown) => v === null || v === undefined || v === "";
    const pick = <K extends keyof Deal>(k: K): Deal[K] =>
      (isSale ? (blank(deal[k]) && k in ov ? ov[k as string] : deal[k]) : (k in ov ? ov[k as string] : deal[k])) as Deal[K];
    const csOwned = <K extends keyof Deal>(k: K): Deal[K] => ((k in ov ? ov[k as string] : deal[k]) as Deal[K]);
    if (isSale) {
      for (const k of ["amount", "numberOfUsers", "pricePerUser", "complementaryLicenses"] as const) {
        if (k in ov && !blank(ov[k]) && !blank(deal[k]) && Number(ov[k]) !== Number(deal[k])) {
          flags.push(`${deal.name ?? deal.id}: ${k} is ${String(ov[k])} in Signal but ${String(deal[k])} in HubSpot; HubSpot's value is used.`);
        }
      }
    }

    const start = day(csOwned("contractStartDate")) ?? day(csOwned("closeDate"));
    const len = Number(csOwned("contractDuration") ?? 0);
    if (len > 5) flags.push(`${deal.name ?? deal.id}: contract length ${len} read as months.`);
    const months = len > 5 ? Math.round(len) : Math.round((len > 0 ? len : 1) * 12);
    const renewal = start && kind !== "churn" ? addMonths(start, months) : null;

    const dates = dealDates[deal.id] ?? {};
    const pkg = (csOwned("globalLibraryPackage") ?? []) as string[];
    const providers = pkg.filter((p) => p !== "None");
    const libraryTerms = Object.fromEntries(providers.map((p, i) => [p, i === 0
      ? { licences: (csOwned("globalLibraryLicenses") as number | null) ?? null, start: day(dates.global_library_start_date), expiry: day(dates.global_library_expiry_date) }
      : { licences: null, start, expiry: renewal ? dayBefore(renewal) : null }]));
    const milestones = Object.fromEntries(MILESTONE_KEYS.map((k) => [k, day(dates[k])]));
    if (milestones.launch_date && milestones.kickoff_meeting_date && milestones.launch_date < milestones.kickoff_meeting_date) {
      flags.push(`${deal.name ?? deal.id}: launch (${milestones.launch_date}) is before kick-off (${milestones.kickoff_meeting_date}).`);
    }

    const counted = deal.tracked !== false || kind === "churn" || kind === "downgrade";
    records.push({
      id: `ctr-hs-${deal.hubspotDealId}`,
      clientId: client.id,
      kind,
      source: isSale ? "hubspot" : "imported",
      hubspotDealId: deal.hubspotDealId,
      opportunityId: null,
      channel: isSale ? deal.referralSource ?? null : null,
      name: (pick("name") as string | null) ?? `Deal ${deal.hubspotDealId}`,
      currency,
      amount: kind === "downgrade" ? -Math.abs(Number(pick("amount") ?? 0)) : Number(pick("amount") ?? 0),
      licences: (pick("numberOfUsers") as number | null | undefined) ?? null,
      complementary: (pick("complementaryLicenses") as number | null | undefined) ?? null,
      pricePerUser: (pick("pricePerUser") as number | null | undefined) ?? null,
      modules: ((csOwned("products") ?? []) as string[]),
      libraryDecided: pkg.length > 0,
      libraryTerms,
      supportLevel: (csOwned("supportLevel") as string | null | undefined) ?? null,
      implementationLevel: (csOwned("implementationLevel") as string | null | undefined) ?? null,
      aiCredits: (csOwned("aiCourseCredits") as number | null | undefined) ?? null,
      milestones,
      startDate: start,
      endDate: renewal ? dayBefore(renewal) : null,
      renewalDate: renewal,
      counted,
      churnReasons: [],
      note: counted ? null : "Unticked in Signal before the import; kept as history.",
    });
  }

  for (const o of wonOpportunities) {
    if (!o.arrRecorded || !o.finalArr) continue;
    records.push({
      id: `ctr-exp-${o.id}`, clientId: client.id, kind: "expansion", source: "expansion",
      hubspotDealId: null, opportunityId: o.id, channel: null, name: o.name, currency: asCurrency(o.currency),
      amount: o.finalArr, licences: null, complementary: null, pricePerUser: null,
      modules: o.product ? o.product.split(/\s*[+,]\s*/).filter(Boolean) : [],
      libraryDecided: false, libraryTerms: {}, supportLevel: null, implementationLevel: null, aiCredits: null,
      milestones: {}, startDate: o.outcomeDate, endDate: null, renewalDate: null, counted: true, churnReasons: [],
      note: "Won on the Expansion page.",
    });
  }

  // An expansion shortly before a renewal is ambiguous: the renewal replaces the term
  // before it, so the expansion is treated as included in it. If the renewal amount
  // doesn't include it (e.g. a support fee won just before a flat renewal), the expansion
  // belongs on the renewal — as its support amount or in its licence ARR. A person decides.
  for (const e of records.filter((r) => r.kind === "expansion" && r.counted && r.startDate)) {
    const next = records.find((r) => (r.kind === "renewal" || r.kind === "sale") && r.counted && r.startDate
      && r.startDate > e.startDate! && Date.parse(r.startDate) - Date.parse(e.startDate!) <= 90 * 86_400_000);
    if (next) flags.push(`${e.name}: expansion of ${e.amount} on ${e.startDate} is followed by ${next.name} on ${next.startDate}, which replaces it. Confirm the renewal includes it, or add it to the renewal (e.g. as its support amount).`);
  }

  if (client.status === "churned" && !records.some((r) => r.kind === "churn" && r.counted)) {
    const reasons = Array.isArray(props.churn_reasons) ? (props.churn_reasons as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (!reasons.length) flags.push("Churned with no churn reasons recorded.");
    // With no churn date, date it after the last record so it ends the contract instead of preceding it.
    const lastStart = records.map((r) => r.startDate).filter((d): d is string => !!d).sort().pop() ?? null;
    const churnDate = day(client.churnedAt) ?? lastStart;
    if (!day(client.churnedAt)) flags.push(`Churned with no churn date; the churn record is dated ${churnDate ?? "unknown"} (the last contract record) until someone sets it.`);
    records.push({
      id: `ctr-churn-${client.id}`, clientId: client.id, kind: "churn", source: "signal",
      hubspotDealId: null, opportunityId: null, channel: null, name: "Churn", currency,
      amount: 0, licences: null, complementary: null, pricePerUser: null, modules: [],
      libraryDecided: false, libraryTerms: {}, supportLevel: null, implementationLevel: null, aiCredits: null,
      milestones: {}, startDate: churnDate, endDate: null, renewalDate: null,
      counted: true, churnReasons: reasons,
      note: "Added by the import: the account was marked churned but no deal recorded it.",
    });
  }

  return { records, flags };
}

