/* =========================================================================
   Usage data facade — resolves a client to its Lumofy platform environment
   and returns the assembled product-usage snapshot for the Usage tab.

   One company == one environment. The link is the HubSpot company property
   `mixpanel_company_id`, whose value equals the environment's id in Metabase
   (verified 2026-07-02). Each Lumofy environment lives in exactly one of the
   two regional databases (AWS db4 / KSA db5), so resolution also probes which
   one owns the id. The resolution is cached on the client; the assembled
   snapshot is memoized in-process with a short TTL.
   ========================================================================= */

import "server-only";
import { integrations } from "@/lib/config";
import { HubSpotClient } from "@/lib/integrations/hubspot";
import { MetabaseClient } from "@/lib/integrations/metabase";
import { computeAdoptionScore, ownedModulesFromPackage, type OwnedModules } from "@/lib/usage/score";
import { SNAPSHOT_SQL, TREND_SQL, LEARNING_SPLIT_SQL } from "@/lib/usage/queries";
import type { LearningBreakdown, LearningBucket, TrendMap, UsageResult, UsageSnapshot, UsageSnapshotRow, UsageUnavailable } from "@/lib/usage/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_ID: Record<"aws" | "ksa", number> = { aws: 4, ksa: 5 };
const USAGE_ENV_KEY = "__usage_env";

interface ResolvedEnv {
  environmentId: string;
  region: "aws" | "ksa";
  environmentName: string | null;
}

function withEnv(sql: string, envId: string): string {
  return sql.replaceAll(":ENV_ID", `'${envId}'`);
}
function pick(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const lk = key.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lk) return row[k];
  return undefined;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ── environment resolution ──────────────────────────────────────────────

async function resolveEnvironment(clientId: string): Promise<ResolvedEnv | { error: UsageUnavailable }> {
  // Unscoped (not the role-scoped getClientById): the interactive caller
  // (the client profile page) already ran its own canSeeClient check before
  // the Usage tab could even mount, and the 4-hourly cron sync has no signed-in
  // user at all — role-scoping would (and did) reject every client for it.
  const { getClientByIdFromDb } = await import("@/lib/repo/drizzle");
  const client = await getClientByIdFromDb(clientId);
  if (!client) return { error: { status: "error", message: "Client not found." } };

  const cached = (client.properties as Record<string, unknown> | undefined)?.[USAGE_ENV_KEY] as
    | { environmentId?: string; region?: "aws" | "ksa"; environmentName?: string | null }
    | undefined;
  if (cached?.environmentId && cached.region) {
    return { environmentId: cached.environmentId, region: cached.region, environmentName: cached.environmentName ?? null };
  }

  if (!integrations.metabase()) {
    return { error: { status: "not_configured", message: "Metabase isn't connected yet — set METABASE_URL and METABASE_API_KEY." } };
  }

  const hs = new HubSpotClient();
  if (!hs.configured || !client.hubspotId) {
    return { error: { status: "unlinked", message: "No HubSpot company link, so the platform environment can't be resolved." } };
  }
  let envId: string | null = null;
  try {
    envId = await hs.fetchCompanyMixpanelId(client.hubspotId);
  } catch (e) {
    return { error: { status: "error", message: `Couldn't read the Mixpanel Company ID from HubSpot: ${e}` } };
  }
  if (!envId || !UUID_RE.test(envId)) {
    return { error: { status: "unlinked", message: "This account has no Mixpanel Company ID in HubSpot yet, so it isn't linked to a platform environment." } };
  }

  const mb = new MetabaseClient();
  for (const region of ["aws", "ksa"] as const) {
    try {
      const rows = await mb.runNativeQuery(
        DB_ID[region],
        withEnv("SELECT name_en_us FROM public.environments_environment WHERE id = :ENV_ID LIMIT 1", envId),
      );
      if (rows.length > 0) {
        const environmentName = (pick(rows[0], "name_en_us") as string | null) ?? null;
        const resolved: ResolvedEnv = { environmentId: envId, region, environmentName };
        try {
          const { setClientPropertyDb } = await import("@/lib/repo/drizzle");
          await setClientPropertyDb(clientId, USAGE_ENV_KEY, { ...resolved, resolvedAt: new Date().toISOString() });
        } catch {
          /* caching is best-effort */
        }
        return resolved;
      }
    } catch (e) {
      return { error: { status: "error", message: `Metabase probe failed: ${e}` } };
    }
  }
  return { error: { status: "unlinked", message: "The account's Mixpanel Company ID doesn't match any Lumofy environment (AWS or KSA)." } };
}

// ── query execution + assembly ──────────────────────────────────────────

