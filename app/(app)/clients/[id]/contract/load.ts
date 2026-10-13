import "server-only";

/* What the contract tab needs for one account. Shared by the full page
   (./page.tsx) and the client profile, which shows the same tab in place of
   the Contracts & deals card.

   Returns null when the tab can't be shown — the contract tables are missing,
   or the read fails. Callers then fall back (the full page says so; the client
   profile keeps the old card), so a problem here never takes the profile down. */

import { eq } from "drizzle-orm";
import { getChurnTaxonomy } from "@/lib/data";
import { getDb, schema } from "@/lib/db/client";
import { contractTablesExist, getContractRecordsDb, getStatusOverrideDb } from "@/lib/contracts/repo";
import { toView } from "@/lib/contracts/view";
import type { ContractTabProps } from "./ContractTab";

type Loaded = Omit<ContractTabProps, "canEdit" | "superAdmin" | "embedded">;

export async function loadContractTab(
  client: { id: string; name: string; status: string; arr: number },
  showExpansion: boolean,
): Promise<Loaded | null> {
  try {
    if (!(await contractTablesExist())) return null;
    const [records, override, opportunities, taxonomy] = await Promise.all([
      getContractRecordsDb(client.id),
      getStatusOverrideDb(client.id),
      // Opportunities are passed only to roles that may see Expansion.
      showExpansion ? getDb().select().from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.clientId, client.id)) : Promise.resolve([]),
      getChurnTaxonomy(),
    ]);
    return {
      client: { id: client.id, name: client.name.trim(), status: client.status, arr: client.arr },
      records: records.map((r) => toView(r, process.env.HUBSPOT_PORTAL_ID)),
      opportunities: opportunities.map((o) => ({
        id: o.id, name: o.name, stage: o.stage, outcome: o.outcome, expectedArr: o.expectedArr, finalArr: o.finalArr,
        product: o.product, arrRecorded: o.arrRecorded,
      })),
      churnReasons: taxonomy.flatMap((c) => c.reasons.map((r) => ({ id: r.id, label: r.label, category: c.label }))),
      override,
      showExpansion,
      today: new Date().toISOString().slice(0, 10),
    };
  } catch (e) {
    console.error("[contracts] could not load the contract tab for", client.id, e);
    return null;
  }
}
