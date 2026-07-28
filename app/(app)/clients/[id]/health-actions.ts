"use server";

/* Per-client health recalculation — the profile's "Recalculate" button.
   Recalculation rewrites the stored score, so it's a write and gates like one.
   recalculateClientHealth authorizes on VISIBILITY alone, which admitted the
   read-only `guest` tier. */

import { recalculateClientHealth } from "@/lib/data";
import { denyClientWrite } from "@/lib/auth";

export async function recalculateClientHealthAction(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };
  try {
    await recalculateClientHealth(clientId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
