/* =========================================================================
   The Clients CSV, for the read-only feed at /api/export/clients.

   A COPY of exportCsv() in components/clients/ClientsTable.tsx — same 19
   columns, same formatting — so the CEO deck ingests exactly the file the
   "Export CSV" button produces. It is a copy rather than shared code on
   purpose: the feed was added without changing a line of the Clients page.
   If a column changes there, change it here too.

   Pure: no database, no auth, no side effects.
   ========================================================================= */

import type { Client } from "@/lib/types";
import type { CsvCell } from "@/lib/csv";

export const CLIENT_CSV_HEADERS = [
  "Name", "Domain", "Status", "CSM", "Implementation owner",
  "ARR", "Currency", "Previous ARR", "Renewal date", "Contract start",
  "Health score", "Health tier", "Country", "Industry", "Segment",
  "Employees", "Acquisition channel", "Account tier", "Profile completeness",
];

export function channelOf(c: Client): string | null {
  const v = c.properties?.referral_source;
  return typeof v === "string" && v.trim() ? v : null;
}

export function accountTierOf(c: Client): string | null {
  const v = c.properties?.tier;
  return typeof v === "string" && v.trim() ? v : null;
}

/** Severity from lib/profile-completeness, or undefined when not computed. */
type Severity = "red" | "yellow" | "green" | string | undefined;

export function clientCsvRow(c: Client, completeness: Severity): CsvCell[] {
  return [
    c.name,
    c.domain,
    c.status,
    c.csm?.name ?? "",
    c.implementationOwner?.name ?? "",
    c.arr,
    c.currency,
    c.previousArr,
    c.renewalDate ? c.renewalDate.slice(0, 10) : "",
    c.startedAt ? c.startedAt.slice(0, 10) : "",
    // Churned accounts have no meaningful live score — leave blank rather
    // than exporting a stale number that looks current in a spreadsheet.
    c.status === "churned" ? "" : c.health.score,
    c.status === "churned" ? "Churned" : c.health.tier,
    c.country,
    c.industry,
    c.segment,
    c.employees,
    channelOf(c),
    accountTierOf(c),
    completeness === "red" ? "Incomplete" : completeness === "yellow" ? "Partial" : "Complete",
  ];
}
