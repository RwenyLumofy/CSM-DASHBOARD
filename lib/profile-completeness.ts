/* =========================================================================
   Account profile completeness — flags accounts missing key data so CSMs
   (and super-admins, for the urgent tier) get nudged to fill it in.

   Two severity tiers:
     red    — must-have data. A missing red field makes the whole account
              "red" (see the scope rule below for when a field counts as
              missing). The target state for a red account is to become at
              least yellow.
     yellow — nice-to-have data. Only evaluated once every red field is
              filled — an account already missing red data doesn't also get
              nagged about yellow gaps.
   An account with everything filled in is "none" (no badge).

   Scope rule (2026-10-22, replacing the 2026-07-05 "any tracked deal lacking
   it" rule): a per-deal field is missing only when NO deal on the account
   holds a value — every deal, tracked or not, sale or movement. An account
   with no deals at all is missing every per-deal field by definition.

   The rule it replaces asked whether every tracked deal was complete. That
   stopped describing reality once a deal row could be a revenue movement
   rather than a contract: a renewal carrying only licences and price made a
   fully-filled account red. Judging the sale instead failed the opposite way
   on 16 accounts whose curated setup lives on the renewal. See
   computeProfileCompleteness for the evidence and the trade this accepts.
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
      /** Narrows which deals the date is asked of — e.g. a global library
       *  date is asked only of a deal that has a global library. When no deal
       *  on the account is asked, the field is not missing. */
      requiredWhen?: (deal: Deal) => boolean;
      /** Account-wide fallback: if this returns a real value, the field
       *  counts as present whatever the deals hold. NO FIELD DEFINES ONE
       *  TODAY, so this branch is unreachable — launch_date deliberately does
       *  not use it (see that field's own comment below). Kept as a general
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

/**
 * Is `field` missing for this account — i.e. does NO deal on it hold a value?
 *
 * The question the badge answers is "do we know this about the account", so
 * one deal holding the value is enough. See the header for why this replaced
 * "any deal lacking it makes it missing".
 */
function isMissing(field: FieldCheck, client: Client, deals: Deal[], dealDates: DealDatesMap): boolean {
  if (field.scope === "client") return !hasValue(field.get(client));
  if (deals.length === 0) return true; // no deal to ever hold this field
  if (field.scope === "deal") return !deals.some((d) => hasValue(field.get(d)));
  // scope === "dealDate"
  if (field.legacyFallback && hasValue(field.legacyFallback(client))) return false;
  // `requiredWhen` narrows which deals the date is even asked of (a global
  // library date is asked only of a deal that has a library). When no deal is
  // asked, nothing is missing.
  const asked = field.requiredWhen ? deals.filter((d) => field.requiredWhen!(d)) : deals;
  if (asked.length === 0) return false;
  return !asked.some((d) => hasValue(dealDates[d.id]?.[field.dateKey]));
}

/**
 * `deals` is EVERY deal on the account — tracked or not, sale or movement.
 *
 * Not just the tracked ones, and not a chosen subset. Which row happens to
 * hold a value is an artefact of how the account was recorded, and both
 * narrower rules were tried against the whole book and failed:
 *
 *   - judging only tracked deals (until 2026-10-22) made an account red the
 *     day a renewal synced carrying licences and price and nothing else;
 *   - judging the account's sale instead turned 16 complete accounts red,
 *     because for those the curated setup lives on the RENEWAL — their sale
 *     was untracked when the renewal replaced it, which is how a renewal
 *     avoids double-counting ARR today.
 *
 * So neither row is reliably "the" source, and the badge's question is about
 * the ACCOUNT: do we know its modules, its library, when it launched? One deal
 * holding the value answers that, whichever row it is.
 *
 * THE TRADE, stated plainly: a value present on an older deal now satisfies
 * the check for a newer one, so a brand-new deal left blank is not flagged
 * while an earlier deal carries the same field. That is deliberate — the
 * alternative reports gaps in data the team demonstrably has. Per-record
 * completeness is the Contract tab's "Account setup" checklist, which judges
 * one contract record at a time.
 */
export function computeProfileCompleteness(
  client: Client,
  deals: Deal[],
  dealDates: DealDatesMap,
): ProfileCompleteness {
  const missingRed = RED_FIELDS.filter((f) => isMissing(f, client, deals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingRed.length > 0) return { severity: "red", missingRed, missingYellow: [] };

  const missingYellow = YELLOW_FIELDS.filter((f) => isMissing(f, client, deals, dealDates))
    .map((f) => ({ key: f.key, label: f.label }));
  if (missingYellow.length > 0) return { severity: "yellow", missingRed: [], missingYellow };

  return { severity: "none", missingRed: [], missingYellow: [] };
}