function toSnapshotRow(row: Record<string, unknown>): UsageSnapshotRow {
  const g = (k: string) => num(pick(row, k));
  return {
    wau: g("wau"), mau: g("mau"), total_users: g("total_users"), active_users: g("active_users"),
    seats: g("seats"), used_licenses: g("used_licenses"),
    job_roles: g("job_roles"), job_levels: g("job_levels"), departments: g("departments"),
    divisions: g("divisions"), legal_entities: g("legal_entities"),
    learning_enrollments: g("learning_enrollments"), learning_completions: g("learning_completions"),
    learning_items_count: g("learning_items_count"), pathways_count: g("pathways_count"),
    pathway_enrollments: g("pathway_enrollments"), pathway_completions: g("pathway_completions"),
    pathway_company_enrollments: g("pathway_company_enrollments"), pathway_company_completions: g("pathway_company_completions"),
    pathway_lumofy_enrollments: g("pathway_lumofy_enrollments"), pathway_lumofy_completions: g("pathway_lumofy_completions"),
    quizzes_generated: g("quizzes_generated"), quiz_enrollments: g("quiz_enrollments"), quiz_completions: g("quiz_completions"),
    sessions_created: g("sessions_created"),
    enps_cycles: g("enps_cycles"), enps_responses: g("enps_responses"), survey_cycles: g("survey_cycles"), survey_responses: g("survey_responses"),
    talent_assessment_enrollments: g("talent_assessment_enrollments"), talent_assessment_completed: g("talent_assessment_completed"),
    ai_assessment_enrollments: g("ai_assessment_enrollments"), ai_assessment_completed: g("ai_assessment_completed"),
    pm_cycles_configured: g("pm_cycles_configured"), pm_cycles_completed: g("pm_cycles_completed"),
    competencies_total: g("competencies_total"), competencies_ai_generated: g("competencies_ai_generated"),
    ai_generation_runs: g("ai_generation_runs"),
  };
}

function toTrendMap(rows: Record<string, unknown>[]): TrendMap {
  const out: TrendMap = {};
  for (const r of rows) {
    const metric = String(pick(r, "metric") ?? "");
    if (!metric) continue;
    const month = String(pick(r, "month") ?? "").slice(0, 7); // YYYY-MM
    if (!month) continue;
    (out[metric] ??= []).push({ month, value: num(pick(r, "value")) });
  }
  return out;
}

const PROVIDER_LABELS: Record<string, string> = { GO1: "Go1", COURSERA: "Coursera", EDX: "edX" };

/** Assemble the company/Lumofy/global learning split + provider mix from the
 *  long-format LEARNING_SPLIT_SQL rows. */
function toLearningBreakdown(rows: Record<string, unknown>[]): LearningBreakdown {
  const empty = (): LearningBucket => ({ enrollments: 0, completions: 0, items: 0 });
  const out: LearningBreakdown = { company: empty(), lumofy: empty(), global: empty(), providers: [] };
  for (const r of rows) {
    const kind = String(pick(r, "kind") ?? "");
    const label = String(pick(r, "label") ?? "");
    const enrollments = num(pick(r, "enrollments"));
    const completions = num(pick(r, "completions"));
    const items = num(pick(r, "items"));
    if (kind === "category" && (label === "company" || label === "lumofy" || label === "global")) {
      out[label] = { enrollments, completions, items };
    } else if (kind === "provider" && label) {
      out.providers.push({ provider: PROVIDER_LABELS[label] ?? label, enrollments, completions, items });
    }
  }
  out.providers.sort((a, b) => b.enrollments - a.enrollments);
  return out;
}

// ── caching: a short in-process memo (dedupes bursts within one warm
// instance) layered over a durable Postgres cache (survives cold starts /
// separate serverless invocations, and is what the 4-hourly cron keeps warm
// — see lib/usage/sync.ts). A DB row older than DB_FRESH_MS is treated as
// stale and triggers a live refresh, same as if nothing were cached. ────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const DB_FRESH_MS = 5 * 60 * 60 * 1000; // 5h — one cron cycle (4h) + slack
const cache = new Map<string, { at: number; data: UsageSnapshot }>();

/** Live Metabase fetch + assembly for an already-resolved environment.
 *  Persists the result (or, on failure, the error) to Postgres so the next
 *  read—by this client or the cron—doesn't need another live round trip. */
async function fetchAndPersist(clientId: string, resolved: ResolvedEnv, owned: OwnedModules): Promise<UsageResult> {
  const mb = new MetabaseClient();
  try {
    const [snapRows, trendRows, learnRows] = await Promise.all([
      mb.runNativeQuery(DB_ID[resolved.region], withEnv(SNAPSHOT_SQL, resolved.environmentId)),
      mb.runNativeQuery(DB_ID[resolved.region], withEnv(TREND_SQL, resolved.environmentId)),
      mb.runNativeQuery(DB_ID[resolved.region], withEnv(LEARNING_SPLIT_SQL, resolved.environmentId)),
    ]);
    const metrics = toSnapshotRow(snapRows[0] ?? {});
    const data: UsageSnapshot = {
      status: "ok",
      environmentId: resolved.environmentId,
      environmentName: resolved.environmentName,
      region: resolved.region,
      fetchedAt: new Date().toISOString(),
      metrics,
      trends: toTrendMap(trendRows),
      learning: toLearningBreakdown(learnRows),
      score: computeAdoptionScore(metrics, owned),
    };
    cache.set(resolved.environmentId, { at: Date.now(), data });
    try {
      const { upsertClientUsageSnapshot } = await import("@/lib/repo/drizzle");
      await upsertClientUsageSnapshot(clientId, data);
    } catch {
      /* persistence is best-effort — the live result below is still correct */
    }
    return data;
  } catch (e) {
    const message = `Usage query failed: ${e}`;
    try {
      const { recordClientUsageSyncError } = await import("@/lib/repo/drizzle");
      await recordClientUsageSyncError(clientId, message);
    } catch {
      /* best-effort */
    }
    return { status: "error", message };
  }
}

