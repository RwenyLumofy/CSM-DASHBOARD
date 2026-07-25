"use server";

/* =========================================================================
   CS Pulse write — the CSM's monthly (or event-driven) read on an account.
   Stored on the client's protected `properties.cs_pulse` JSONB (migration-free,
   survives the HubSpot sync). Any signed-in user who can reach the account may
   record its pulse; the account re-scores from it on the next read.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { normalizePulse, isPulseComplete, type StoredPulse } from "@/lib/health/pulse";
import { getCsPulseDimensions, getCsPulseTiers, getAccountHealth, persistAccountHealth } from "@/lib/health/data";

export interface PulseResult {
  ok: boolean;
  error?: string;
}

export async function setClientPulseAction(clientId: string, input: {
  ratings: Partial<Record<string, string>>;
  signals: StoredPulse["signals"];
}): Promise<PulseResult> {
  const email = await getCurrentUserEmail();
  if (!email) return { ok: false, error: "Sign in required to record a pulse." };
  if (!hasDatabase()) return { ok: false, error: "No database configured." };
  if (!clientId) return { ok: false, error: "Missing account." };

  // Validate against the configured dimensions AND tier keys; stamp the author
  // and time server-side so freshness can't be spoofed.
  const [dimensions, tiers] = await Promise.all([getCsPulseDimensions(), getCsPulseTiers()]);
  const validTiers = new Set(tiers.map((t) => t.key));
  const pulse: StoredPulse = normalizePulse({
    ratings: Object.fromEntries(
      dimensions
        .map((d) => [d.id, input.ratings?.[d.id]])
        .filter(([, v]) => typeof v === "string" && validTiers.has(v as string)),
    ),
    signals: input.signals ?? {},
    updatedAt: new Date().toISOString(),
    updatedByEmail: email,
  })!;

  if (!isPulseComplete(pulse, dimensions)) {
    return { ok: false, error: `Rate all ${dimensions.length} dimensions (${dimensions.map((d) => d.name).join(", ")}).` };
  }

  try {
    const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
    await setClientPropertyDb(clientId, "cs_pulse", pulse);
    // Recompute the score with the new pulse and persist it, so momentum has a
    // baseline and the list/dashboard read cheaply.
    const result = await getAccountHealth(clientId);
    if (result) await persistAccountHealth(clientId, result);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    revalidatePath("/pulse");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
