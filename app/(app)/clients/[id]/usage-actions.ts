"use server";

/* Loads the product-usage snapshot for a client's Usage tab. getClientUsage
   itself reads through the UNSCOPED getClientByIdFromDb (see lib/usage/index.ts)
   because it's also called from the no-signed-in-user cron sync path — so this
   action, not the page, is the enforcement point for interactive callers. A
   Next.js server action is independently POST-able once defined, regardless of
   which page renders the component that normally calls it, so relying on "the
   page already checked" isn't a real guard. */

import { getClientUsage, getClientUsageForPeriod } from "@/lib/usage";
import { getClientById } from "@/lib/data";
import { canSeeClient } from "@/lib/auth";
import type { UsagePeriodResult, UsageResult } from "@/lib/usage/types";

export async function loadClientUsageAction(clientId: string, opts?: { forceRefresh?: boolean }): Promise<UsageResult> {
  const client = await getClientById(clientId);
  if (!(await canSeeClient(client))) {
    return { status: "error", message: "Not authorized for this client." };
  }
  return getClientUsage(clientId, opts);
}

/** The timeline filter's data — a live period-bounded snapshot (never cached
 *  server-side beyond the short in-process memo; see getClientUsageForPeriod). */
export async function loadClientUsagePeriodAction(
  clientId: string,
  range: { start: string; end: string; label: string },
): Promise<UsagePeriodResult> {
  const client = await getClientById(clientId);
  if (!(await canSeeClient(client))) {
    return { status: "error", message: "Not authorized for this client." };
  }
  return getClientUsageForPeriod(clientId, range);
}
