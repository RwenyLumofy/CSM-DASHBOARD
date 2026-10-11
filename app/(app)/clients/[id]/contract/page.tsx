import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { isSuperAdmin } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getChurnTaxonomy } from "@/lib/data";
import { getDb, schema } from "@/lib/db/client";
import { getClientByIdFromDb } from "@/lib/repo/drizzle";
import { contractTablesExist, getContractRecordsDb } from "@/lib/contracts/repo";
import { toView } from "@/lib/contracts/view";
import { ContractTab } from "./ContractTab";

/* The contract tab — phase 2 of the contract rework
   (docs/specs/revenue/contract-records-specification.md).

   PREVIEW: super admins only, and a 404 for everyone else, so the page does not
   announce itself. The gate here decides what renders; ./actions.ts enforces the
   same rule again on every write. The tab reads contract_records; the rest of
   Signal still reads deals, so `status` and `arr` passed below are the account's
   live values, shown beside what the records give. */

export const metadata = { title: "Contract · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase() || !(await isSuperAdmin())) notFound();
  const { id } = await params;
  const client = await getClientByIdFromDb(id);
  if (!client) notFound();

  if (!(await contractTablesExist())) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-dashed border-border bg-surface px-5 py-8 font-body text-[13px] leading-relaxed text-fg-muted">
          <b className="text-fg">The contract tables don&apos;t exist in this database yet.</b> Run <code>drizzle/contract-records.sql</code> in
          the Supabase SQL editor, then the import (<code>scripts/import-contract-records.mts</code>), and reload.
        </div>
      </div>
    );
  }

  const [records, opportunities, taxonomy] = await Promise.all([
    getContractRecordsDb(id),
    getDb().select().from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.clientId, id)),
    getChurnTaxonomy(),
  ]);

  return (
    <ContractTab
      client={{ id: client.id, name: client.name.trim(), status: client.status, arr: client.arr }}
      records={records.map((r) => toView(r, process.env.HUBSPOT_PORTAL_ID))}
      opportunities={opportunities.map((o) => ({
        id: o.id, name: o.name, stage: o.stage, outcome: o.outcome, expectedArr: o.expectedArr, finalArr: o.finalArr,
        product: o.product, arrRecorded: o.arrRecorded,
      }))}
      churnReasons={taxonomy.flatMap((c) => c.reasons.map((r) => ({ id: r.id, label: r.label, category: c.label })))}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
