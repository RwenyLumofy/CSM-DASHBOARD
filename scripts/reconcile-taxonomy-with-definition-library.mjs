#!/usr/bin/env node
/* =========================================================================
   Re-apply the Use Case Definition Library's catalogue to the taxonomy.

   WHY THIS EXISTS. scripts/load-use-case-definition-library.mjs loaded the
   July 2026 document and recorded the catalogue it specifies — 11 renames and
   category moves, 3 additions, 6 category labels. It wrote the renames into
   `overlay.renamed`, which was correct at the time: the taxonomy was a DELTA
   layered on the code-shipped list, and `renamed[id]` was how you overrode a
   shipped entry.

   Then the overlay became a flat database. `renamed` was removed from the
   model, so normalizeOverlay drops it — and every one of the document's
   renames and category moves went with it. What the app shows today are the
   ORIGINAL shipped labels from lib/use-cases.ts, which
   scripts/restore-orphaned-use-cases.mjs promoted into `added` when it
   repaired the orphaned definitions. Silently, because nothing errors when a
   key stops being read.

   Measured before writing this: 8 wrong labels, 4 wrong category assignments.
   "Culture & Engagement" should read "Employee Engagement & Feedback
   Measurement"; Training Needs Analysis and Competency Framework belong under
   Enablement, not Performance; Certification Preparation should not be
   cross-listed.

   ONE SOURCE OF TRUTH. The catalogue is not re-typed here — it is parsed out
   of the loader script, which remains the record of what the document says.
   Edit the document's catalogue there and this follows. Summaries come from
   `use_case_library` in the database, which already holds the document's own
   one-liners, so the missing library.json export is not needed.

   Writes ONLY the taxonomy key. Definitions are untouched.
   Dry run by default. Pass --yes to write.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--yes");

/* Three ways to choose the database, in precedence order:
     --prod                 CLONE_SOURCE_URL from .env.clone (production)
     DATABASE_URL in env    whatever you set
     .env.local             the default, the local/clone database

   `--prod` exists so the production connection string is read out of the file
   by this script, the same way .env.local always has been, instead of being
   interpolated into a shell command where it ends up in history and process
   listings. Same credential either way; one of them leaks it. */
const url = readTarget();
function readTarget() {
  if (process.argv.includes("--prod")) {
    const f = readFileSync(new URL("../.env.clone", import.meta.url), "utf8");
    const u = f.match(/^CLONE_SOURCE_URL="?([^"\n]+)"?/m)?.[1];
    if (!u) { console.error("No CLONE_SOURCE_URL in .env.clone"); process.exit(1); }
    return u;
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return f.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
}
if (!url) { console.error("No database URL — pass --prod, set DATABASE_URL, or fill .env.local"); process.exit(1); }
/* Supabase gives the project ref two ways: `db.<ref>.supabase.co` on a direct
   connection, and `postgres.<ref>` as the username through the pooler. Match
   both, or the guard prints nothing useful on the connection you actually use. */
const dbRef = url.match(/db\.([a-z0-9]{20})\.supabase/)?.[1]
  ?? url.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1]
  ?? "(could not identify — check the URL before writing)";
console.log(`→ database: ${dbRef}\n`);

const src = readFileSync(new URL("./load-use-case-definition-library.mjs", import.meta.url), "utf8");

