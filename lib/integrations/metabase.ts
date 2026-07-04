/* =========================================================================
   Metabase integration — product usage metrics per client.
   Runs a saved question (METABASE_USAGE_CARD_ID) that returns one row per
   account with usage columns, or an ad-hoc SQL query. Read-only.
   Auth: an API key (METABASE_API_KEY) preferred, or username/password session.
   ========================================================================= */

import { env } from "@/lib/config";
import type { UsageMetrics } from "@/lib/types";

export interface UsageRow {
  /** Join key back to the client — domain or HubSpot id, per your card. */
  key: string;
  metrics: Partial<UsageMetrics> & { seats: number; activeUsers: number };
}

export class MetabaseClient {
  private url: string;
  private apiKey: string;
  private username: string;
  private password: string;
  private sessionToken: string | null = null;

  constructor(
    url: string = env.metabaseUrl,
    apiKey: string = env.metabaseApiKey,
    username: string = env.metabaseUsername,
    password: string = env.metabasePassword,
  ) {
    this.url = url.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.username = username;
    this.password = password;
  }

  get configured(): boolean {
    return this.url.length > 0 && (this.apiKey.length > 0 || this.username.length > 0);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.apiKey) return { "x-api-key": this.apiKey };
    if (!this.sessionToken) {
      const res = await fetch(`${this.url}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.username, password: this.password }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Metabase session failed: ${res.status}`);
      this.sessionToken = ((await res.json()) as { id: string }).id;
    }
    return { "X-Metabase-Session": this.sessionToken };
  }

  /** Run a saved question and return its rows as objects. */
  async runCard(cardId: string | number): Promise<Record<string, unknown>[]> {
    const headers = { ...(await this.authHeaders()), "Content-Type": "application/json" };
    const res = await fetch(`${this.url}/api/card/${cardId}/query/json`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Metabase card ${cardId} query failed: ${res.status} ${await res.text()}`);
    // /query/json returns an array of row objects keyed by column display name.
    return (await res.json()) as Record<string, unknown>[];
  }

  /**
   * Run ad-hoc native SQL against a database and return rows as objects keyed
   * by column alias. Uses POST /api/dataset (JSON body) — the canonical query
   * endpoint. The /dataset/{json,csv} export variants instead expect the query
   * form-urlencoded, so they are NOT used here.
   */
  async runNativeQuery(databaseId: number, sql: string): Promise<Record<string, unknown>[]> {
    const headers = { ...(await this.authHeaders()), "Content-Type": "application/json" };
    const res = await fetch(`${this.url}/api/dataset`, {
      method: "POST",
      headers,
      body: JSON.stringify({ database: databaseId, type: "native", native: { query: sql } }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Metabase native query failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      status?: string;
      error?: string;
      data?: { rows?: unknown[][]; cols?: { name?: string }[] };
    };
    if (json.status === "failed" || json.error) {
      throw new Error(`Metabase query error: ${json.error ?? "failed"}`);
    }
    const cols = (json.data?.cols ?? []).map((c, i) => c.name ?? `col_${i}`);
    const rows = json.data?.rows ?? [];
    return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  }

  /** Fetch the configured usage card and map rows to UsageRow. */
  async fetchUsageRows(): Promise<UsageRow[]> {
    if (!env.metabaseUsageCardId) throw new Error("METABASE_USAGE_CARD_ID is not set");
    const rows = await this.runCard(env.metabaseUsageCardId);
    return rows.map(mapUsageRow).filter((r): r is UsageRow => r !== null);
  }
}

/** Flexible column mapping — tolerant of common naming variants per portal. */
function mapUsageRow(row: Record<string, unknown>): UsageRow | null {
  const get = (...names: string[]): unknown => {
    for (const n of names) {
      for (const k of Object.keys(row)) {
        if (k.toLowerCase().replace(/[\s_]/g, "") === n.toLowerCase().replace(/[\s_]/g, "")) return row[k];
      }
    }
    return undefined;
  };

  const key = str(get("key", "domain", "company_domain", "account", "hubspot_id", "company_id"));
  if (!key) return null;

  const seats = numOr(get("seats", "licenses", "total_seats"), 0);
  const activeUsers = numOr(get("active_users", "active", "mau", "monthly_active_users"), 0);
  const wau = numOr(get("wau", "weekly_active_users"), 0);
  const mau = numOr(get("mau", "monthly_active_users", "active_users"), activeUsers);
  const lastActiveRaw = get("last_active", "last_active_at", "last_seen");

  return {
    key,
    metrics: {
      seats,
      activeUsers,
      wau,
      mau,
      adoptionRate: seats > 0 ? activeUsers / seats : 0,
      stickiness: mau > 0 ? wau / mau : 0,
      lastActiveAt: lastActiveRaw ? new Date(String(lastActiveRaw)).toISOString() : null,
    },
  };
}

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}
function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
