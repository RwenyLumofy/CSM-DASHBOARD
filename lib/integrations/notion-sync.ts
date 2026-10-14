/* =========================================================================
   Weekly client export to Notion — one direction, Signal → Notion.

   Every client in Signal (churned ones included) becomes one row in a Notion
   database. A row is matched on its Signal ID: found → its synced columns are
   overwritten; not found → a row is created. Nothing is ever deleted or
   archived in Notion, and nothing is read from Notion back into Signal.

   WHICH DATABASE
     1. NOTION_DATABASE_ID, when set.
     2. Otherwise the id remembered in workspace_config from an earlier run.
     3. Otherwise a new database is created under NOTION_PARENT_PAGE_ID and
        its id remembered, so the next run reuses it.
   The remembered id lives in the database the job runs against, so a local
   run against the test database creates its own Notion database rather than
   writing into production's.

   Called by app/api/cron/notion-sync (Sundays, vercel.json) and by the
   super-admin "Sync to Notion now" button in Settings → Integrations
   (notionSyncNowAction).
   ========================================================================= */

import { env, hasDatabase, integrations } from "@/lib/config";
import { NotionClient, parseNotionId } from "@/lib/integrations/notion";
import { CLIENT_DATABASE_PROPERTIES, clientToNotionProperties, signalIdOfPage } from "@/lib/integrations/notion-clients";
import { getClientsFromDb, getWorkspaceConfigFromDb, setWorkspaceConfigDb } from "@/lib/repo/drizzle";

const DATABASE_CONFIG_KEY = "notion_clients_database_id";
const LAST_RUN_CONFIG_KEY = "notion_clients_last_sync";
const DATABASE_TITLE = "Signal clients";
// Two writers stay near Notion's ~3 requests/second; the client retries the
// 429s that still happen.
const WRITERS = 2;
// The cron route is capped at 300s. Stop starting new writes before that so
// the run reports what is left instead of being killed mid-way.
const TIME_BUDGET_MS = 260_000;

export interface NotionSyncResult {
  skipped?: string;
  databaseId?: string;
  databaseCreated?: boolean;
  clients?: number;
  created?: number;
  updated?: number;
  failed?: number;
  /** Clients not reached before the time budget ran out. */
  remaining?: number;
  errors?: string[];
}

/** The last completed run, as recorded in workspace_config. */
export interface NotionLastRun {
  at: string;
  clients: number;
  created: number;
  updated: number;
  failed: number;
  remaining: number;
}

/** What Settings → Integrations shows: the last run, and where the database
 *  is. Both null until the export has run once. */
export async function getNotionSyncStatus(): Promise<{ lastRun: NotionLastRun | null; databaseUrl: string | null }> {
  const [lastRun, remembered] = await Promise.all([
    getWorkspaceConfigFromDb(LAST_RUN_CONFIG_KEY),
    getWorkspaceConfigFromDb(DATABASE_CONFIG_KEY),
  ]);
  const id = parseNotionId(env.notionDatabaseId) ?? (typeof remembered === "string" ? parseNotionId(remembered) : null);
  const run = lastRun as NotionLastRun | null;
  return {
    lastRun: run && typeof run.at === "string" ? run : null,
    databaseUrl: id ? `https://www.notion.so/${id}` : null,
  };
}

async function resolveDatabase(notion: NotionClient): Promise<{ id: string; created: boolean }> {
  if (env.notionDatabaseId) {
    const id = parseNotionId(env.notionDatabaseId);
    if (!id) throw new Error("NOTION_DATABASE_ID is not a Notion id or URL.");
    return { id, created: false };
  }
  const remembered = await getWorkspaceConfigFromDb(DATABASE_CONFIG_KEY);
  if (typeof remembered === "string" && remembered) return { id: remembered, created: false };

  const parent = parseNotionId(env.notionParentPageId);
  if (!parent) throw new Error("NOTION_PARENT_PAGE_ID is not a Notion page id or URL.");
  const id = await notion.createDatabase(parent, DATABASE_TITLE, CLIENT_DATABASE_PROPERTIES);
  await setWorkspaceConfigDb(DATABASE_CONFIG_KEY, id);
  return { id, created: true };
}

export async function syncClientsToNotion(): Promise<NotionSyncResult> {
  if (!hasDatabase()) return { skipped: "No database configured." };
  if (!integrations.notion()) return { skipped: "Notion is not configured (NOTION_TOKEN and NOTION_PARENT_PAGE_ID)." };

  const started = Date.now();
  const notion = new NotionClient();
  const database = await resolveDatabase(notion);

  // Unscoped on purpose: there is no signed-in user on a cron, and the export
  // is the whole book.
  const [clients, pages] = await Promise.all([getClientsFromDb(), notion.queryAllPages(database.id)]);

  const pageBySignalId = new Map<string, string>();
  for (const page of pages) {
    const signalId = signalIdOfPage(page.properties);
    // Two rows with one Signal ID means someone duplicated a row in Notion;
    // keep updating the first and leave the copy alone.
    if (signalId && !pageBySignalId.has(signalId)) pageBySignalId.set(signalId, page.id);
  }

  const syncedAt = new Date().toISOString();
  const result = { created: 0, updated: 0, failed: 0, remaining: 0 };
  const errors: string[] = [];
  let next = 0;

  async function writer() {
    while (next < clients.length) {
      if (Date.now() - started > TIME_BUDGET_MS) return;
      const client = clients[next++];
      const properties = clientToNotionProperties(client, { appUrl: env.appUrl, syncedAt });
      const pageId = pageBySignalId.get(client.id);
      try {
        if (pageId) {
          await notion.updatePage(pageId, properties);
          result.updated++;
        } else {
          await notion.createPage(database.id, properties);
          result.created++;
        }
      } catch (err) {
        // One bad row must not stop the rest of the book.
        result.failed++;
        if (errors.length < 10) errors.push(`${client.name}: ${String(err).slice(0, 300)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: WRITERS }, writer));
  result.remaining = clients.length - next;

  // Remembered so Settings can show when the export last ran, whether the
  // cron or the button started it. A failure to record must not fail a run
  // whose rows are already written.
  const lastRun: NotionLastRun = { at: syncedAt, clients: clients.length, ...result };
  await setWorkspaceConfigDb(LAST_RUN_CONFIG_KEY, lastRun).catch((err) => {
    console.error("[notion-sync] could not record the run:", err);
  });

  return {
    databaseId: database.id,
    databaseCreated: database.created,
    clients: clients.length,
    ...result,
    ...(errors.length ? { errors } : {}),
  };
}
