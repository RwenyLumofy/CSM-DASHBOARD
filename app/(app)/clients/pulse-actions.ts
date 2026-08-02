"use server";

/* =========================================================================
   CS Pulse write — the CSM's monthly (or event-driven) read on an account.
   Stored on the client's protected `properties.cs_pulse` JSONB (migration-free,
   survives the HubSpot sync). Recording a pulse is an ACCOUNT WRITE and gates
   on denyClientWrite like every sibling action in clients/[id]/. It used to
   check only that you were signed in, so a read-only guest could rewrite the
   pulse — and force a health recompute — on any account they could not see,
   by passing its id directly.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail, denyClientWrite } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { normalizePulse, isPulseComplete, type StoredPulse } from "@/lib/health/pulse";
import { getCsPulseDimensions, getCsPulseTiers } from "@/lib/health/data";

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
  const denied = await denyClientWrite(clientId);
  if (denied) return { ok: false, error: denied };

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
    const { setClientPropertyDb, recomputeClientHealth } = await import("@/lib/repo/drizzle");
    await setClientPropertyDb(clientId, "cs_pulse", pulse);
    /* Recompute THE health score — the one on the header pill and the clients
       list — now that CS Pulse is a weighted metric inside it. Without this a
       Pulse would not move health until the 09:00 cron, so a CSM would record
       their read of an account and watch the number ignore them all day.
       Previously this recomputed the separate model-v1 score instead, which was
       shown only behind the Pulse button. */
    await recomputeClientHealth(clientId);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    revalidatePath("/reports/pulse");
    revalidatePath("/today");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
