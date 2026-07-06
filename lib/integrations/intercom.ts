/* =========================================================================
   Intercom integration — support signals per client.
   Pulls companies, conversations (open/snoozed/closed + first-response time),
   and conversation ratings (CSAT). NPS is not native to Intercom; if you run
   NPS via Intercom Surveys, point INTERCOM at that export during live wiring.
   Auth: an Access Token (INTERCOM_ACCESS_TOKEN). Read-only scopes.
   ========================================================================= */

import { env } from "@/lib/config";
import type { SupportSummary } from "@/lib/types";

const REGION_BASE: Record<"us" | "eu" | "au", string> = {
  us: "https://api.intercom.io",
  eu: "https://api.eu.intercom.io",
  au: "https://api.au.intercom.io",
};

export interface IntercomCompany {
  id: string; // Intercom internal id
  companyId: string | null; // external company_id (often the CRM id)
  name: string;
  domain: string | null;
  userCount: number | null;
}

export interface IntercomConversation {
  id: string;
  state: "open" | "closed" | "snoozed";
  rating: number | null; // 1–5 CSAT rating
  firstResponseSeconds: number | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  contactIds: string[];
}

/**
 * Retry a single page fetch up to 3x on a network error/timeout or a 5xx —
 * NOT on a 4xx (auth/bad-request), which retrying won't fix. A full export
 * (companies/contacts/conversations) runs dozens of sequential page
 * requests; even a healthy connection has a real chance that ONE of many
 * pages is transiently slow, and without this a single flaky page discarded
 * the entire, otherwise-successful multi-page fetch (confirmed live,
 * 2026-07-06: two consecutive sync runs against a real, larger workspace
 * both failed with the exact same "aborted due to timeout" on one page).
 * 20s per attempt (was 15s, no retry) — still well under this route's
 * overall maxDuration.
 */
async function fetchRetrying(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    const last = i === attempts - 1;
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.ok || last || (res.status >= 400 && res.status < 500)) return res;
    } catch (e) {
      if (last) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error("unreachable");
}

export class IntercomClient {
  private token: string;
  private base: string;

  constructor(token: string = env.intercomToken, region: "us" | "eu" | "au" = env.intercomRegion) {
    this.token = token;
    this.base = REGION_BASE[region] ?? REGION_BASE.us;
  }

