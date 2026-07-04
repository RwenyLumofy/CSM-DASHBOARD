"use server";

/* Loads the product-usage snapshot for a client's Usage tab. getClientUsage
   goes through getClientById, which enforces the same role-scoping as the rest
   of the profile, so this action is safe to call from the client. */

import { getClientUsage } from "@/lib/usage";
import type { UsageResult } from "@/lib/usage/types";

export async function loadClientUsageAction(clientId: string, opts?: { forceRefresh?: boolean }): Promise<UsageResult> {
  return getClientUsage(clientId, opts);
}
