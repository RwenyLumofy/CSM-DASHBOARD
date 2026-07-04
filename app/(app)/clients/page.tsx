import { ClientsTable } from "@/components/clients/ClientsTable";
import { getClients, getCsms, getImplementationOwners, getPropertyDefinitions } from "@/lib/data";
import { isSuperAdmin } from "@/lib/auth";
import { getAllDealsFromDb } from "@/lib/repo/drizzle";
import { dealOverridesMap, applyDealOverrides, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { computeProfileCompleteness, type ProfileCompleteness } from "@/lib/profile-completeness";
import type { Deal } from "@/lib/types";

export const metadata = { title: "Clients · Lumofy CS" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [clients, csms, impls, propertyDefs, params, superAdmin, allDeals] = await Promise.all([
    getClients(),
    getCsms(),
    getImplementationOwners(),
    getPropertyDefinitions(),
    searchParams,
    isSuperAdmin(),
    getAllDealsFromDb(),
  ]);

  // Group already-scoped clients' deals only — getAllDealsFromDb is unscoped,
  // but we only ever look up ids present in `clients` (already role-filtered).
  const dealsByClient = new Map<string, Deal[]>();
  for (const d of allDeals) {
    const arr = dealsByClient.get(d.clientId);
    if (arr) arr.push(d);
    else dealsByClient.set(d.clientId, [d]);
  }
  const completenessByClient = new Map<string, ProfileCompleteness>();
  for (const c of clients) {
    const overrides = dealOverridesMap(c.properties);
    const dealDates = ((c.properties?.[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {});
    const tracked = (dealsByClient.get(c.id) ?? [])
      .filter((d) => d.tracked !== false)
      .map((d) => applyDealOverrides(d, overrides[d.id]));
    completenessByClient.set(c.id, computeProfileCompleteness(c, tracked, dealDates));
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <ClientsTable
        clients={clients}
        csms={csms}
        impls={impls}
        propertyDefs={propertyDefs}
        initialQuery={params.q ?? ""}
        showActions
        canAssignOwners={superAdmin}
        completenessByClient={Object.fromEntries(completenessByClient)}
      />
    </div>
  );
}