/** The Usage-tab payload for a client. Never throws — returns a typed
 *  unavailable state instead so the UI can explain what's missing.
 *  Read order: in-process memo → persisted Postgres snapshot (if fresh) →
 *  live Metabase fetch. Pass `forceRefresh` (the tab's manual Refresh button)
 *  to skip both caches and pull live data immediately. */
export async function getClientUsage(clientId: string, opts?: { forceRefresh?: boolean }): Promise<UsageResult> {
  const resolved = await resolveEnvironment(clientId);
  if ("error" in resolved) return resolved.error;
  const owned = await resolveOwnedModules(clientId);

  // The expensive Metabase-sourced payload (metrics/trends/learning) is cached;
  // the score is CHEAP and depends on the current Module property, so it's
  // always recomputed here — a CSM's Module edit reflects on the next load
  // without waiting for the 4-hourly re-sync.
  const withFreshScore = (snap: UsageSnapshot): UsageSnapshot => ({ ...snap, score: computeAdoptionScore(snap.metrics, owned) });

  if (!opts?.forceRefresh) {
    const hit = cache.get(resolved.environmentId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return withFreshScore(hit.data);

    try {
      const { getClientUsageSnapshotFromDb } = await import("@/lib/repo/drizzle");
      const persisted = await getClientUsageSnapshotFromDb(clientId);
      if (persisted && Date.now() - new Date(persisted.fetchedAt).getTime() < DB_FRESH_MS) {
        cache.set(resolved.environmentId, { at: Date.now(), data: persisted });
        return withFreshScore(persisted);
      }
    } catch {
      /* DB read failed — fall through to a live fetch */
    }
  }

  return fetchAndPersist(clientId, resolved, owned);
}

/** The 3 modules a company owns — drives the score's Module-adoption signal.
 *  Source of truth = the "Module" (Package) field on the client's tracked
 *  DEALS, with the CSM's in-app override applied (override wins over the
 *  HubSpot-synced value — "app over HubSpot"). Falls back to the account-level
 *  `package` property, then to "owns all 3", when no deal carries modules.
 *  Read fresh each call (never cached) so a Module edit reflects immediately. */
async function resolveOwnedModules(clientId: string): Promise<OwnedModules> {
  try {
    const { getClientByIdFromDb, getDealsByClient } = await import("@/lib/repo/drizzle");
    const { dealOverridesMap, applyDealOverrides } = await import("@/lib/deal-overrides");
    const [client, deals] = await Promise.all([getClientByIdFromDb(clientId), getDealsByClient(clientId)]);
    const overrides = dealOverridesMap(client?.properties as Record<string, unknown> | undefined);
    const modules = new Set<string>();
    for (const d of deals) {
      if (d.tracked === false) continue;
      const eff = applyDealOverrides(d, overrides[d.id]);
      for (const p of eff.products ?? []) modules.add(p);
    }
    if (modules.size > 0) return ownedModulesFromPackage([...modules]);
    // No deal-level modules → fall back to the account "package" property.
    return ownedModulesFromPackage((client?.properties as Record<string, unknown> | undefined)?.package);
  } catch {
    return ownedModulesFromPackage(undefined); // fall back to "owns all 3"
  }
}

export type UsageSyncOutcome =
  | { outcome: "synced" }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; reason: string };

/** Force-refresh one client's usage from Metabase and persist it — used by
 *  the 4-hourly cron (lib/usage/sync.ts). Unlike getClientUsage, this always
 *  hits Metabase live; "skipped" (not "failed") covers accounts with nothing
 *  to sync yet (no HubSpot link / no Mixpanel id), which is expected, not an
 *  error. */
export async function syncOneClientUsage(clientId: string): Promise<UsageSyncOutcome> {
  const resolved = await resolveEnvironment(clientId);
  if ("error" in resolved) {
    return resolved.error.status === "error"
      ? { outcome: "failed", reason: resolved.error.message }
      : { outcome: "skipped", reason: resolved.error.message };
  }
  const result = await fetchAndPersist(clientId, resolved, await resolveOwnedModules(clientId));
  return result.status === "ok" ? { outcome: "synced" } : { outcome: "failed", reason: result.message };
}
