/* =========================================================================
   Account profile completeness — flags accounts missing key data so CSMs
   (and super-admins, for the urgent tier) get nudged to fill it in.

   Two severity tiers:
     red    — must-have data. Missing ANY red field on ANY tracked deal (or
              at the client level) makes the whole account "red". The target
              state for a red account is to become at least yellow.
     yellow — nice-to-have data. Only evaluated once every red field is
              filled — an account already missing red data doesn't also get
              nagged about yellow gaps.
   An account with everything filled in is "none" (no badge).

   Scope rule (per the user, 2026-07-05): a per-deal field counts as missing
   if ANY of the account's TRACKED (active) deals lacks it — not just all of
   them. An account with zero tracked deals is missing every per-deal field
   by definition.
   ========================================================================= */

import type { Client, Deal } from "@/lib/types";
import type { DealDatesMap } from "@/lib/deal-overrides";

export type CompletenessSeverity = "red" | "yellow" | "none";

export interface CompletenessField {
  key: string;
  label: string;
}

export interface ProfileCompleteness {
  severity: CompletenessSeverity;
  missingRed: CompletenessField[];
  missingYellow: CompletenessField[];
}

function hasValue(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

type FieldCheck =
  | { key: string; label: string; scope: "client"; get: (client: Client) => unknown }
  | { key: string; label: string; scope: "deal"; get: (deal: Deal) => unknown }
  | { key: string; label: string; scope: "dealDate"; dateKey: string };

const RED_FIELDS: FieldCheck[] = [
  { key: "products", label: "Module", scope: "deal", get: (d) => d.products },
  { key: "useCases", label: "Use case", scope: "deal", get: (d) => d.useCases },
  { key: "globalLibraryPackage", label: "Global library", scope: "deal", get: (d) => d.globalLibraryPackage },
  { key: "globalLibraryLicenses", label: "Global library licenses", scope: "deal", get: (d) => d.globalLibraryLicenses },
  { key: "aiCourseCredits", label: "AI course credits", scope: "deal", get: (d) => d.aiCourseCredits },
  { key: "supportLevel", label: "Support level", scope: "deal", get: (d) => d.supportLevel },
  { key: "implementationLevel", label: "Implementation level", scope: "deal", get: (d) => d.implementationLevel },
  { key: "contractStartDate", label: "Contract start", scope: "deal", get: (d) => d.contractStartDate },
  { key: "numberOfUsers", label: "Licenses", scope: "deal", get: (d) => d.numberOfUsers },
  { key: "pricePerUser", label: "User price", scope: "deal", get: (d) => d.pricePerUser },
  { key: "csm", label: "CSM assignee", scope: "client", get: (c) => c.csm },
  { key: "implementationOwner", label: "Implementation assignee", scope: "client", get: (c) => c.implementationOwner },
  { key: "global_library_start_date", label: "Global library start", scope: "dealDate", dateKey: "global_library_start_date" },
  { key: "global_library_expiry_date", label: "Global library expiry", scope: "dealDate", dateKey: "global_library_expiry_date" },
];

const YELLOW_FIELDS: FieldCheck[] = [
  { key: "referralSource", label: "Acquisition Channel", scope: "deal", get: (d) => d.referralSource },
  { key: "contractDuration", label: "Contract length", scope: "deal", get: (d) => d.contractDuration },
  { key: "closeDate", label: "Closed won", scope: "deal", get: (d) => d.closeDate },
  { key: "kickoff_meeting_date", label: "Kick-off meeting", scope: "dealDate", dateKey: "kickoff_meeting_date" },
  { key: "invoice_sent_date", label: "Invoice sent", scope: "dealDate", dateKey: "invoice_sent_date" },
  { key: "platform_start_date", label: "Platform start", scope: "dealDate", dateKey: "platform_start_date" },
  { key: "platform_end_date", label: "Platform end", scope: "dealDate", dateKey: "platform_end_date" },
  { key: "industry", label: "Industry", scope: "client", get: (c) => c.industry },
  { key: "country", label: "Country", scope: "client", get: (c) => c.country },
  { key: "employees", label: "Employees", scope: "client", get: (c) => c.employees },
];

/** Field key → severity, for field-level "this one needs attention" icons
 *  (e.g. next to a deal-card field's label) — not just the account-level badge. */
export const FIELD_SEVERITY: Record<string, "red" | "yellow"> = {
  ...Object.fromEntries(RED_FIELDS.map((f) => [f.key, "red" as const])),
  ...Object.fromEntries(YELLOW_FIELDS.map((f) => [f.key, "yellow" as const])),
};

/** Is `field` missing for this account, given its tracked deals + per-deal dates? */
function isMissing(field: FieldCheck, client: Client, trackedDeals: Deal[], dealDates: DealDatesMap): boolean {
  if (field.scope === "client") return !hasValue(field.get(client));
  if (trackedDeals.length === 0) return true; // no deal to ever hold this field
  if (field.scope === "deal") return trackedDeals.some((d) => !hasValue(field.get(d)));
  // scope === "dealDate"
  return trackedDeals.some((d) => !hasValue(dealDates[d.id]?.[field.dateKey]));
}

export function computeProfileCompleteness(
  client: Client,
  trackedDeals: Deal[],
  dealDates: DealDatesMap,
): ProfileCompleteness {
  const missingRed = RED_FIELDS.filter((f) => isMissing(f, client, trackedDeals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingRed.length > 0) return { severity: "red", missingRed, missingYellow: [] };

  const missingYellow = YELLOW_FIELDS.filter((f) => isMissing(f, client, trackedDeals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingYellow.length > 0) return { severity: "yellow", missingRed: [], missingYellow };

  return { severity: "none", missingRed: [], missingYellow: [] };
}
