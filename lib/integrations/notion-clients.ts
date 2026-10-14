/* =========================================================================
   The shape of a client in the Notion "Signal clients" database — which
   columns exist and how a Signal client fills them. Pure: no network, no
   database, so the mapping is testable on its own (notion-clients.test.ts).

   The sync owns exactly the columns in CLIENT_DATABASE_PROPERTIES and
   overwrites them on every run. Any other column someone adds in Notion is
   never sent, so it is never touched.

   Rows are matched on "Signal ID", not the name, so renaming a client in
   Signal renames its row instead of creating a second one.
   ========================================================================= */

import type { Client } from "@/lib/types";

export const SIGNAL_ID_PROPERTY = "Signal ID";

/** Column definitions used when the database is first created. */
export const CLIENT_DATABASE_PROPERTIES: Record<string, unknown> = {
  Name: { title: {} },
  [SIGNAL_ID_PROPERTY]: { rich_text: {} },
  Status: { select: {} },
  Segment: { select: {} },
  CSM: { rich_text: {} },
  "Implementation owner": { rich_text: {} },
  ARR: { number: { format: "number_with_commas" } },
  Currency: { select: {} },
  "Health score": { number: { format: "number" } },
  "Health status": { select: {} },
  "Start date": { date: {} },
  "Renewal date": { date: {} },
  Domain: { rich_text: {} },
  Country: { select: {} },
  Industry: { select: {} },
  Tags: { multi_select: {} },
  "Open in Signal": { url: {} },
  "Last synced": { date: {} },
};

const STATUS_LABEL: Record<Client["status"], string> = {
  onboarding: "Onboarding",
  active: "Active",
  renewal: "Renewal",
  churned: "Churned",
};

const SEGMENT_LABEL: Record<Client["segment"], string> = {
  enterprise: "Enterprise",
  mid_market: "Mid-market",
  smb: "SMB",
};

// Notion rejects a rich-text run over 2000 characters.
function richText(value: string | null | undefined) {
  const content = (value ?? "").slice(0, 2000);
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
}

// A select option name cannot contain a comma and is capped at 100 characters.
function optionName(value: string): string {
  return value.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function select(value: string | null | undefined) {
  const name = optionName(value ?? "");
  return { select: name ? { name } : null };
}

/** The calendar date of a timestamp, read in UTC so the row shows the same
 *  day whichever timezone the job runs in. */
function date(iso: string | null | undefined) {
  const day = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 10) : null;
  return { date: day ? { start: day } : null };
}

/** `appUrl` is the public base URL of Signal; without it the link column is
 *  left empty rather than pointing at localhost. */
export function clientToNotionProperties(client: Client, opts: { appUrl: string; syncedAt: string }): Record<string, unknown> {
  const base = opts.appUrl.replace(/\/+$/, "");
  const tags = [...new Set((client.tags ?? []).map(optionName).filter(Boolean))];
  // The type says health is always present; a row that has never been scored
  // can still come back from the database without it.
  const health = client.health as Client["health"] | null | undefined;
  return {
    Name: { title: [{ type: "text", text: { content: client.name.slice(0, 2000) } }] },
    [SIGNAL_ID_PROPERTY]: richText(client.id),
    Status: select(STATUS_LABEL[client.status] ?? client.status),
    Segment: select(SEGMENT_LABEL[client.segment] ?? client.segment),
    CSM: richText(client.csm?.name),
    "Implementation owner": richText(client.implementationOwner?.name),
    ARR: { number: Number.isFinite(client.arr) ? client.arr : null },
    Currency: select(client.currency),
    "Health score": { number: health && Number.isFinite(health.score) ? Math.round(health.score) : null },
    "Health status": select(health?.tier),
    "Start date": date(client.startedAt),
    "Renewal date": date(client.renewalDate),
    Domain: richText(client.domain),
    Country: select(client.country),
    Industry: select(client.industry),
    Tags: { multi_select: tags.map((name) => ({ name })) },
    "Open in Signal": { url: base ? `${base}/clients/${encodeURIComponent(client.id)}` : null },
    "Last synced": date(opts.syncedAt),
  };
}

/** The Signal ID stored on a row read back from Notion, or null when the row
 *  was added by hand and has none. */
export function signalIdOfPage(properties: Record<string, unknown>): string | null {
  const prop = properties[SIGNAL_ID_PROPERTY] as { rich_text?: { plain_text?: string }[] } | undefined;
  const text = (prop?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
  return text || null;
}
