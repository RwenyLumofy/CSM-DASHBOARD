"use server";

/* Loads the product-usage snapshot for a client's Usage tab. getClientUsage
   itself reads through the UNSCOPED getClientByIdFromDb (see lib/usage/index.ts)
   because it's also called from the no-signed-in-user cron sync path — so this
   action, not the page, is the enforcement point for interactive callers. A
   Next.js server action is independently POST-able once defined, regardless of
   which page renders the component that normally calls it, so relying on "the
   page already checked" isn't a real guard. */

import { getClientUsage } from "@/lib/usage";
import { getClientById } from "@/lib/data";
import { canSeeClient } from "@/lib/auth";
import type { UsageResult } from "@/lib/usage/types";

export async function loadClientUsageAction(clientId: string, opts?: { forceRefresh?: boolean }): Promise<UsageResult> {
  const client = await getClientById(clientId);
  if (!(await canSeeClient(client))) {
    return { status: "error", message: "Not authorized for this client." };
  }
  return getClientUsage(clientId, opts);
}
