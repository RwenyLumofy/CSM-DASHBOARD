/* =========================================================================
   Notion integration — the one place Signal WRITES to an outside system.
   Every other integration here is read-only; this one pushes the client list
   out to a Notion database (lib/integrations/notion-sync.ts) and reads back
   only its own rows, to match them by Signal ID.

   Auth: an internal-integration token (NOTION_TOKEN). The integration sees
   nothing until a page is shared with it in Notion, so its reach is whatever
   the workspace owner connected it to.

   Pinned to API version 2022-06-28, where a database is addressed directly
   by its id. Later versions split a database into "data sources"; moving up
   means changing the parent and query calls below.

   Modeled on GeminiClient / IntercomClient — a `configured` getter, an env-
   defaulted constructor, fetch with AbortSignal.timeout and a throw-on-!ok
   error string.
   ========================================================================= */

import { env } from "@/lib/config";

const API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

/** Notion ids are 32 hex characters, usually shown at the end of a page URL
 *  with or without dashes. Accepts either a bare id or a pasted URL. */
export function parseNotionId(input: string): string | null {
  const path = input.trim().split(/[?#]/)[0];
  // A page title ending in a hex letter ("…Database-<id>") runs into the id
  // once dashes are gone, so take the last 32 characters of the run.
  const runs = path.replace(/-/g, "").match(/[0-9a-f]{32,}/gi);
  return runs ? runs[runs.length - 1].slice(-32).toLowerCase() : null;
}

export class NotionClient {
  private token: string;

  constructor(token: string = env.notionToken) {
    this.token = token;
  }

  get configured(): boolean {
    return this.token.length > 0;
  }

  /** One request, retried on a rate limit (429, honouring Retry-After), a 5xx
   *  or a network error. Notion allows about three requests a second per
   *  integration, so a full client list will hit 429 in normal running. */
  private async request<T>(method: string, path: string, body?: unknown, attempts = 5): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      const last = i === attempts - 1;
      let res: Response;
      try {
        res = await fetch(`${API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (e) {
        if (last) throw e;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || last) throw new Error(`Notion ${method} ${path} failed: ${res.status} ${await res.text()}`);
      const retryAfter = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, retryAfter > 0 ? retryAfter * 1000 : 500 * (i + 1)));
    }
    throw new Error("unreachable");
  }

  /** Create a database as a child of `parentPageId`. Returns its id. */
  async createDatabase(parentPageId: string, title: string, properties: Record<string, unknown>): Promise<string> {
    const res = await this.request<{ id: string }>("POST", "/databases", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: title } }],
      properties,
    });
    return res.id;
  }

  /** Every row of a database, following pagination. Rows in Notion's trash
   *  are not returned. */
  async queryAllPages(databaseId: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        "POST",
        `/databases/${databaseId}/query`,
        { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      );
      pages.push(...res.results);
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  async createPage(databaseId: string, properties: Record<string, unknown>): Promise<void> {
    await this.request("POST", "/pages", { parent: { database_id: databaseId }, properties });
  }

  /** Sets only the properties passed; any other column on the row is left as
   *  it is. */
  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<void> {
    await this.request("PATCH", `/pages/${pageId}`, { properties });
  }
}
