"use server";

/* The switch: whether Signal reads each account's ARR, status and renewal date
   from its contract records (on) or from HubSpot deals (off, the default).

   Super admins only — enforced here, not by the page. Flipping it either way
   re-materializes every account, so the numbers everywhere follow at once, and
   it can be flipped back: the deals are untouched, so "off" restores exactly
   what Signal showed before. Who flipped it last, and when, is kept beside it. */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail, isSuperAdmin } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { contractTablesExist } from "@/lib/contracts/repo";
import { getClientsFromDb, recomputeClient, setContractRecordsLiveDb, setWorkspaceConfigDb } from "@/lib/repo/drizzle";

export interface SwitchResult { ok: boolean; error?: string; recomputed?: number; failed?: number }

// A "use server" file may only export async functions, so this stays local (the page reads the same key).
const CONTRACT_RECORDS_LIVE_LOG_KEY = "contract_records_live_log";

export async function setContractRecordsLiveAction(on: boolean): Promise<SwitchResult> {
  if (!hasDatabase()) return { ok: false, error: "The database isn't configured." };
  if (!(await isSuperAdmin())) return { ok: false, error: "Only a super admin can switch Signal to contract records." };
  if (on && !(await contractTablesExist())) return { ok: false, error: "The contract tables don't exist in this database yet." };
  try {
    await setContractRecordsLiveDb(on);
    await setWorkspaceConfigDb(CONTRACT_RECORDS_LIVE_LOG_KEY, { on, by: await getCurrentUserEmail(), at: new Date().toISOString() });
    const clients = await getClientsFromDb();
    let failed = 0;
    // A few at a time: each recompute is several queries, and the pool is small.
    for (let i = 0; i < clients.length; i += 5) {
      await Promise.all(clients.slice(i, i + 5).map((c) => recomputeClient(c.id).catch(() => { failed++; })));
    }
    revalidatePath("/", "layout");
    return { ok: true, recomputed: clients.length - failed, failed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
