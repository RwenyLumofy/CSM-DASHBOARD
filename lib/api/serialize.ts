/* =========================================================================
   Public shapes for the /api/v1 API. Pure.

   The API returns these, never the internal `Client` / row types, so that an
   internal refactor can't silently change what other tools receive. Adding a
   field is fine; renaming or removing one is a breaking change and needs /v2.

   Deliberately left out: contact people (PII), free-text notes, `properties`
   (an open bag of internal keys, some of them app state like __deal_overrides)
   and support/usage detail. Each can be added on purpose when a tool needs it.
   ========================================================================= */

import type { Client, Csm } from "@/lib/types";

export interface ApiPerson {
  name: string;
  email: string | null;
}

export interface ApiAccount {
  id: string;
  name: string;
  domain: string | null;
  hubspot_id: string | null;
  hubspot_url: string | null;
  status: Client["status"];
  segment: Client["segment"];
  customer_type: Client["customerType"];
  country: string | null;
  industry: string | null;
  employees: number | null;
  csm: ApiPerson | null;
  implementation_owner: ApiPerson | null;
  arr: number;
  currency: string;
  started_at: string | null;
  renewal_date: string | null;
  days_to_renewal: number | null;
  churned_at: string | null;
  health: {
    score: number;
    tier: string;
    trend: number;
    capped_by: string[];
    updated_at: string | null;
  };
  tags: string[];
}

/** Calendar dates go out as YYYY-MM-DD, whatever the column stores. */
export function dateOnly(v: string | null | undefined): string | null {
  return v ? v.slice(0, 10) : null;
}

function person(p: Csm | null): ApiPerson | null {
  return p ? { name: p.name, email: p.email ?? null } : null;
}

/** Whole days from `today` (YYYY-MM-DD, UTC) to `date`. Negative when past. */
export function daysBetween(today: string, date: string | null): number | null {
  if (!date) return null;
  const a = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function toApiAccount(c: Client, today: string): ApiAccount {
  return {
    id: c.id,
    name: c.name,
    domain: c.domain,
    hubspot_id: c.hubspotId,
    hubspot_url: c.hubspotUrl ?? null,
    status: c.status,
    segment: c.segment,
    customer_type: c.customerType,
    country: c.country,
    industry: c.industry,
    employees: c.employees,
    csm: person(c.csm),
    implementation_owner: person(c.implementationOwner),
    arr: c.arr,
    currency: c.currency,
    started_at: dateOnly(c.startedAt),
    renewal_date: dateOnly(c.renewalDate),
    days_to_renewal: daysBetween(today, c.renewalDate),
    churned_at: dateOnly(c.churnedAt),
    health: {
      score: c.health?.score ?? 0,
      tier: c.health?.tier ?? "",
      trend: c.health?.trend ?? 0,
      capped_by: c.health?.cappedBy ?? [],
      updated_at: c.health?.updatedAt || null,
    },
    tags: c.tags ?? [],
  };
}

/* ------------------------------------------------------------- filtering */

export interface AccountFilter {
  status?: string[];
  segment?: string[];
  csmEmail?: string;
  healthTier?: string;
  /** Renewal date between today and today + N days (inclusive). */
  renewingWithinDays?: number;
  q?: string;
}

/** Applies the query-string filters. Pure, so the route and tests share it. */
export function filterAccounts(accounts: ApiAccount[], f: AccountFilter): ApiAccount[] {
  const q = f.q?.trim().toLowerCase();
  const csm = f.csmEmail?.trim().toLowerCase();
  const tier = f.healthTier?.trim().toLowerCase();
  return accounts.filter((a) => {
    if (f.status?.length && !f.status.includes(a.status)) return false;
    if (f.segment?.length && !f.segment.includes(a.segment)) return false;
    if (csm && (a.csm?.email ?? "").toLowerCase() !== csm) return false;
    if (tier && a.health.tier.toLowerCase() !== tier) return false;
    if (f.renewingWithinDays != null) {
      if (a.status === "churned" || a.days_to_renewal == null) return false;
      if (a.days_to_renewal < 0 || a.days_to_renewal > f.renewingWithinDays) return false;
    }
    if (q && !a.name.toLowerCase().includes(q) && !(a.domain ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ------------------------------------------------------------ pagination */

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Offset pagination. Signal's tables are small (hundreds of accounts), so
 *  every list is read whole and sliced — consistent and simple for callers. */
export function paginate<T>(items: T[], limit: number, offset: number) {
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length < items.length ? offset + page.length : null;
  return { data: page, meta: { total: items.length, limit, offset, next_offset: nextOffset } };
}

/** Parses ?limit / ?offset, or returns an error message. */
export function parsePaging(params: URLSearchParams): { limit: number; offset: number } | string {
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  const limit = rawLimit == null ? DEFAULT_LIMIT : Number(rawLimit);
  const offset = rawOffset == null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return `limit must be an integer from 1 to ${MAX_LIMIT}.`;
  if (!Number.isInteger(offset) || offset < 0) return "offset must be a non-negative integer.";
  return { limit, offset };
}

/** A comma-separated list param, validated against `allowed`. */
export function parseList(params: URLSearchParams, name: string, allowed: readonly string[]): string[] | string | undefined {
  const raw = params.get(name);
  if (raw == null || raw.trim() === "") return undefined;
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const bad = values.filter((v) => !allowed.includes(v));
  if (bad.length) return `${name} must be one or more of: ${allowed.join(", ")}. Got: ${bad.join(", ")}.`;
  return values;
}
