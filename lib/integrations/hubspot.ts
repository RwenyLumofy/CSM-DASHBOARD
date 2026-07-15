/* =========================================================================
   HubSpot integration — acquisition only.

   HubSpot's job is narrow and stable: surface **Closed Won deals in the
   Direct and Indirect Sales pipelines**. Each won deal's associated company
   becomes a client, its `amount` seeds the ARR baseline (a `new_business`
   ledger event). Renewals, expansions, contractions, and churn are handled
   inside the app and are NEVER read back from HubSpot.

   Read-only. Auth: a Private App access token (HUBSPOT_ACCESS_TOKEN) with
   scopes crm.objects.deals.read, crm.objects.companies.read, and
   crm.objects.owners.read.
   ========================================================================= */

import { env } from "@/lib/config";
import type { Contact, Deal, Email, Meeting } from "@/lib/types";

const BASE = "https://api.hubapi.com";

// ---- Pipeline & stage IDs ------------------------------------------------

const DIRECT_SALES_PIPELINE   = "81ee3345-1b0f-42aa-9e78-580614546602";
const INDIRECT_SALES_PIPELINE = "72831594";
const CS_PIPELINE             = "98749610";

const DIRECT_SALES_CLOSED_WON  = "deal_registration_closed_won";
const INDIRECT_SALES_CLOSED_WON = "140914462";
const CS_PIPELINE_RENEWED       = "180725914";
const CS_PIPELINE_EXPANDED      = "1362217384";
// CS-pipeline "closed" stages that represent a LOSS, not revenue. Surfaced on
// the account (so a CSM sees the churn/downgrade) but inserted tracked=false so
// their amounts never enter the tracked-deal ARR sum in recomputeClient().
const CS_PIPELINE_CONFIRMED_CHURNED = "180390199";
const CS_PIPELINE_DOWNGRADED        = "1340008486";

// Company lifecycle stage id for a churned account, and HubSpot's auto-stamped
// "date entered the Churn stage" property — the source for the churned-account
// import's per-account churn date (see lib/integrations/churn-import.ts).
const LIFECYCLE_CHURN         = "978708591";
const CHURN_ENTERED_DATE_PROP = "hs_v2_date_entered_978708591";

const PIPELINES = [
  { id: DIRECT_SALES_PIPELINE,   wonStage: DIRECT_SALES_CLOSED_WON,  label: "direct"   as const },
  { id: INDIRECT_SALES_PIPELINE, wonStage: INDIRECT_SALES_CLOSED_WON, label: "indirect" as const },
];

/** CS-pipeline stages that must be surfaced on the account but kept out of ARR
 *  (inserted tracked=false). Confirmed Churned + Downgraded. */
const CS_NON_ARR_STAGES = new Set<string>([CS_PIPELINE_CONFIRMED_CHURNED, CS_PIPELINE_DOWNGRADED]);

// ---- Engagement object properties ----------------------------------------

const CONTACT_PROPERTIES = ["firstname", "lastname", "email", "phone", "mobilephone", "jobtitle"];
const EMAIL_PROPERTIES = [
  "hs_email_subject",
  "hs_email_from_email",
  "hs_email_to_email",
  "hs_email_direction",
  "hs_email_text",
  "hs_body_preview",
  "hs_timestamp",
];
const MEETING_PROPERTIES = [
  "hs_meeting_title",
  "hs_meeting_start_time",
  "hs_meeting_end_time",
  "hs_meeting_outcome",
  "hs_meeting_body",
  "hs_body_preview",
  "hs_meeting_location",
  "hs_timestamp",
];
const DEAL_PROPERTIES = [
  "dealname",
  "amount",
  "closedate",
  "pipeline",
  "dealstage",
  "tamkeen_subsidy",
  "deal_child_campaign",
  // The deal's Account Executive (a HubSpot owner picklist). This is the SOLE
  // source for the deal-card "Account Executive" field — the deal owner
  // (hubspot_owner_id) is intentionally NOT synced for deals.
  "account_executive",
  // Deal detail synced into our contract/product/date props.
  "number_of_users",
  "price_per_user",
  "modules",
  "use_cases",
  "complementary_licenses",
  "contract_duration",
  "contract_start_date",
  // Per-deal support & implementation level (HubSpot deal selects).
  "support_level",
  "implementation_level",
  // Global content library (deal-level).
  "global_libraries",
  "global_libraries_licenses",
  // Custom AI course development credits (number).
  "custom_ai_course_development_credits",
  // Sales → CSM handover narrative ("Account Brief for CSM Handover").
  "use_case_brief",
];

/** Pipeline id → qualifying stages — for surfacing deals on the client profile. */
const WON_DEAL_STAGES = new Map<string, { stages: string[]; label: "direct" | "indirect" | "cs" }>([
  [DIRECT_SALES_PIPELINE,   { stages: [DIRECT_SALES_CLOSED_WON],                       label: "direct"   }],
  [INDIRECT_SALES_PIPELINE, { stages: [INDIRECT_SALES_CLOSED_WON],                     label: "indirect" }],
  // CS: Renewed/Expanded (revenue, tracked) + Confirmed-Churned/Downgraded
  // (loss records, surfaced but inserted tracked=false — see the deal-shaping
  // loop in fetchClientEngagement and CS_NON_ARR_STAGES). This is what makes a
  // future account's churn/downgrade deal appear so the CSM can mark it churned.
  [CS_PIPELINE,             { stages: [CS_PIPELINE_RENEWED, CS_PIPELINE_EXPANDED, CS_PIPELINE_CONFIRMED_CHURNED, CS_PIPELINE_DOWNGRADED], label: "cs" }],
]);

// ---- Company properties --------------------------------------------------

