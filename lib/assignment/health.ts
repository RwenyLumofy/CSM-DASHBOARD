/* =========================================================================
   Team health — per-member load rollup for the Team Health indicator.
   Server-only (reads clients + deals). Tells the super-admin who is at/over
   capacity so they know when to hire or rebalance.
   ========================================================================= */

import type { Deal } from "@/lib/types";
import type { Role, Team } from "@/lib/roles";
import { dealOverridesMap, applyDealOverrides } from "@/lib/deal-overrides";
import { getTeamMembers } from "@/lib/data";
import { getCapacityConfig } from "@/lib/assignment/config";
import { clientImplementationLevel, normalizeLevel } from "@/lib/assignment/engine";
import { withDbTimeout } from "@/lib/db/client";

export interface MemberHealth {
  email: string;
  name: string;
  role: Role;
  team: Team;
  clientCount: number;
  totalArr: number;
  whiteGlove: number;
  byImplementationLevel: Record<string, number>;
  bySupportLevel: Record<string, number>;
  capacity: number | null; // max clients for this role
  maxWhiteGlove: number;
  overCapacity: boolean;
  healthy: boolean;
}

/** Latest tracked deal's support level — the client's single support level. */
function clientSupportLevel(deals: Deal[]): string | null {
  const tracked = deals.filter((d) => d.tracked !== false && d.supportLevel);
  tracked.sort((a, b) => (b.closeDate ?? "").localeCompare(a.closeDate ?? ""));
  return tracked[0]?.supportLevel ?? null;
}

export async function getTeamHealth(): Promise<MemberHealth[]> {
  const { hasDatabase } = await import("@/lib/config");
  if (!hasDatabase()) return [];
  const { getClientsFromDb, getAllDealsFromDb } = await import("@/lib/repo/drizzle");

  const [clients, deals, members, capacity] = await Promise.all([
    withDbTimeout(getClientsFromDb()),
    withDbTimeout(getAllDealsFromDb()),
    getTeamMembers(),
    getCapacityConfig(),
  ]);

  // Apply each client's own __deal_overrides before grouping — otherwise a
  // CSM's inline edit to implementation/support level would be invisible to
  // the capacity rollup below, even though the deal card shows the edit.
  const overridesByClientId = new Map(clients.map((c) => [c.id, dealOverridesMap(c.properties)]));
  const dealsByClient = new Map<string, Deal[]>();
  for (const d of deals) {
    const effective = applyDealOverrides(d, overridesByClientId.get(d.clientId)?.[d.id]);
    const arr = dealsByClient.get(d.clientId);
    if (arr) arr.push(effective);
    else dealsByClient.set(d.clientId, [effective]);
  }

  const base = new Map<string, MemberHealth>();
  for (const m of members) {
    base.set(m.email, {
      email: m.email,
      name: m.name ?? m.email,
      role: m.role,
      team: m.team,
      clientCount: 0,
      totalArr: 0,
      whiteGlove: 0,
      byImplementationLevel: {},
      bySupportLevel: {},
      capacity: capacity.maxClientsByRole[m.role] ?? null,
      maxWhiteGlove: capacity.maxWhiteGlove,
      overCapacity: false,
      healthy: true,
    });
  }

  for (const c of clients) {
    if (c.status === "churned") continue;
    const cdeals = dealsByClient.get(c.id) ?? [];
    const implLevel = clientImplementationLevel(cdeals);
    const suppLevel = clientSupportLevel(cdeals);

    // Count under the CSM owner (CSM team) and the implementation owner (impl team).
    const csmEmail = c.csm?.email?.toLowerCase();
    if (csmEmail && base.has(csmEmail) && base.get(csmEmail)!.team === "csm") {
      const h = base.get(csmEmail)!;
      h.clientCount++;
      h.totalArr += c.arr ?? 0;
      const k = implLevel ?? "Unspecified";
      h.byImplementationLevel[k] = (h.byImplementationLevel[k] ?? 0) + 1;
      const s = suppLevel ?? "Unspecified";
      h.bySupportLevel[s] = (h.bySupportLevel[s] ?? 0) + 1;
      if (normalizeLevel(implLevel) === "white glove") h.whiteGlove++;
    }

    const implEmail = c.implementationOwner?.email?.toLowerCase();
    if (implEmail && base.has(implEmail) && base.get(implEmail)!.team === "implementation") {
      const h = base.get(implEmail)!;
      h.clientCount++;
      h.totalArr += c.arr ?? 0;
      const k = implLevel ?? "Unspecified";
      h.byImplementationLevel[k] = (h.byImplementationLevel[k] ?? 0) + 1;
      const s = suppLevel ?? "Unspecified";
      h.bySupportLevel[s] = (h.bySupportLevel[s] ?? 0) + 1;
      if (normalizeLevel(implLevel) === "white glove") h.whiteGlove++;
    }
  }

  const out = [...base.values()];
  for (const h of out) {
    const overClients = h.capacity != null && h.clientCount > h.capacity;
    const overWg = h.team === "implementation" && h.whiteGlove > h.maxWhiteGlove;
    h.overCapacity = overClients || overWg;
    h.healthy = !h.overCapacity;
  }
  // Stable order: team, then role seniority-ish, then name.
  return out.sort((a, b) => a.team.localeCompare(b.team) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}