/** `id: { label: "…", groups: ["…"] }` out of a named const block. */
function parseCatalogue(name) {
  const block = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`))?.[1];
  if (!block) { console.error(`Could not read ${name} from the loader script.`); process.exit(1); }
  const out = {};
  for (const m of block.matchAll(/^\s+([a-z_]+):\s*\{\s*label:\s*"([^"]+)",\s*groups:\s*\[([^\]]*)\]/gm)) {
    out[m[1]] = { label: m[2], groups: m[3].split(",").map((s) => s.trim().replace(/"/g, "")).filter(Boolean) };
  }
  return out;
}

const RENAMES = parseCatalogue("RENAMES");
const ADDITIONS = parseCatalogue("ADDITIONS");

const groupBlock = src.match(/const GROUPS = \{([\s\S]*?)\n\};/)?.[1] ?? "";
const GROUPS = {};
for (const m of groupBlock.matchAll(/id:\s*"([a-z_]+)",\s*label:\s*"([^"]+)",\s*blurb:\s*"([^"]+)"/g)) {
  GROUPS[m[1]] = { id: m[1], label: m[2], blurb: m[3] };
}

console.log(`Catalogue read from the loader: ${Object.keys(RENAMES).length} renames · ${Object.keys(ADDITIONS).length} additions · ${Object.keys(GROUPS).length} categories\n`);

const sql = postgres(url, { prepare: false, max: 1 });

const rows = await sql`select key, value from workspace_config where key in ('use_case_taxonomy','use_case_library')`;
const overlay = rows.find((r) => r.key === "use_case_taxonomy")?.value ?? {};
const library = rows.find((r) => r.key === "use_case_library")?.value ?? {};
const added = { ...(overlay.added ?? {}) };
const groups = { ...(overlay.groups ?? {}) };

const changes = [];

for (const [id, g] of Object.entries(GROUPS)) {
  const have = groups[id];
  if (!have || have.label !== g.label || have.blurb !== g.blurb) {
    changes.push(`category ${id}: ${have ? `"${have.label}"` : "(missing)"} → "${g.label}"`);
    groups[id] = g;
  }
}

/* Renames and additions are applied the same way — both say "this id should
   have this label and these categories". The only difference is whether the
   row already exists, and an addition that is already present is not special. */
for (const [id, want] of Object.entries({ ...RENAMES, ...ADDITIONS })) {
  const have = added[id];
  if (!have) {
    changes.push(`ADD ${id}: "${want.label}" [${want.groups.join(", ")}]`);
    added[id] = { id, label: want.label, groups: want.groups, summary: "", createdBy: "use-case-definition-library.docx" };
    continue;
  }
  if (have.label !== want.label) {
    changes.push(`label ${id}: "${have.label}" → "${want.label}"`);
  }
  const same = JSON.stringify([...(have.groups ?? [])].sort()) === JSON.stringify([...want.groups].sort());
  if (!same) changes.push(`groups ${id}: [${(have.groups ?? []).join(", ")}] → [${want.groups.join(", ")}]`);
  added[id] = { ...have, label: want.label, groups: want.groups };
}

/* The summary shown in the list and the picker is the document's one-liner.
   The loader put these in `renamed[id].summary`, so they were dropped too. */
let summaries = 0;
for (const [id, row] of Object.entries(added)) {
  const oneLiner = library[id]?.oneLiner;
  if (!oneLiner) continue;
  const next = oneLiner.slice(0, 400);
  if (row.summary !== next) { added[id] = { ...row, summary: next }; summaries++; }
}

/* Anything in the taxonomy the document's catalogue does not mention is LEFT
   ALONE, not retired. The loader made the same call for 360° Feedback, and for
   the same reason: silently dropping a use case an account may reference is
   worse than a count that does not match a table. */
const untouched = Object.keys(added).filter((id) => !RENAMES[id] && !ADDITIONS[id]);

console.log(`Taxonomy changes: ${changes.length}`);
for (const c of changes) console.log(`  ${c}`);
console.log(`\nSummaries realigned to the document's one-liner: ${summaries}`);
console.log(`Entries the catalogue does not mention, left untouched: ${untouched.length}`);

if (!changes.length && !summaries) {
  console.log("\nAlready reconciled — nothing to do.");
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --yes to write.");
  await sql.end();
  process.exit(0);
}

await sql`
  insert into workspace_config (key, value, updated_at)
  values ('use_case_taxonomy', ${sql.json({ ...overlay, added, groups })}, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()`;

console.log(`\nWrote the taxonomy: ${Object.keys(added).length} use cases, ${Object.keys(groups).length} categories.`);
await sql.end();