const COMPANY_PROPERTIES = [
  "name",
  "domain",
  "country_dropdown",
  "country",
  "industry",
  "industry_group",
  "numberofemployees",
  "lifecyclestage",
  "customer_type",
  "hs_v2_date_entered_customer",
  // "Date entered Churn (Lifecycle Stage Pipeline)" — source for the churned-
  // account import's per-account churn date.
  CHURN_ENTERED_DATE_PROP,
  "hs_lastmodifieddate",
  "hubspot_owner_id",
  "csm", // custom company prop — the assigned CSM (a HubSpot owner id)
  // The Lumofy platform environment UUID (== environments_environment.id).
  // Already the reliable key linking a company to its Metabase usage data;
  // fetched here too (free — same batch call) so the sync can link Intercom
  // support data the same way instead of guessing by domain/company name.
  "mixpanel_company_id",
];

// ---- Types ---------------------------------------------------------------

export interface HubspotDeal {
  id: string;
  name: string | null;
  amount: number;
  closeDate: string | null; // YYYY-MM-DD
  pipeline: "direct" | "indirect" | "cs";
  /** `tamkeen_subsidy` enum on the deal: "Yes" | "No" | null. */
  isTamkeen: string | null;
  /** `deal_child_campaign` enum on the deal (e.g. "Jisr", "Future X"). */
  childCampaign: string | null;
  /** The deal's own `account_executive` property (a HubSpot owner id) — the
   *  SOLE source for the deal-card "Account Executive" field (see
   *  fetchClientEngagement's own comment). Resolved to a name/email via
   *  `owners` when building the app-level Deal. */
  accountExecutiveOwnerId: string | null;
  companyId: string | null;
}

export interface HubspotCompany {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  lifecycleStage: string | null;
  customerType: string | null;
  ownerId: string | null;
  /** Value of the company's custom `csm` property — a HubSpot owner id. */
  csmOwnerId: string | null;
  /** `mixpanel_company_id` — the Lumofy platform environment UUID. Equals
   *  environments_environment.id (Metabase usage linking) AND, per a live
   *  cross-check (2026-07-06), Intercom's `company_id` for the same company —
   *  the reliable key for linking Intercom support data. Null when unset. */
  mixpanelCompanyId: string | null;
  startedAt: string | null;
  /** ISO date the company entered the Churn lifecycle stage
   *  (hs_v2_date_entered_978708591). Null unless currently churned. Source for
   *  the churned-account import's per-account churn date. */
  churnDate: string | null;
  lastModifiedAt: string | null;
  /** Default initial renewal date = latest won close date + 1 year. */
  renewalDate: string | null;
  /**
   * Each won deal carries its own pipeline + tamkeen_subsidy / deal_child_campaign,
   * from which `deriveReferralSource` computes a per-deal referral source. The
   * client-level referral_source / closed_won_date_prop are derived from the FULL
   * deal history at persist time (so an incremental sync that re-touches an older
   * deal can't regress them) — see persistSync → recomputeClientReferral.
   */
  wonDeals: HubspotDeal[];
}

export interface HubspotOwner {
  id: string;
  name: string;
  email: string | null;
}

/** Everything acquisition-related, assembled in one pass. */
export interface HubspotAcquisition {
  companies: HubspotCompany[];
  warnings: string[];
}

/** One churned company + the data the one-time import needs to persist it. */
export interface ChurnedCompanyImport {
  company: HubspotCompany;
  /** ISO date the company entered the Churn stage (== company.churnDate). */
  churnDate: string | null;
  /** All qualifying deals (Direct/Indirect Closed Won + CS Renewed/Expanded/
   *  Confirmed-Churned/Downgraded), each already shaped with tracked=false —
   *  a churned account has no active revenue; the deals are historical records. */
  deals: Deal[];
  /** The pre-churn ARR to record as the ledger baseline (and churn amount).
   *  Priority: sum of Direct/Indirect Closed Won → else CS Renewed → else CS
   *  Confirmed-Churned. 0 when the company has none of these (imports as a
   *  churned logo with no retention impact). */
  baseline: number;
  /** Earliest close date among the deals that produced `baseline` (YYYY-MM-DD),
   *  used to date the baseline ledger event before the churn. */
  baselineDate: string | null;
}

export interface ChurnedAcquisition {
  companies: ChurnedCompanyImport[];
  warnings: string[];
}

// ---- Helpers -------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface AssocTo {
  toObjectId: number | string;
  associationTypes?: { label: string | null }[];
}

/**
 * Order so a "Primary ..." labeled association sorts first (stable otherwise).
 * Lets "first wins" consumers (e.g. a deal's owning company) correctly prefer
 * the primary link over an incidental secondary one when an object has 2+.
 */
function sortPrimaryFirst(to: AssocTo[]): string[] {
  const isPrimary = (t: AssocTo) => (t.associationTypes ?? []).some((a) => a.label?.toLowerCase().includes("primary"));
  return [...to].sort((a, b) => Number(isPrimary(b)) - Number(isPrimary(a))).map((t) => String(t.toObjectId));
}

