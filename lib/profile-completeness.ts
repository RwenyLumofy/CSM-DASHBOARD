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

   Scope rule, in two parts:
     WHICH deals are judged (2026-10-22) — an account's tracked SALES, falling
       back to all its tracked deals when it has no tracked sale. See
       setupDeals() below for why a renewal is not a contract setup, and why
       the fallback is load-bearing.
     WITHIN that set (per the user, 2026-07-05) — a per-deal field counts as
       missing if ANY judged deal lacks it, not just all of them. An account
       with no deals to judge is missing every per-deal field by definition.
   ========================================================================= */

import type { Client, Deal } from "@/lib/types";
import { hasGlobalLibrary, type DealDatesMap } from "@/lib/deal-overrides";

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
  | {
      key: string;
      label: string;
      scope: "dealDate";
      dateKey: string;
      /** When present and false for a deal, that deal never counts this date
       *  as missing — e.g. a global library date isn't required on a deal
       *  that has no global library at all. */
      requiredWhen?: (deal: Deal) => boolean;
      /** Account-wide fallback: if this returns a real value, the field
       *  counts as present for every tracked deal. Not used by launch_date —
       *  see that field's own comment below for why. Kept as a general
       *  capability for any future dealDate field that genuinely needs one. */
      legacyFallback?: (client: Client) => unknown;
    };

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
  { key: "global_library_start_date", label: "Global library start", scope: "dealDate", dateKey: "global_library_start_date", requiredWhen: hasGlobalLibrary },
  { key: "global_library_expiry_date", label: "Global library expiry", scope: "dealDate", dateKey: "global_library_expiry_date", requiredWhen: hasGlobalLibrary },
  // Launch is mandatory: it must be set on the deal itself (the "Launch" field
  // on the deal card). Deliberately NO legacyFallback to client.properties.
  // launch_date (the older, account-level property) — that field is easy to
  // have a stale/unrelated value in and isn't what a CSM sees when they check
  // this deal's own Launch field, so letting it silently satisfy the check
  // let real gaps go unflagged (confirmed live 2026-07-09: 39 accounts had an
  // empty per-deal Launch masked as "complete" by an old legacy value).
  { key: "launch_date", label: "Launch date", scope: "dealDate", dateKey: "launch_date" },
  // Kick-off is mandatory too: it must be set on the deal itself
  // (client.properties.__deal_dates[dealId].kickoff_meeting_date, the
  // "Kick-off meeting" field on the deal card). No legacyFallback here either
  // — there IS a separate, older account-level client.properties.
  // kickoff_meeting_date property (see scripts/create-properties.mjs), but
  // this check has never read it, so promoting this field to red carries none
  // of launch_date's old masking risk.
  { key: "kickoff_meeting_date", label: "Kick-off meeting", scope: "dealDate", dateKey: "kickoff_meeting_date" },
];

const YELLOW_FIELDS: FieldCheck[] = [
  { key: "referralSource", label: "Acquisition Channel", scope: "deal", get: (d) => d.referralSource },
  { key: "contractDuration", label: "Contract length (Years)", scope: "deal", get: (d) => d.contractDuration },
  { key: "closeDate", label: "Closed won", scope: "deal", get: (d) => d.closeDate },
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
  if (field.legacyFallback && hasValue(field.legacyFallback(client))) return false;
  return trackedDeals.some((d) => {
    if (field.requiredWhen && !field.requiredWhen(d)) return false;
    return !hasValue(dealDates[d.id]?.[field.dateKey]);
  });
}

/**
 * The deals an account's setup is judged on: its tracked SALES.
 *
 * A CS-pipeline deal (renewal, expansion, downgrade, churn) is a revenue
 * movement, not a contract setup. HubSpot holds licences and price on one and
 * nothing else — no modules, library, support or implementation level, no
 * kick-off or launch — so judging it against the sale fields reported a
 * fully-filled account as red the day a renewal synced (MEP, 2026-10-22).
 * Signal stopped pulling CS deals that same day (lib/integrations/hubspot.ts),
 * but the rows already synced stay on their accounts, so this scope is what
 * keeps them from being read as gaps.
 *
 * FALLING BACK MATTERS. 17 of the 19 accounts carrying a tracked CS deal have
 * no tracked sale left at all — the sale was untracked when its renewal
 * replaced it, which is how a renewal avoids double-counting ARR today. For
 * them the CS deal IS the current contract and carries the curated fields, so
 * dropping CS deals outright would have turned 17 complete accounts red.
 * Judge the sales when there are any; otherwise judge what the account has.
 */
function setupDeals(trackedDeals: Deal[]): Deal[] {
  const sales = trackedDeals.filter((d) => d.pipeline !== "cs");
  return sales.length > 0 ? sales : trackedDeals;
}

export function computeProfileCompleteness(
  client: Client,
  trackedDeals: Deal[],
  dealDates: DealDatesMap,
): ProfileCompleteness {
  trackedDeals = setupDeals(trackedDeals);
  const missingRed = RED_FIELDS.filter((f) => isMissing(f, client, trackedDeals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingRed.length > 0) return { severity: "red", missingRed, missingYellow: [] };

  const missingYellow = YELLOW_FIELDS.filter((f) => isMissing(f, client, trackedDeals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingYellow.length > 0) return { severity: "yellow", missingRed: [], missingYellow };

  return { severity: "none", missingRed: [], missingYellow: [] };
}
