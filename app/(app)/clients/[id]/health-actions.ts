"use server";

/* Per-client health recalculation — the profile's "Recalculate" button.
   Authorized server-side by the client being visible to the caller (see
   lib/data.ts recalculateClientHealth). */

import { recalculateClientHealth } from "@/lib/data";

export async function recalculateClientHealthAction(clientId: string): Promise<{ ok: boolean }> {
  try {
    await recalculateClientHealth(clientId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
