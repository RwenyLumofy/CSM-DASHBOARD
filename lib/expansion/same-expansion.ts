/* When does a HubSpot CS-pipeline expansion deal count as the same expansion as
   a Won opportunity? When it is ticked (already counted in ARR) and closed within
   60 days of the Won date. Used by lib/expansion/ledger-sync.ts to refuse adding
   the opportunity's ARR a second time. Pure, so it is tested on its own. */

export const SAME_EXPANSION_WINDOW_DAYS = 60;

export interface HubspotExpansionDeal {
  name: string | null;
  amount: number;
  closeDate: Date | null;
  tracked: boolean;
}

export function findSameHubspotExpansion<T extends HubspotExpansionDeal>(deals: T[], wonOn: string): T | undefined {
  const wonMs = Date.parse(`${wonOn}T00:00:00Z`);
  return deals.find((d) => d.tracked && d.closeDate
    && Math.abs(d.closeDate.getTime() - wonMs) <= SAME_EXPANSION_WINDOW_DAYS * 86_400_000);
}
