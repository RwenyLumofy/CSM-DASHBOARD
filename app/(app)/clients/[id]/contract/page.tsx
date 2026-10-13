import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { canEditClient, getCurrentUserRole, isSuperAdmin } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getChurnTaxonomy, getClientById } from "@/lib/data";
import { canSeeExpansion } from "@/lib/expansion/access";
import { getDb, schema } from "@/lib/db/client";
import { contractTablesExist, getContractRecordsDb, getStatusOverrideDb } from "@/lib/contracts/repo";
import { toView } from "@/lib/contracts/view";
import { ContractTab } from "./ContractTab";

/* The contract tab — phase 2 of the contract rework
   (docs/specs/revenue/contract-records-specification.md).

   PREVIEW, open to everyone who can see the account (opened up 2026-10-13; it was
   super admins only before). Visibility is the account's own: `getClientById` is
   scoped, so an account the user can't see is a 404. Editing needs `canEditClient`
   (the account's CSM, admins, super admins); everyone else gets the same screen
   read-only. That flag only decides what renders: ./actions.ts enforces
   `denyClientWrite` again on every write. Expansion opportunities are passed only
   to roles that may see Expansion.

   The tab reads contract_records; the rest of Signal still reads deals, so
   `status` and `arr` passed below are the account's live values, shown beside
   what the records give. */

export const metadata = { title: "Contract · Lumofy Signals" };
export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) notFound();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();
  const [canEdit, role, superAdmin] = await Promise.all([canEditClient(client), getCurrentUserRole(), isSuperAdmin()]);
  const showExpansion = canSeeExpansion(role);

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

  const [records, override, opportunities, taxonomy] = await Promise.all([
    getContractRecordsDb(id),
    getStatusOverrideDb(id),
    showExpansion ? getDb().select().from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.clientId, id)) : Promise.resolve([]),
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
      override={override}
      canEdit={canEdit}
      showExpansion={showExpansion}
      superAdmin={superAdmin}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