  get configured(): boolean {
    return this.token.length > 0;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.11",
    };
  }

  /** Companies via the scroll API (stable for full exports). */
  async listCompanies(): Promise<IntercomCompany[]> {
    const out: IntercomCompany[] = [];
    let scroll: string | undefined;
    // The scroll endpoint returns up to 60 records per call until empty.
    for (let i = 0; i < 1000; i++) {
      const url = `${this.base}/companies/scroll${scroll ? `?scroll_param=${scroll}` : ""}`;
      const res = await fetchRetrying(url, { headers: this.headers(), cache: "no-store" });
      if (!res.ok) throw new Error(`Intercom companies/scroll: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        data?: { id: string; company_id?: string; name?: string; website?: string; user_count?: number }[];
        scroll_param?: string;
      };
      const rows = data.data ?? [];
      if (rows.length === 0) break;
      for (const c of rows) {
        out.push({
          id: c.id,
          companyId: c.company_id ?? null,
          name: c.name ?? "(unnamed)",
          domain: c.website ? c.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null,
          userCount: c.user_count ?? null,
        });
      }
      scroll = data.scroll_param;
      if (!scroll) break;
    }
    return out;
  }

  /**
   * Map each contact id → the Intercom company ids it belongs to.
   * Used to attribute conversations (which carry contacts, not companies)
   * back to an account.
   */
  async fetchContactCompanyIndex(): Promise<Map<string, string[]>> {
    const index = new Map<string, string[]>();
    let startingAfter: string | undefined;
    for (let i = 0; i < 1000; i++) {
      const url = `${this.base}/contacts?per_page=150${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
      const res = await fetchRetrying(url, { headers: this.headers(), cache: "no-store" });
      if (!res.ok) throw new Error(`Intercom contacts: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        data?: { id: string; companies?: { data?: { id: string }[] } }[];
        pages?: { next?: { starting_after?: string } };
      };
      for (const c of data.data ?? []) {
        const companyIds = (c.companies?.data ?? []).map((x) => x.id);
        if (companyIds.length) index.set(c.id, companyIds);
      }
      startingAfter = data.pages?.next?.starting_after;
      if (!startingAfter) break;
    }
    return index;
  }

  /**
   * Conversations updated within the window, PLUS every currently-open
   * conversation regardless of age, normalized.
   *
   * Applying the recency window to `open` conversations too was a real bug:
   * a ticket a customer opened and that then sat completely untouched for
   * longer than the window never advances its `updated_at`, so it silently
   * dropped out of both the open-ticket count and `oldestOpenDays` — the
   * exact stale-ticket case that metric exists to catch, made invisible by
   * the very filter meant to keep the fetch small. Open tickets are fetched
   * unconditionally now (their own current state is what matters, not how
   * recently they were touched); the recency window still limits closed/
   * snoozed history, which is what actually needs bounding for volume.
   */
  async searchConversations(opts: { updatedSinceDays?: number } = {}): Promise<IntercomConversation[]> {
    const sinceSec = opts.updatedSinceDays
      ? Math.floor((Date.now() - opts.updatedSinceDays * 86_400_000) / 1000)
      : undefined;

    const out: IntercomConversation[] = [];
    let startingAfter: string | undefined;

    for (let i = 0; i < 1000; i++) {
      const query = sinceSec
        ? {
            operator: "OR",
            value: [
              { field: "state", operator: "=", value: "open" },
              { field: "updated_at", operator: ">", value: sinceSec },
            ],
          }
        : { field: "updated_at", operator: ">", value: 0 };

      const body = {
        query,
        pagination: { per_page: 150, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      };
      const res = await fetchRetrying(`${this.base}/conversations/search`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Intercom conversations/search: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        conversations?: IntercomRawConversation[];
        pages?: { next?: { starting_after?: string } };
      };
      for (const c of data.conversations ?? []) out.push(normalizeConversation(c));
      startingAfter = data.pages?.next?.starting_after;
      if (!startingAfter) break;
    }
    return out;
  }
}

interface IntercomRawConversation {
  id: string;
  state?: string;
  created_at?: number;
  updated_at?: number;
  conversation_rating?: { rating?: number } | null;
  statistics?: { time_to_first_response?: number } | null;
  contacts?: { contacts?: { id: string }[] } | null;
}

function normalizeConversation(c: IntercomRawConversation): IntercomConversation {
  const state = c.state === "closed" || c.state === "snoozed" ? c.state : "open";
  return {
    id: c.id,
    state,
    rating: c.conversation_rating?.rating ?? null,
    firstResponseSeconds: c.statistics?.time_to_first_response ?? null,
    createdAt: new Date((c.created_at ?? 0) * 1000).toISOString(),
    updatedAt: new Date((c.updated_at ?? 0) * 1000).toISOString(),
    contactIds: (c.contacts?.contacts ?? []).map((x) => x.id),
  };
}

/**
 * Build a SupportSummary from a set of conversations already attributed to a
 * single account. Maps Intercom 1–5 ratings to a satisfied-percentage CSAT.
 * NPS is passed through if computed elsewhere (Surveys export).
 */
export function summarizeSupport(
  conversations: IntercomConversation[],
  opts: { nps?: number | null; npsResponses?: number } = {},
): SupportSummary {
  const now = Date.now();
  let open = 0;
  let snoozed = 0;
  let closed30 = 0;
  let oldestOpenDays: number | null = null;
  const firstResponses: number[] = [];
  const ratings: number[] = [];
  let lastConversationAt: string | null = null;

  for (const c of conversations) {
    if (c.state === "open") {
      open += 1;
      const age = Math.floor((now - new Date(c.createdAt).getTime()) / 86_400_000);
      oldestOpenDays = oldestOpenDays == null ? age : Math.max(oldestOpenDays, age);
    } else if (c.state === "snoozed") {
      snoozed += 1;
    } else if (c.state === "closed") {
      if (now - new Date(c.updatedAt).getTime() <= 30 * 86_400_000) closed30 += 1;
    }
    if (c.firstResponseSeconds != null) firstResponses.push(c.firstResponseSeconds);
    if (c.rating != null) ratings.push(c.rating);
    if (!lastConversationAt || c.updatedAt > lastConversationAt) lastConversationAt = c.updatedAt;
  }

  // CSAT: % of ratings that are 4 or 5 (satisfied).
  const satisfied = ratings.filter((r) => r >= 4).length;
  const csat = ratings.length ? Math.round((satisfied / ratings.length) * 100) : null;

  return {
    openTickets: open,
    snoozedTickets: snoozed,
    closedLast30d: closed30,
    oldestOpenDays,
    medianFirstResponseHours: firstResponses.length ? round1(median(firstResponses) / 3600) : null,
    csat,
    csatScale: "percent",
    csatResponses: ratings.length,
    nps: opts.nps ?? null,
    npsResponses: opts.npsResponses ?? 0,
    lastConversationAt,
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
