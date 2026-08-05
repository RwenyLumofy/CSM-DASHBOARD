/* =============================================================================
   Health data — the DB-fetching wrapper around the pure scoring service. Gathers
   an account's real usage snapshot, support summary, sentiment, contacts and its
   stored CS Pulse, then scores it on the current model. Resilient: returns null
   rather than throwing so a health surface never breaks a page.
   ============================================================================= */

import { normalizeStakeholderProfiles, PROFILES_KEY } from "@/lib/stakeholders/profile";
import { hasDatabase } from "@/lib/config";
import { dbHealthy } from "@/lib/db/health";
import { withDbTimeout } from "@/lib/db/client";
import { getClientById, getContactsForClient } from "@/lib/data";
import { scoreAccount } from "./service";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS, normalizeCsPulseDimensions, normalizeCsPulseTiers, normalizeStoredHealth, type PulseDimension, type RatingTier, type StoredHealth } from "./pulse";
import type { AccountHealthResult } from "./model";

/** The admin-configured CS Pulse dimensions (Settings), or the built-in
 *  defaults. Resilient — never throws. */
export async function getCsPulseDimensions(): Promise<PulseDimension[]> {
  if (!hasDatabase() || !dbHealthy()) return CS_PULSE_DIMENSIONS;
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    const stored = await withDbTimeout(getWorkspaceConfigFromDb("cs_pulse_dimensions"));
    return stored ? normalizeCsPulseDimensions(stored) : CS_PULSE_DIMENSIONS;
  } catch {
    return CS_PULSE_DIMENSIONS;
  }
}

/** The admin-configured CS Pulse rating tiers (Settings), or the defaults. */
export async function getCsPulseTiers(): Promise<RatingTier[]> {
  if (!hasDatabase() || !dbHealthy()) return CS_PULSE_TIERS;
  try {
    const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
    const stored = await withDbTimeout(getWorkspaceConfigFromDb("cs_pulse_tiers"));
    return stored ? normalizeCsPulseTiers(stored) : CS_PULSE_TIERS;
  } catch {
    return CS_PULSE_TIERS;
  }
}

/** Normalise a support CSAT figure to a 0–100 percentage. */
function csatPercent(csat: number | null | undefined, scale: string | undefined): number | null {
  if (csat == null) return null;
  return scale === "five" ? (csat / 5) * 100 : csat;
}

/** Score a single account live on the current model. Null when there's no DB or
 *  the account isn't found. */
export async function getAccountHealth(clientId: string): Promise<AccountHealthResult | null> {
  if (!hasDatabase() || !dbHealthy()) return null;
  try {
    const client = await getClientById(clientId);
    if (!client) return null;

    const { getClientUsageSnapshotFromDb } = await import("@/lib/repo/drizzle");
    const [snap, contacts, dimensions, tiers] = await Promise.all([
      withDbTimeout(getClientUsageSnapshotFromDb(clientId)).catch(() => null),
      getContactsForClient(clientId).catch(() => [] as Awaited<ReturnType<typeof getContactsForClient>>),
      getCsPulseDimensions(),
      getCsPulseTiers(),
    ]);

    const support = client.support ?? null;
    const props = (client.properties ?? {}) as Record<string, unknown>;
    const prior = normalizeStoredHealth(props.cs_health); // baseline for momentum

    return scoreAccount(
      {
        clientId,
        status: client.status,
        renewalDate: client.renewalDate ? new Date(client.renewalDate).toISOString() : null,
        usage: (snap?.metrics as Record<string, number> | undefined) ?? null,
        support: support
          ? { csat: csatPercent(support.csat, support.csatScale), csatResponses: support.csatResponses, nps: support.nps }
          : null,
        sentimentNps: support?.nps ?? null,
        primaryContactCount: contacts.filter((c) => c.isPrimary).length,
        stakeholders: normalizeStakeholderProfiles(props[PROFILES_KEY]),
        pulseRaw: props.cs_pulse ?? null,
        previousScore: prior?.score ?? null,
        previousCalculationDate: prior?.computedAt ?? null,
      },
      dimensions,
      tiers,
    );
  } catch (err) {
    console.warn("[health] getAccountHealth failed:", err);
    return null;
  }
}

/** Persist the last computed health to client.properties.cs_health, so the
 *  list/dashboard read cheaply and the next score has a momentum baseline. */
export async function persistAccountHealth(clientId: string, result: AccountHealthResult): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
    const stored: StoredHealth = {
      score: result.calculatedScore,
      band: result.calculatedBand,
      status: result.appliedStatus,
      computedAt: result.calculationTimestamp,
    };
    await setClientPropertyDb(clientId, "cs_health", stored);
  } catch (err) {
    console.warn("[health] persistAccountHealth failed:", err);
  }
}
