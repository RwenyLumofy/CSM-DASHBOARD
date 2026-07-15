/* =========================================================================
   Churned-account import — a ONE-TIME backfill, run by hand (POST
   /api/churn-import). It is deliberately SEPARATE from the recurring HubSpot
   sync, which is left completely untouched: that sync still pulls only
   Customer + ARR companies with Closed Won deals. This importer pulls the
   companies HubSpot marks as **Churn** (customer_type ~ "arr") and lands them
   in the app as churned clients so their loss shows up in GRR/NRR/ARR.

   Per company (see the design confirmed with the team):
   • Client row is marked churned via the SAME mechanism the app's "Mark as
     churned" button uses — properties.__status_override = "churned" — so its
     status is stable across recomputes and reversible in-app.
   • The HubSpot "entered Churn" date is stored on the CSM-editable `churnedAt`
     column, pinned in __field_overrides so no sync ever nulls it.
   • All of the company's deals (Closed Won + CS Renewed/Expanded/Confirmed-
     Churned/Downgraded) are attached tracked=false — historical records that
     never feed the active-ARR (tracked-deal) sum.
   • The pre-churn ARR is recorded as a +baseline `new_business` ledger event
     dated before the churn and an equal −`churn` event dated at the churn date.
     recomputeClient nets the client to arr=0; computeRetention sees the churn
     in the period it happened. Churn amount = Closed Won → else CS Renewed →
     else CS Confirmed Churned (see fetchChurnedAcquisition).

   Idempotent: deterministic ids everywhere, so re-running changes nothing.
   ========================================================================= */

import { HubSpotClient } from "@/lib/integrations/hubspot";
import type { HubspotCompany } from "@/lib/integrations/hubspot";
import { persistChurnedImport } from "@/lib/repo/drizzle";
import type { ArrEvent, Client, Deal } from "@/lib/types";
import { STATUS_OVERRIDE_KEY } from "@/lib/status";
import { emptyHealth, emptySupport, emptyUsage } from "@/lib/import/clients";

export interface ChurnImportResult {
  companies: number;
  clients: number;
  deals: number;
  withBaseline: number;
  zeroBaseline: number;
  warnings: string[];
}

/** YYYY-MM-DD shifted by `years` (used to keep the baseline event strictly
 *  before the churn when a deal close date is missing/after the churn). */
function shiftYears(ymd: string, years: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function segmentOf(employees: number | null): Client["segment"] {
  if (employees != null && employees >= 250) return "enterprise";
  if (employees != null && employees >= 50) return "mid_market";
  return "smb";
}

function buildChurnedClient(co: HubspotCompany): Client {
  const portal = process.env.HUBSPOT_PORTAL_ID ?? "";
  return {
    id: co.id,
    hubspotId: co.id,
    source: "hubspot",
    name: co.name,
    domain: co.domain,
    country: co.country,
    industry: co.industry,
    employees: co.employees,
    customerType: "arr",
    // Cosmetic seed — recomputeClient re-derives status from the
    // __status_override below (computeClientStatus returns "churned" for it).
    status: "churned",
    csm: null,
    csmSource: null,
    implementationOwner: null,
    implementationOwnerSource: null,
    currency: "USD",
    arr: 0,
    previousArr: 0,
    startedAt: co.startedAt,
    renewalDate: null,
    // Deliberately NOT auto-filled from HubSpot's "date entered Churn" property
    // (hs_v2_date_entered_978708591, still used below only to date the ARR
    // ledger's churn event) — that property isn't a trustworthy per-account
    // churn date (large batches share the same bulk-edit date). churnedAt is a
    // manual, CSM-entered field only; the account-level date and the ledger's
    // GRR/NRR-period date are intentionally decoupled.
    churnedAt: null,
    segment: segmentOf(co.employees),
    logoUrl: null,
    hubspotUrl: co.id ? `https://app.hubspot.com/contacts/${portal}/record/0-2/${co.id}` : undefined,
    health: emptyHealth(),
    support: emptySupport(),
    usage: emptyUsage(),
    tags: [],
    // __status_override → churned (survives every recompute).
    properties: {
      [STATUS_OVERRIDE_KEY]: "churned",
    },
  };
}

export async function importChurnedClients(): Promise<ChurnImportResult> {
  const hs = new HubSpotClient();
  if (!hs.configured) throw new Error("HUBSPOT_ACCESS_TOKEN is required to import churned clients.");

  const { companies, warnings } = await hs.fetchChurnedAcquisition();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const clients: Client[] = [];
  const deals: Deal[] = [];
  const events: ArrEvent[] = [];
  let zeroBaseline = 0;

  for (const cc of companies) {
    // effectiveChurnDate dates the ARR ledger's churn event only (drives which
    // GRR/NRR period reflects this churn) — deliberately decoupled from the
    // client.churnedAt display field above, which is CSM-entered only.
    const effectiveChurnDate = cc.churnDate ?? today;
    clients.push(buildChurnedClient(cc.company));
    deals.push(...cc.deals);

    if (cc.baseline > 0) {
      // Baseline must fall in an earlier period than the churn, else the churn
      // quarter shows neither the starting logo nor its loss (ledger semantics).
      let baselineDate = cc.baselineDate;
      if (!baselineDate || baselineDate >= effectiveChurnDate) baselineDate = shiftYears(effectiveChurnDate, -1);

      events.push({
        id: `churn-baseline-${cc.company.id}`,
        clientId: cc.company.id,
        type: "new_business",
        amount: cc.baseline,
        arr: 0,
        effectiveDate: baselineDate,
        renewalDate: null,
        source: "import",
        externalId: null,
        note: "Churned account — historical ARR baseline (backfill)",
        createdBy: "Churn import",
        createdAt: now,
      });
      events.push({
        id: `churn-${cc.company.id}`,
        clientId: cc.company.id,
        type: "churn",
        amount: -cc.baseline,
        arr: 0,
        effectiveDate: effectiveChurnDate,
        renewalDate: null,
        source: "import",
        externalId: null,
        note: "Churned in HubSpot (imported)",
        createdBy: "Churn import",
        createdAt: now,
      });
    } else {
      zeroBaseline++;
    }
  }

  await persistChurnedImport({ clients, deals, events });

  return {
    companies: companies.length,
    clients: clients.length,
    deals: deals.length,
    withBaseline: companies.length - zeroBaseline,
    zeroBaseline,
    warnings,
  };
}
