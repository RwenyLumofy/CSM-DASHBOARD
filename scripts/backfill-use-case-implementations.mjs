#!/usr/bin/env node
/* =========================================================================
   Backfill the new per-account use-case records from what was already known.

   WHY. The Use Case Universe reads adoption from
   clients.properties.use_case_implementations — the records the client profile
   writes. That key is new, so on day one almost every use case reads "No
   clients yet" even though the workspace has known for months which accounts
   bought which use case. Two older stores already hold that:

     client_deals.use_cases                     what Sales recorded on the deal
     clients.properties.account_use_cases.ids   what CS confirmed in the old picker

   Both carry raw HubSpot text or slugified variants of it, so every value is
   resolved through the SAME alias table the old picker uses (lib/use-cases.ts
   ALIASES) before it is trusted, then checked against the live taxonomy. A
   value that does not resolve is reported, never guessed at.

   WHAT IT WRITES. One implementation per (account, use case), status
   "exploring", with a note naming where it came from. Deliberately conservative:
   a backfilled record says "this account is associated with this use case", not
   "it is live" — nobody has confirmed delivery, and overstating it would put
   fiction into a directory people are meant to trust.

   SAFE TO RE-RUN. Existing records are never touched: an account that already
   has a record for a use case is skipped, so a CSM's own objective/scope/status
   can never be overwritten by a re-run.

   Dry run by default. Pass --yes to write.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const APPLY = process.argv.includes("--yes");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
if (!url) { console.error("No DATABASE_URL in .env.local"); process.exit(1); }

/* The alias table is TypeScript and this is plain Node, so it is read out of
   the source rather than imported — the same approach
   scripts/restore-orphaned-use-cases.mjs already takes. Parsing it keeps ONE
   definition of the mapping: edit lib/use-cases.ts and this follows. */
const src = readFileSync(new URL("../lib/use-cases.ts", import.meta.url), "utf8");
const aliasBlock = src.match(/const ALIASES: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
if (!aliasBlock) { console.error("Could not read ALIASES from lib/use-cases.ts"); process.exit(1); }
const ALIASES = Object.fromEntries(
  [...aliasBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);

/* Some stored values are the HubSpot label already slugified by an earlier
   import ("product_knowledge" for "Product Knowledge"). Un-slugifying and
   retrying the alias table recovers those without a second hand-written map. */
function resolve(raw) {
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];
  const unslugged = key.replace(/_/g, " ");
  if (ALIASES[unslugged]) return ALIASES[unslugged];
  return key; // may be a canonical id already — checked against the taxonomy below
}

const sql = postgres(url, { prepare: false, max: 1 });

const [{ value: taxonomy }] = await sql`
  select value from workspace_config where key = 'use_case_taxonomy'`;
const live = new Set(
  Object.keys(taxonomy?.added ?? {}).filter((id) => !taxonomy?.retired?.[id]),
);
console.log(`Live use cases in the taxonomy: ${live.size}\n`);

const clients = await sql`select id, name, properties from clients`;

/* EVERY deal, tracked or not. `tracked = false` means the deal is dead and
   excluded from ARR — it does NOT mean the client is gone. Filtering on it
   dropped two live accounts (one active, one in renewal, ~$84k between them)
   whose use-case declarations happen to sit on a dead deal, and with them the
   only evidence for two use cases, which then read "No clients yet". What the
   client said they wanted is still the best record of what they wanted; the
   commercial state of the deal it was recorded against is a separate question,
   and the account's own status is on screen next to it either way. */
const deals = await sql`select client_id, use_cases from client_deals`;

const dealsByClient = new Map();
for (const d of deals) {
  if (!d.use_cases?.length) continue;
  if (!dealsByClient.has(d.client_id)) dealsByClient.set(d.client_id, new Set());
  for (const v of d.use_cases) dealsByClient.get(d.client_id).add(v);
}

const unresolved = new Map();
const planned = [];
let alreadyLinked = 0;

for (const c of clients) {
  const existing = c.properties?.use_case_implementations ?? [];
  const have = new Set(
    (Array.isArray(existing) ? existing : Object.values(existing))
      .map((i) => i?.useCaseId).filter(Boolean),
  );

  /* Deal first, then the account picker — so when both name the same use case
     the note records the CS confirmation, which is the stronger signal. */
  const sources = new Map();
  for (const raw of dealsByClient.get(c.id) ?? []) sources.set(raw, "the HubSpot deal");
  for (const raw of c.properties?.account_use_cases?.ids ?? []) sources.set(raw, "the account use-case picker");

  for (const [raw, source] of sources) {
    const id = resolve(raw);
    if (!id || !live.has(id)) {
      const k = `${raw} → ${id ?? "(no match)"}`;
      unresolved.set(k, (unresolved.get(k) ?? 0) + 1);
      continue;
    }
    if (have.has(id)) { alreadyLinked++; continue; }
    have.add(id); // two raw values can resolve to one id (Product/Service Knowledge)
    planned.push({ clientId: c.id, clientName: c.name, useCaseId: id, source, raw });
  }
}

const byUseCase = new Map();
for (const p of planned) byUseCase.set(p.useCaseId, (byUseCase.get(p.useCaseId) ?? 0) + 1);
const accounts = new Set(planned.map((p) => p.clientId));

console.log(`Would create ${planned.length} association(s) across ${accounts.size} account(s).`);
console.log(`Already linked, left untouched: ${alreadyLinked}\n`);
console.log("Per use case:");
for (const [id, n] of [...byUseCase].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}×  ${id}`);
}
if (unresolved.size) {
  console.log("\nNOT backfilled — no confident match in the live taxonomy:");
  for (const [k, n] of [...unresolved].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}×  ${k}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --yes to write.");
  await sql.end();
  process.exit(0);
}

const now = new Date().toISOString();
const grouped = new Map();
for (const p of planned) {
  if (!grouped.has(p.clientId)) grouped.set(p.clientId, []);
  grouped.get(p.clientId).push(p);
}

let written = 0;
for (const [clientId, rows] of grouped) {
  /* Re-read inside the loop and append, rather than writing a value computed
     before the loop started: this script is slow enough that a CSM could add a
     record while it runs, and a blind overwrite would drop it. */
  const [current] = await sql`select properties from clients where id = ${clientId}`;
  const existing = current?.properties?.use_case_implementations ?? [];
  const list = Array.isArray(existing) ? [...existing] : Object.values(existing);
  const have = new Set(list.map((i) => i?.useCaseId).filter(Boolean));

  for (const r of rows) {
    if (have.has(r.useCaseId)) continue;
    have.add(r.useCaseId);
    list.push({
      id: `uci_${randomUUID().slice(0, 8)}`,
      useCaseId: r.useCaseId,
      status: "exploring",
      objective: "",
      scope: "",
      csmEmail: null,
      clientOwner: "",
      targetDate: null,
      nextStep: "",
      missionId: null,
      notes: `Backfilled from ${r.source} ("${r.raw}"). Not yet confirmed with the client.`,
      updatedAt: now,
      updatedBy: null,
    });
    written++;
  }

  await sql`
    update clients
       set properties = coalesce(properties, '{}'::jsonb)
                        || jsonb_build_object('use_case_implementations', ${sql.json(list)})
     where id = ${clientId}`;
}

console.log(`\nWrote ${written} association(s) across ${grouped.size} account(s).`);
await sql.end();
