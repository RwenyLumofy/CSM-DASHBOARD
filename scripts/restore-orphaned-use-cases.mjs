#!/usr/bin/env node
/* =========================================================================
   Restore orphaned use-case definitions into the Use Case database.

   WHY THIS EXISTS. The Use Case Universe used to be a delta layered on top of
   a code-shipped list (lib/use-cases.ts). Definitions written by the team were
   keyed on those shipped ids. When the Universe became a flat, preset-free
   database, the shipped ids stopped existing as rows — so every definition
   keyed on one became ORPHANED: still in workspace_config.use_case_library,
   but with no taxonomy row to attach to, therefore invisible in the UI.

   This promotes each orphaned definition into a real row in
   workspace_config.use_case_taxonomy → `added`, reusing:
     - the SAME id, so the definition it already has stays attached (and so any
       account association recorded against that id keeps resolving),
     - the label/summary/categories from the old shipped list where available,
       falling back to the definition's own oneLiner for the summary.

   Also drops the stale `renamed` key, a leftover of the old delta model that
   normalizeOverlay no longer reads.

   IDEMPOTENT. An id already present in `added` is left exactly as it is.

   Run with no flag for a DRY RUN (prints the plan, writes nothing):
     node scripts/restore-orphaned-use-cases.mjs
     node scripts/restore-orphaned-use-cases.mjs --yes
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--yes");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
if (!url) { console.error("No DATABASE_URL in .env.local"); process.exit(1); }

/* The old shipped list, read straight out of the source file rather than
   imported — this script is plain Node and lib/use-cases.ts is TypeScript. */
const src = readFileSync(new URL("../lib/use-cases.ts", import.meta.url), "utf8");

function parseShipped() {
  const out = new Map();
  const body = src.slice(src.indexOf("export const USE_CASES"), src.indexOf("export const USE_CASE_BY_ID"));
  const re = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*summary:\s*"([^"]*)",\s*groups:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body))) {
    out.set(m[1], {
      label: m[2],
      summary: m[3],
      groups: [...m[4].matchAll(/"([^"]+)"/g)].map((g) => g[1]),
    });
  }
  return out;
}

const shipped = parseShipped();
console.log(`Parsed ${shipped.size} entries from the old shipped list.`);

const sql = postgres(url, { prepare: false, max: 1 });

const rows = await sql`
  SELECT key, value FROM workspace_config
   WHERE key IN ('use_case_taxonomy', 'use_case_library')`;
const taxonomy = rows.find((r) => r.key === "use_case_taxonomy")?.value ?? {};
const library = rows.find((r) => r.key === "use_case_library")?.value ?? {};

const added = { ...(taxonomy.added ?? {}) };
const groups = taxonomy.groups ?? {};
const knownGroupIds = new Set(Object.keys(groups));

const definitionIds = Object.keys(library);
const orphans = definitionIds.filter((id) => !added[id]);

console.log(`\nTaxonomy rows already present: ${Object.keys(added).length}`);
console.log(`Definitions in the library:    ${definitionIds.length}`);
console.log(`Orphaned (to restore):         ${orphans.length}\n`);

const plan = [];
for (const id of orphans) {
  const ship = shipped.get(id);
  const def = library[id] ?? {};
  const label = ship?.label ?? id;
  const summary = ship?.summary || (def.oneLiner ?? "").slice(0, 200);
  // Only keep categories that actually exist as rows, or the entry would be
  // filed under a category the UI can't render or filter by.
  const cats = (ship?.groups ?? []).filter((g) => knownGroupIds.has(g));
  plan.push({ id, label, summary, groups: cats, matchedShipped: !!ship });
}

plan.sort((a, b) => a.label.localeCompare(b.label));
for (const p of plan) {
  const flag = p.matchedShipped ? "" : "  [no shipped match — label falls back to id]";
  const cats = p.groups.length ? p.groups.join(", ") : "UNCATEGORISED";
  console.log(`  ${p.label}\n      id=${p.id}  categories=${cats}${flag}`);
}

const uncategorised = plan.filter((p) => p.groups.length === 0);
if (uncategorised.length) {
  console.log(`\n${uncategorised.length} would land UNCATEGORISED (still visible, under "Uncategorised").`);
}
if (taxonomy.renamed) console.log(`\nStale \`renamed\` key present — will be dropped.`);

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --yes to apply.`);
  await sql.end();
  process.exit(0);
}

const stamp = new Date().toISOString();
for (const p of plan) {
  added[p.id] = {
    id: p.id, label: p.label, summary: p.summary, groups: p.groups,
    createdAt: stamp, createdBy: "restore-orphaned-use-cases",
  };
}

const next = {
  added,
  retired: taxonomy.retired ?? {},
  groups,
};

await sql`
  INSERT INTO workspace_config (key, value, updated_at)
       VALUES ('use_case_taxonomy', ${sql.json(next)}, now())
  ON CONFLICT (key) DO UPDATE SET value = ${sql.json(next)}, updated_at = now()`;

const [check] = await sql`
  SELECT jsonb_object_keys_count FROM (
    SELECT count(*) AS jsonb_object_keys_count
      FROM jsonb_object_keys((SELECT value -> 'added' FROM workspace_config WHERE key = 'use_case_taxonomy'))
  ) t`;
console.log(`\nApplied. Taxonomy now holds ${check.jsonb_object_keys_count} use-case rows.`);
await sql.end();