function num(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** HubSpot multi-select (checkbox/enumeration) values arrive ";"-separated. */
function splitMulti(v: string | null | undefined): string[] {
  if (!v) return [];
  return v.split(";").map((s) => s.trim()).filter(Boolean);
}

function isoDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse a HubSpot date that may be ISO ("2025-03-01") or epoch-ms ("17..."). */
function flexDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = /^\d+$/.test(v.trim()) ? new Date(Number(v)) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dateOnly(v: string | null | undefined): string | null {
  const iso = isoDate(v);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Map a Closed Won deal to the in-app referral source, per Lumofy's rules:
 *   • Direct pipeline + tamkeen_subsidy = "Yes"    → "Tamkeen"
 *   • Direct pipeline + tamkeen_subsidy ≠ "Yes"    → "Direct Sales"
 *   • Indirect pipeline + child campaign "Jisr"    → "Jisr"
 *   • Indirect pipeline + child campaign "Future X" → "FutureX"
 *   • Indirect pipeline + any other campaign       → "Indirect"
 * Values match the seeded `referral_source` property options.
 */
export function deriveReferralSource(deal: HubspotDeal): string {
  // Acquisition channel, per Hussain's rules:
  //   1. Tamkeen      — tamkeen_subsidy = "Yes"
  //   2. Direct Sales — direct pipeline, tamkeen_subsidy ≠ "Yes"
  //   3. <child campaign> — indirect pipeline → the deal_child_campaign value
  // CS-pipeline deals (renewals/expansions) are NOT an acquisition → no channel.
  if ((deal.isTamkeen ?? "").trim().toLowerCase() === "yes") return "Tamkeen";
  if (deal.pipeline === "direct") return "Direct Sales";
  if (deal.pipeline === "indirect") return normalizeChannelValue(deal.childCampaign ?? "") || "Indirect";
  return "";
}

/** Known label variants for acquisition-channel / picklist values that differ
 *  only by spacing or casing from our canonical option (e.g. HubSpot's
 *  "Future X" → our "FutureX"). Keep keys lowercased. */
const OPTION_ALIASES: Record<string, string> = {
  "future x": "FutureX",
  "futurex": "FutureX",
};

/** Trim + collapse internal whitespace, then apply a known alias. Used so a
 *  HubSpot value never lands in our option lists as a near-duplicate. */
export function normalizeChannelValue(s: string): string {
  const t = String(s).trim().replace(/\s+/g, " ");
  if (!t) return "";
  return OPTION_ALIASES[t.toLowerCase()] ?? t;
}

/** Add one year to a YYYY-MM-DD date (annual contract default renewal). */
function plusOneYear(dateYmd: string | null): string | null {
  if (!dateYmd) return null;
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** HubSpot `hs_email_direction` enum → app email direction. */
function mapEmailDirection(v: string | null | undefined): Email["direction"] {
  if (!v) return null;
  if (v === "INCOMING_EMAIL") return "INBOUND";
  if (v === "FORWARDED_EMAIL") return "FORWARDED";
  return "OUTBOUND"; // "EMAIL" (logged/sent)
}


// ---- Client --------------------------------------------------------------

export class HubSpotClient {
  private token: string;

  constructor(token: string = env.hubspotToken) {
    this.token = token;
  }

  get configured(): boolean {
    return this.token.length > 0;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`HubSpot ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`HubSpot ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * The company's Mixpanel Company ID (property `mixpanel_company_id`) — a UUID
   * that equals the Lumofy platform `environments_environment.id`, i.e. the key
   * that links a CRM account to its product-usage environment in Metabase.
   * Returns null when the property is unset. Requires crm.objects.companies.read.
   */
  async fetchCompanyMixpanelId(hubspotCompanyId: string): Promise<string | null> {
    const data = await this.get<{ properties?: Record<string, string | null> }>(
      `/crm/v3/objects/companies/${hubspotCompanyId}?properties=mixpanel_company_id`,
    );
    const raw = data.properties?.mixpanel_company_id;
    return raw && raw.trim() ? raw.trim() : null;
  }

  /**
   * Live picklist options for a HubSpot deal property (enumeration). Returns the
   * option LABELS (the human-readable form we display + store, e.g. an owner
   * picklist like `account_executive` yields names, not owner ids), excluding
   * hidden ones. Non-enumeration properties return []. Requires the
   * crm.schemas.deals.read scope. Throwing is the caller's signal to fall back
   * to stored values only.
   */
  async fetchDealPropertyOptions(propertyName: string): Promise<string[]> {
    const res = await this.get<{ options?: { label: string; value: string; hidden?: boolean }[] }>(
      `/crm/v3/properties/deals/${encodeURIComponent(propertyName)}`,
    );
    return (res.options ?? [])
      .filter((o) => !o.hidden && o.label !== "")
      .map((o) => normalizeChannelValue(o.label));
  }

  /**
   * The whole acquisition pull: Closed Won deals → companies (clients) with
   * ARR baseline. Each won deal's associated company becomes a client row.
   *
   * `sinceDate` — ISO timestamp. When provided, only deals whose
   * `hs_lastmodifieddate` is at or after this value are fetched, making the
   * pull incremental. When absent, ALL Closed Won deals are returned.
   */
  async fetchAcquisition(sinceDate?: string): Promise<HubspotAcquisition> {
    const warnings: string[] = [];

    // ---- 1. All Closed Won deals across Direct + Indirect pipelines --------
    const deals = await this.fetchWonDeals(sinceDate);

    // ---- 2. deal → company (primary association) ---------------------------
    const dealCompany = await this.fetchPrimaryAssociations("deals", "companies", deals.map((d) => d.id));
    for (const d of deals) d.companyId = dealCompany.get(d.id) ?? null;

    const dealsWithCompany = deals.filter((d) => d.companyId);
    const orphanCount = deals.length - dealsWithCompany.length;
    if (orphanCount > 0) warnings.push(`${orphanCount} Closed Won deal(s) had no associated company and were skipped.`);

    // ---- 3. company properties --------------------------------------------
    const companyIds = [...new Set(dealsWithCompany.map((d) => d.companyId!))];
    const companyProps = await this.batchReadProperties("companies", companyIds, COMPANY_PROPERTIES);

    // ---- 4. assemble one company record per client ------------------------
    // Only pull companies where customer_type = "arr" AND lifecyclestage = "customer".
    const byCompany = new Map<string, HubspotCompany>();
    let skippedOtp = 0;
    for (const deal of dealsWithCompany) {
      const cid = deal.companyId!;
      if (byCompany.has(cid)) {
        byCompany.get(cid)!.wonDeals.push(deal);
        continue;
      }
      const p = companyProps.get(cid) ?? {};
      const customerType = (p.customer_type ?? "").toLowerCase();
      const lifecycle = (p.lifecyclestage ?? "").toLowerCase();
      if (!customerType.includes("arr") || lifecycle !== "customer") {
        skippedOtp++;
        continue;
      }
      const company = this.mapCompany(cid, p);
      company.wonDeals.push(deal);
      byCompany.set(cid, company);
    }
    if (skippedOtp > 0)
      warnings.push(`${skippedOtp} company/companies skipped — not customer_type=ARR + lifecyclestage=Customer.`);

    // Default renewal date + customer-since fallback from the won deals.
    // (Referral source & closed-won date are derived from the full persisted
    // deal history later, not from this possibly-partial incremental set.)
    for (const company of byCompany.values()) {
      const latestClose = company.wonDeals
        .map((d) => d.closeDate)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
      company.renewalDate = plusOneYear(latestClose);
      if (!company.startedAt && latestClose) company.startedAt = isoDate(latestClose);
    }

    return { companies: [...byCompany.values()], warnings };
  }

  /**
   * Same assembly + qualification rules as fetchAcquisition (customer_type ~
   * "arr" AND lifecyclestage = "customer"; deals limited to Direct/Indirect
   * Closed Won), but sourced from EXPLICIT company ids instead of a
   * date-filtered deal search. For one-off backfills of a single account whose
   * qualifying deal wasn't itself modified inside a normal incremental sync's
   * window — e.g. a reactivation that only changed the company's lifecycle
   * stage, not its deal. Never force-adds a non-qualifying company (skips +
   * warns instead, same as fetchAcquisition). Not used by the recurring sync.
   */
  async fetchAcquisitionByCompanyIds(companyIds: string[]): Promise<HubspotAcquisition> {
    const warnings: string[] = [];
    if (companyIds.length === 0) return { companies: [], warnings };

    const companyProps = await this.batchReadProperties("companies", companyIds, COMPANY_PROPERTIES);
    const coDeals = await this.fetchAllAssociations("companies", "deals", companyIds);
    const allDealIds = [...new Set([...coDeals.values()].flat())];
    const dealProps = await this.batchReadProperties("deals", allDealIds, [
      "dealname",
      "amount",
      "closedate",
      "pipeline",
      "dealstage",
      "tamkeen_subsidy",
      "deal_child_campaign",
      "account_executive",
    ]);

    const byCompany = new Map<string, HubspotCompany>();
    for (const cid of companyIds) {
      const p = companyProps.get(cid);
      if (!p) {
        warnings.push(`Company ${cid} not found in HubSpot.`);
        continue;
      }
      const customerType = (p.customer_type ?? "").toLowerCase();
      const lifecycle = (p.lifecyclestage ?? "").toLowerCase();
      if (!customerType.includes("arr") || lifecycle !== "customer") {
        warnings.push(`Company ${cid} (${p.name ?? cid}) skipped — not customer_type=ARR + lifecyclestage=Customer.`);
        continue;
      }
      byCompany.set(cid, this.mapCompany(cid, p));
    }

    for (const [cid, dealIds] of coDeals) {
      const co = byCompany.get(cid);
      if (!co) continue;
      for (const dId of dealIds) {
        const p = dealProps.get(dId);
        if (!p) continue;
        // Same qualifying rule as fetchWonDeals: Direct/Indirect Closed Won only.
        const pipe = PIPELINES.find((pp) => pp.id === p.pipeline && pp.wonStage === p.dealstage);
        if (!pipe) continue;
        co.wonDeals.push({
          id: dId,
          name: p.dealname ?? null,
          amount: num(p.amount) ?? 0,
          closeDate: dateOnly(p.closedate),
          pipeline: pipe.label,
          isTamkeen: p.tamkeen_subsidy ?? null,
          childCampaign: p.deal_child_campaign ?? null,
          accountExecutiveOwnerId: p.account_executive ?? null,
          companyId: cid,
        });
      }
    }

    for (const company of byCompany.values()) {
      const latestClose = company.wonDeals
        .map((d) => d.closeDate)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
      company.renewalDate = plusOneYear(latestClose);
      if (!company.startedAt && latestClose) company.startedAt = isoDate(latestClose);
    }

    return { companies: [...byCompany.values()], warnings };
  }

  /**
   * All Closed Won deals in the Direct & Indirect pipelines.
   * When `sinceDate` is provided, an additional filter restricts results to
   * deals whose `hs_lastmodifieddate` is ≥ that timestamp (ms epoch string),
   * making each call incremental.
   */
  private async fetchWonDeals(sinceDate?: string): Promise<HubspotDeal[]> {
    const sinceMs = sinceDate ? String(new Date(sinceDate).getTime()) : null;
    const out: HubspotDeal[] = [];
    for (const p of PIPELINES) {
      let after: string | undefined;
      do {
        type SearchResponse = {
          results: { id: string; properties: Record<string, string | null> }[];
          paging?: { next?: { after?: string } };
        };
        const baseFilters = [
          { propertyName: "pipeline", operator: "EQ", value: p.id },
          { propertyName: "dealstage", operator: "EQ", value: p.wonStage },
          ...(sinceMs ? [{ propertyName: "hs_lastmodifieddate", operator: "GTE", value: sinceMs }] : []),
        ];
        const data = await this.post<SearchResponse>("/crm/v3/objects/deals/search", {
          filterGroups: [{ filters: baseFilters }],
          properties: [
            "dealname",
            "amount",
            "closedate",
            "pipeline",
            "dealstage",
            "tamkeen_subsidy",
            "deal_child_campaign",
            "account_executive",
          ],
          limit: 100,
          ...(after ? { after } : {}),
        });
        for (const r of data.results) {
          out.push({
            id: r.id,
            name: r.properties.dealname ?? null,
            amount: num(r.properties.amount) ?? 0,
            closeDate: dateOnly(r.properties.closedate),
            pipeline: p.label,
            isTamkeen: r.properties.tamkeen_subsidy ?? null,
            childCampaign: r.properties.deal_child_campaign ?? null,
            accountExecutiveOwnerId: r.properties.account_executive ?? null,
            companyId: null,
          });
        }
        after = data.paging?.next?.after;
      } while (after);
    }
    return out;
  }

  private mapCompany(id: string, p: Record<string, string | null>): HubspotCompany {
    return {
      id,
      name: p.name ?? "(unnamed)",
      domain: p.domain ?? null,
      // Prefer the "Country" dropdown enum; fall back to the "Country/Region" text.
      country: (p.country_dropdown?.trim() || p.country?.trim()) || null,
      // Prefer the curated "Industry Group" enum; fall back to the generic
      // HubSpot industry. Both are already display-formatted (no humanize).
      industry: (p.industry_group?.trim() || p.industry?.trim()) || null,
      employees: num(p.numberofemployees),
      lifecycleStage: p.lifecyclestage ?? null,
      customerType: p.customer_type ?? null,
      ownerId: p.hubspot_owner_id ?? null,
      csmOwnerId: p.csm ?? null,
      mixpanelCompanyId: p.mixpanel_company_id?.trim() || null,
      startedAt: isoDate(p.hs_v2_date_entered_customer),
      churnDate: dateOnly(p[CHURN_ENTERED_DATE_PROP]),
      lastModifiedAt: p.hs_lastmodifieddate ?? null,
      renewalDate: null,
      wonDeals: [],
    };
  }

  /** Batch-read object properties → Map<objectId, properties>. */
  private async batchReadProperties(
    objectType: string,
    ids: string[],
    properties: string[],
  ): Promise<Map<string, Record<string, string | null>>> {
    const out = new Map<string, Record<string, string | null>>();
    for (const chunk of chunkArray(ids, 100)) {
      type BatchRead = { results: { id: string; properties: Record<string, string | null> }[] };
      const data = await this.post<BatchRead>(`/crm/v3/objects/${objectType}/batch/read`, {
        properties,
        inputs: chunk.map((id) => ({ id })),
      });
      for (const r of data.results) out.set(r.id, r.properties);
    }
    return out;
  }

  /** Map each `from` object to its primary associated `to` object id (the
   *  first one, once `fetchAllAssociations` has sorted primary-labeled links
   *  first — falls back to whichever came first if none is explicitly primary). */
  private async fetchPrimaryAssociations(
    from: string,
    to: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    const all = await this.fetchAllAssociations(from, to, ids);
    const primary = new Map<string, string>();
    for (const [id, tos] of all) if (tos.length > 0) primary.set(id, tos[0]!);
    return primary;
  }

  /** Owner id → owner. Used to label accounts with their CSM. */
  async fetchOwners(): Promise<Map<string, HubspotOwner>> {
    const map = new Map<string, HubspotOwner>();
    let after: string | undefined;
    do {
      type OwnersResponse = {
        results: { id: string; firstName?: string; lastName?: string; email?: string }[];
        paging?: { next?: { after?: string } };
      };
      const path = `/crm/v3/owners?limit=100${after ? `&after=${after}` : ""}`;
      const data = await this.get<OwnersResponse>(path);
      for (const o of data.results) {
        const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || `Owner ${o.id}`;
        map.set(o.id, { id: o.id, name, email: o.email ?? null });
      }
      after = data.paging?.next?.after;
    } while (after);
    return map;
  }

  // ---- Engagement (contacts / emails / meetings) -------------------------

  /**
   * Map each `from` object to ALL associated `to` object ids. Uses the v4
   * associations API, NOT v3: v3's `/crm/v3/associations/.../batch/read` was
   * observed to hard-error "NO_ASSOCIATIONS_FOUND" for a company with real,
   * live associations (a company + its contact associations both created a
   * few days earlier) while v4 correctly returned them — an indexing-lag bug
   * on HubSpot's v3 endpoint for recently-created objects/associations. v4
   * matches v3 exactly for older, already-indexed data, so this is a strict
   * upgrade with no observed regression.
   */
  private async fetchAllAssociations(from: string, to: string, ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    // The batch/read endpoint caps at 500 `to` results per `from` object with
    // NO paging cursor — anything beyond that is silently dropped, no error.
    // Flag any object that hits the cap and backfill its true full list via
    // the paginated single-object endpoint below.
    const BATCH_TRUNCATION_LIMIT = 500;
    const truncated: string[] = [];
    for (const chunk of chunkArray(ids, 100)) {
      type AssocBatch = { results: { from: { id: string }; to: AssocTo[] }[] };
      const data = await this.post<AssocBatch>(`/crm/v4/associations/${from}/${to}/batch/read`, {
        inputs: chunk.map((id) => ({ id })),
      });
      for (const r of data.results) {
        if (r.to.length > 0) map.set(r.from.id, sortPrimaryFirst(r.to));
        if (r.to.length >= BATCH_TRUNCATION_LIMIT) truncated.push(r.from.id);
      }
    }
    for (const id of truncated) map.set(id, await this.fetchAllAssociationsPaged(from, to, id));
    return map;
  }

  /** Full, properly-paginated association list for one object — used only as
   *  a backfill when the batch/read endpoint's silent 500-result cap hits. */
  private async fetchAllAssociationsPaged(from: string, to: string, fromId: string): Promise<string[]> {
    type Page = { results: AssocTo[]; paging?: { next?: { after?: string } } };
    const all: AssocTo[] = [];
    let after: string | undefined;
    do {
      const qs = `?limit=500${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const page = await this.get<Page>(`/crm/v4/objects/${from}/${fromId}/associations/${to}${qs}`);
      all.push(...page.results);
      after = page.paging?.next?.after;
    } while (after);
    return sortPrimaryFirst(all);
  }

  /**
   * Pull the FULL engagement footprint for each tracked company — contacts,
   * emails, and meetings associated with (a) the company itself, (b) its
   * qualifying deals (Direct/Indirect Closed Won + CS Renewed/Expanded), and
   * (c) each of its contacts (where most emails/meetings actually live). All
   * three sources are merged and deduped by object id, so it reflects the real
   * volume of activity. Everything is keyed to the in-app clientId.
   *
   * @param companyToClient HubSpot companyId → canonical in-app clientId.
   */
  async fetchClientEngagement(
    companyToClient: Map<string, string>,
  ): Promise<{ contacts: Contact[]; emails: Email[]; meetings: Meeting[]; deals: Deal[] }> {
    const empty = { contacts: [], emails: [], meetings: [], deals: [] };
    const companyIds = [...companyToClient.keys()];
    if (companyIds.length === 0) return empty;

    // 1. company → deals, read deal props, keep only qualifying deals
    //    (Direct/Indirect Closed Won + CS Renewed/Expanded).
    const coDeals = await this.fetchAllAssociations("companies", "deals", companyIds);
    const dealCompany = new Map<string, string>();
    for (const [coId, ids] of coDeals) for (const id of ids) if (!dealCompany.has(id)) dealCompany.set(id, coId);
    const allDealIds = [...dealCompany.keys()];
    const dealProps = await this.batchReadProperties("deals", allDealIds, DEAL_PROPERTIES);

    const qualDealIds: string[] = [];
    for (const dId of allDealIds) {
      const p = dealProps.get(dId) ?? {};
      const won = WON_DEAL_STAGES.get(p.pipeline ?? "");
      if (won && won.stages.includes(p.dealstage ?? "")) qualDealIds.push(dId);
    }

    // 2. Company-level AND deal-level associations (contacts/emails/meetings).
    // Use allDealIds (not just qualifying) so engagements from every deal stage
    // are captured — pre-sales, open deals, and closed-lost all feed the record.
    const [coContacts, coEmails, coMeetings, dlContacts, dlEmails, dlMeetings] = await Promise.all([
      this.fetchAllAssociations("companies", "contacts", companyIds),
      this.fetchAllAssociations("companies", "emails", companyIds),
      this.fetchAllAssociations("companies", "meetings", companyIds),
      this.fetchAllAssociations("deals", "contacts", allDealIds),
      this.fetchAllAssociations("deals", "emails", allDealIds),
      this.fetchAllAssociations("deals", "meetings", allDealIds),
    ]);

    // contactId → ALL owning companyIds (company assoc + every deal's company).
    // A contact can legitimately sit on deals under more than one company (e.g.
    // a shared HR/admin contact after a company is split into cohorts) — we
    // attribute it to every one of them rather than picking a single "winner",
    // so a split company doesn't silently lose the other side's engagement.
    const contactCompanies = new Map<string, Set<string>>();
    const addTo = (m: Map<string, Set<string>>, id: string, coId: string) => {
      const s = m.get(id) ?? new Set<string>();
      s.add(coId);
      m.set(id, s);
    };
    for (const [coId, ids] of coContacts) for (const id of ids) addTo(contactCompanies, id, coId);
    for (const [dId, ids] of dlContacts) { const co = dealCompany.get(dId); if (co) for (const id of ids) addTo(contactCompanies, id, co); }
    const allContactIds = [...contactCompanies.keys()];

    // 3. Contact-level emails/meetings — the bulk of real activity.
    const [ctEmails, ctMeetings] = await Promise.all([
      this.fetchAllAssociations("contacts", "emails", allContactIds),
      this.fetchAllAssociations("contacts", "meetings", allContactIds),
    ]);

    // 4. Resolve each email/meeting to EVERY client it's associated with
    //    (company → deal → contact), deduping by (client, object) pair. Remember
    //    the originating deal per client when known.
    const emailClients = new Map<string, Set<string>>();
    const meetingClients = new Map<string, Set<string>>();
    const emailDealByClient = new Map<string, Map<string, string>>();
    const meetingDealByClient = new Map<string, Map<string, string>>();
    const assign = (m: Map<string, Set<string>>, objId: string, coId: string) => {
      const cl = companyToClient.get(coId);
      if (cl) addTo(m, objId, cl);
    };
    const assignDeal = (m: Map<string, Map<string, string>>, objId: string, clientId: string, dId: string) => {
      const byClient = m.get(objId) ?? new Map<string, string>();
      if (!byClient.has(clientId)) byClient.set(clientId, dId);
      m.set(objId, byClient);
    };
    for (const [coId, ids] of coEmails) for (const id of ids) assign(emailClients, id, coId);
    for (const [coId, ids] of coMeetings) for (const id of ids) assign(meetingClients, id, coId);
    for (const [dId, ids] of dlEmails) {
      const co = dealCompany.get(dId);
      const cl = co ? companyToClient.get(co) : undefined;
      if (co && cl) for (const id of ids) { assign(emailClients, id, co); assignDeal(emailDealByClient, id, cl, dId); }
    }
    for (const [dId, ids] of dlMeetings) {
      const co = dealCompany.get(dId);
      const cl = co ? companyToClient.get(co) : undefined;
      if (co && cl) for (const id of ids) { assign(meetingClients, id, co); assignDeal(meetingDealByClient, id, cl, dId); }
    }
    for (const [ctId, ids] of ctEmails) { const cos = contactCompanies.get(ctId); if (cos) for (const co of cos) for (const id of ids) assign(emailClients, id, co); }
    for (const [ctId, ids] of ctMeetings) { const cos = contactCompanies.get(ctId); if (cos) for (const co of cos) for (const id of ids) assign(meetingClients, id, co); }

    // 5. Batch-read object properties + owners.
    const [contactProps, emailProps, meetingProps, owners] = await Promise.all([
      this.batchReadProperties("contacts", allContactIds, CONTACT_PROPERTIES),
      this.batchReadProperties("emails", [...emailClients.keys()], EMAIL_PROPERTIES),
      this.batchReadProperties("meetings", [...meetingClients.keys()], MEETING_PROPERTIES),
      this.fetchOwners().catch(() => new Map<string, HubspotOwner>()),
    ]);

    const now = new Date().toISOString();
    const portal = process.env.HUBSPOT_PORTAL_ID ?? "";

    // One row per (client, hubspot object) pair — the same person/email/meeting
    // can appear once per client it's genuinely associated with. When an object
    // resolves to exactly one client (the overwhelming majority), keep the
    // legacy unscoped id so the existing row just updates in place; only widen
    // to a client-scoped id for the rare object shared across clients (e.g. a
    // contact who sits on deals under two companies after a company split) —
    // this keeps the migration's blast radius to just those few shared rows.
    const idFor = (prefix: string, rawId: string, clientId: string, clientCount: number) =>
      clientCount > 1 ? `${prefix}-${clientId}-${rawId}` : `${prefix}-${rawId}`;

    const contacts: Contact[] = [];
    for (const cId of allContactIds) {
      const p = contactProps.get(cId) ?? {};
      const companyIds = contactCompanies.get(cId) ?? new Set<string>();
      const clientIds = [...companyIds].map((co) => companyToClient.get(co)).filter((c): c is string => !!c);
      for (const clientId of clientIds) {
        contacts.push({
          id: idFor("hsc", cId, clientId, clientIds.length),
          clientId,
          hubspotContactId: cId,
          firstName: p.firstname ?? null,
          lastName: p.lastname ?? null,
          email: p.email ?? null,
          phone: p.phone ?? p.mobilephone ?? null,
          jobTitle: p.jobtitle ?? null,
          isPrimary: false,
          createdAt: now,
        });
      }
    }

    const emails: Email[] = [];
    for (const [eId, clientIds] of emailClients) {
      const p = emailProps.get(eId) ?? {};
      for (const clientId of clientIds) {
        const dId = emailDealByClient.get(eId)?.get(clientId);
        emails.push({
          id: idFor("hse", eId, clientId, clientIds.size),
          clientId,
          dealId: dId ? `hs-deal-${dId}` : null,
          hubspotEmailId: eId,
          subject: p.hs_email_subject ?? null,
          fromEmail: p.hs_email_from_email ?? null,
          toEmail: p.hs_email_to_email ?? null,
          direction: mapEmailDirection(p.hs_email_direction),
          bodySnippet: (p.hs_body_preview ?? p.hs_email_text ?? null)?.slice(0, 500) ?? null,
          sentAt: isoDate(p.hs_timestamp),
          createdAt: now,
        });
      }
    }

    const meetings: Meeting[] = [];
    for (const [mId, clientIds] of meetingClients) {
      const p = meetingProps.get(mId) ?? {};
      for (const clientId of clientIds) {
        const dId = meetingDealByClient.get(mId)?.get(clientId);
        meetings.push({
          id: idFor("hsm", mId, clientId, clientIds.size),
          clientId,
          dealId: dId ? `hs-deal-${dId}` : null,
          hubspotMeetingId: mId,
          title: p.hs_meeting_title ?? null,
          startTime: isoDate(p.hs_meeting_start_time),
          endTime: isoDate(p.hs_meeting_end_time),
          outcome: p.hs_meeting_outcome ?? null,
          notes: (p.hs_meeting_body ?? p.hs_body_preview ?? null)?.slice(0, 1000) ?? null,
          location: p.hs_meeting_location ?? null,
          createdAt: now,
        });
      }
    }

    // Qualifying deals (Direct/Indirect Closed Won + CS Renewed/Expanded).
    const deals: Deal[] = [];
    for (const dId of qualDealIds) {
      const p = dealProps.get(dId) ?? {};
      const won = WON_DEAL_STAGES.get(p.pipeline ?? "")!;
      const coId = dealCompany.get(dId)!;
      // Account Executive = the deal's `account_executive` property (a HubSpot
      // owner picklist), NOT the deal owner. Resolve its owner id → name/email.
      const ae = p.account_executive ? owners.get(p.account_executive) : undefined;
      const hsDeal: HubspotDeal = {
        id: dId,
        name: p.dealname ?? null,
        amount: num(p.amount) ?? 0,
        closeDate: dateOnly(p.closedate),
        pipeline: won.label,
        isTamkeen: p.tamkeen_subsidy ?? null,
        childCampaign: p.deal_child_campaign ?? null,
        accountExecutiveOwnerId: p.account_executive ?? null,
        companyId: coId,
      };
      deals.push({
        id: `hs-deal-${dId}`,
        clientId: companyToClient.get(coId)!,
        hubspotDealId: dId,
        name: p.dealname ?? null,
        amount: num(p.amount) ?? 0,
        closeDate: p.closedate ? `${dateOnly(p.closedate)}T00:00:00.000Z` : null,
        pipeline: won.label,
        referralSource: deriveReferralSource(hsDeal),
        ownerName: ae?.name ?? null,
        ownerEmail: ae?.email ?? null,
        hubspotUrl: `https://app.hubspot.com/contacts/${portal}/record/0-3/${dId}`,
        // Deal detail → combined into our contract/product/date props.
        numberOfUsers: num(p.number_of_users),
        pricePerUser: num(p.price_per_user),
        complementaryLicenses: num(p.complementary_licenses),
        contractDuration: num(p.contract_duration),
        products: splitMulti(p.modules),
        useCases: splitMulti(p.use_cases),
        contractStartDate: flexDate(p.contract_start_date),
        // Per-deal levels synced from HubSpot (read-only in the app).
        supportLevel: p.support_level?.trim() || null,
        implementationLevel: p.implementation_level?.trim() || null,
        // Global content library (deal-level, synced).
        globalLibraryPackage: splitMulti(p.global_libraries),
        globalLibraryLicenses: num(p.global_libraries_licenses),
        // Custom AI course development credits (deal-level, synced).
        aiCourseCredits: num(p.custom_ai_course_development_credits),
        // Sales → CSM handover brief (free text); empty until sales fills it in.
        accountBrief: p.use_case_brief?.trim() || null,
        // CS-pipeline "Expanded" stage = expansion; everything else = renewal.
        category: won.label === "cs" && p.dealstage === CS_PIPELINE_EXPANDED ? "expansion" : "renewal",
        // Confirmed-Churned / Downgraded CS deals are loss records: surface them
        // on the account but keep them tracked=false so their amount never adds
        // to the account's ARR (recomputeClient sums tracked deals). All other
        // qualifying deals keep the column default (tracked=true).
        tracked: won.label === "cs" && CS_NON_ARR_STAGES.has(p.dealstage ?? "") ? false : undefined,
        createdAt: now,
      });
    }

    return { contacts, emails, meetings, deals };
  }

  /**
   * The churned-account import (one-time backfill — see
   * lib/integrations/churn-import.ts). Company-first: finds every company
   * currently in the Churn lifecycle stage whose customer_type includes "arr",
   * reads its churn date + qualifying deals, and returns everything the import
   * needs. Unlike fetchAcquisition this reaches CS-pipeline deals and does NOT
   * filter by hs_lastmodifieddate — it's a full backfill, not the incremental
   * acquisition sync (which is left completely untouched).
   */
  async fetchChurnedAcquisition(): Promise<ChurnedAcquisition> {
    const warnings: string[] = [];

    // 1. Companies in the Churn stage with customer_type ~ "arr".
    const companyIds: string[] = [];
    let after: string | undefined;
    do {
      type SearchResponse = { results: { id: string }[]; paging?: { next?: { after?: string } } };
      const data = await this.post<SearchResponse>("/crm/v3/objects/companies/search", {
        filterGroups: [
          {
            filters: [
              { propertyName: "lifecyclestage", operator: "EQ", value: LIFECYCLE_CHURN },
              { propertyName: "customer_type", operator: "CONTAINS_TOKEN", value: "arr" },
            ],
          },
        ],
        properties: ["name"],
        limit: 100,
        ...(after ? { after } : {}),
      });
      for (const r of data.results) companyIds.push(r.id);
      after = data.paging?.next?.after;
    } while (after);

    if (companyIds.length === 0) return { companies: [], warnings };

    // 2. Company properties (incl. churn date) + owners (for AE names).
    const companyProps = await this.batchReadProperties("companies", companyIds, COMPANY_PROPERTIES);
    const owners = await this.fetchOwners().catch((e) => {
      warnings.push(`HubSpot owners lookup failed: ${e}`);
      return new Map<string, HubspotOwner>();
    });

    // 3. Each company's deals (all stages read; filtered to qualifying below).
    const coDeals = await this.fetchAllAssociations("companies", "deals", companyIds);
    const allDealIds = [...new Set([...coDeals.values()].flat())];
    const dealProps = await this.batchReadProperties("deals", allDealIds, DEAL_PROPERTIES);

    const now = new Date().toISOString();
    const portal = process.env.HUBSPOT_PORTAL_ID ?? "";

    // Classify a deal → { label, tier } or null (not a qualifying stage). The
    // baseline tier picks the pre-churn ARR source in priority order:
    // 0 = Direct/Indirect Closed Won, 1 = CS Renewed, 2 = CS Confirmed Churned;
    // 3 = surfaced on the account but never seeds the baseline (Expanded/Downgraded).
    const classify = (pipeline: string, stage: string): { label: "direct" | "indirect" | "cs"; tier: number } | null => {
      if (pipeline === DIRECT_SALES_PIPELINE && stage === DIRECT_SALES_CLOSED_WON) return { label: "direct", tier: 0 };
      if (pipeline === INDIRECT_SALES_PIPELINE && stage === INDIRECT_SALES_CLOSED_WON) return { label: "indirect", tier: 0 };
      if (pipeline === CS_PIPELINE) {
        if (stage === CS_PIPELINE_RENEWED) return { label: "cs", tier: 1 };
        if (stage === CS_PIPELINE_CONFIRMED_CHURNED) return { label: "cs", tier: 2 };
        if (stage === CS_PIPELINE_EXPANDED || stage === CS_PIPELINE_DOWNGRADED) return { label: "cs", tier: 3 };
      }
      return null;
    };

    const companies: ChurnedCompanyImport[] = [];
    for (const cid of companyIds) {
      const cp = companyProps.get(cid);
      if (!cp) continue;
      const company = this.mapCompany(cid, cp);
      const deals: Deal[] = [];
      const tierSum = [0, 0, 0]; // summed amounts for baseline tiers 0/1/2
      const tierEarliest: (string | null)[] = [null, null, null];

      for (const dId of coDeals.get(cid) ?? []) {
        const p = dealProps.get(dId);
        if (!p) continue;
        const cls = classify(p.pipeline ?? "", p.dealstage ?? "");
        if (!cls) continue;
        const amount = num(p.amount) ?? 0;
        const close = dateOnly(p.closedate);
        if (cls.tier <= 2) {
          tierSum[cls.tier] += amount;
          if (close && (!tierEarliest[cls.tier] || close < tierEarliest[cls.tier]!)) tierEarliest[cls.tier] = close;
        }
        const ae = p.account_executive ? owners.get(p.account_executive) : undefined;
        deals.push({
          id: `hs-deal-${dId}`,
          clientId: cid,
          hubspotDealId: dId,
          name: p.dealname ?? null,
          amount,
          closeDate: close ? `${close}T00:00:00.000Z` : null,
          pipeline: cls.label,
          referralSource: null,
          ownerName: ae?.name ?? null,
          ownerEmail: ae?.email ?? null,
          hubspotUrl: `https://app.hubspot.com/contacts/${portal}/record/0-3/${dId}`,
          numberOfUsers: num(p.number_of_users),
          pricePerUser: num(p.price_per_user),
          complementaryLicenses: num(p.complementary_licenses),
          contractDuration: num(p.contract_duration),
          products: splitMulti(p.modules),
          useCases: splitMulti(p.use_cases),
          contractStartDate: flexDate(p.contract_start_date),
          supportLevel: p.support_level?.trim() || null,
          implementationLevel: p.implementation_level?.trim() || null,
          globalLibraryPackage: splitMulti(p.global_libraries),
          globalLibraryLicenses: num(p.global_libraries_licenses),
          aiCourseCredits: num(p.custom_ai_course_development_credits),
          accountBrief: p.use_case_brief?.trim() || null,
          category: cls.label === "cs" && p.dealstage === CS_PIPELINE_EXPANDED ? "expansion" : "renewal",
          // A churned account has no active revenue — every historical deal is
          // tracked=false so none of them feed the tracked-deal ARR sum.
          tracked: false,
          createdAt: now,
        });
      }

      // Baseline = first non-zero tier in priority order (Closed Won > Renewed
      // > Confirmed Churned). 0 when the company has none of these.
      let baseline = 0;
      let baselineDate: string | null = null;
      for (let t = 0; t <= 2; t++) {
        if (tierSum[t] > 0) {
          baseline = tierSum[t];
          baselineDate = tierEarliest[t];
          break;
        }
      }

      companies.push({ company, churnDate: company.churnDate, deals, baseline, baselineDate });
    }

    return { companies, warnings };
  }
}
