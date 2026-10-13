import { notFound } from "next/navigation";
import { canEditClient, getCurrentUserRole, isSuperAdmin } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { getClientById } from "@/lib/data";
import { canSeeExpansion } from "@/lib/expansion/access";
import { ContractTab } from "./ContractTab";
import { loadContractTab } from "./load";

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

  const loaded = await loadContractTab(client, showExpansion);
  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-dashed border-border bg-surface px-5 py-8 font-body text-[13px] leading-relaxed text-fg-muted">
          <b className="text-fg">The contract records can&apos;t be read in this database.</b> If the tables are missing, run <code>drizzle/contract-records.sql</code> in
          the Supabase SQL editor, then the import (<code>scripts/import-contract-records.mts</code>), and reload.
        </div>
      </div>
    );
  }
  return <ContractTab {...loaded} canEdit={canEdit} superAdmin={superAdmin} />;
}
