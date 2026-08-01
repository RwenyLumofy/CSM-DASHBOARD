#!/usr/bin/env node
/* =========================================================================
   Read-only report on the Use Case Universe's stored state.

   WRITES NOTHING. There is no --yes and no code path that updates anything —
   this exists so the shape of an environment can be checked before a migration
   is pointed at it, and again afterwards.

   Reports: categories (including any the Definition Library does not name),
   use cases per category, anything uncategorised, how complete each definition
   is, and how many accounts are linked.

     node scripts/inspect-use-case-taxonomy.mjs           # .env.local
     node scripts/inspect-use-case-taxonomy.mjs --prod    # CLONE_SOURCE_URL
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = (() => {
  if (process.argv.includes("--prod")) {
    const f = readFileSync(new URL("../.env.clone", import.meta.url), "utf8");
    const u = f.match(/^CLONE_SOURCE_URL="?([^"\n]+)"?/m)?.[1];
    if (!u) { console.error("No CLONE_SOURCE_URL in .env.clone"); process.exit(1); }
    return u;
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return f.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
})();
if (!url) { console.error("No database URL."); process.exit(1); }

const ref = url.match(/db\.([a-z0-9]{20})\.supabase/)?.[1]
  ?? url.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1] ?? "(unidentified)";
console.log(`→ database: ${ref}\n`);

const sql = postgres(url, { prepare: false, max: 1 });

const cfg = await sql`select key, value from workspace_config where key in ('use_case_taxonomy','use_case_library')`;
const tax = cfg.find((r) => r.key === "use_case_taxonomy")?.value ?? {};
const lib = cfg.find((r) => r.key === "use_case_library")?.value ?? {};
const added = tax.added ?? {}, groups = tax.groups ?? {}, retired = tax.retired ?? {};

console.log(`use cases: ${Object.keys(added).length}   categories: ${Object.keys(groups).length}   retired: ${Object.keys(retired).length}`);
console.log(`definitions in library: ${Object.keys(lib).length}`);
if (tax.renamed) console.log(`⚠ stale \`renamed\` key still present: ${Object.keys(tax.renamed).length} entries (no longer read by the app)`);

/* The six the Definition Library names. Anything else is a leftover from an
   earlier model and worth looking at before it shows up as a filter. */
const DOC_GROUPS = ["enablement", "readiness", "capability", "performance", "assessment", "engagement"];

console.log("\n=== CATEGORIES ===");
for (const g of Object.values(groups)) {
  const members = Object.values(added).filter((u) => (u.groups ?? []).includes(g.id));
  const flag = DOC_GROUPS.includes(g.id) ? "" : "   ← NOT IN THE DEFINITION LIBRARY";
  console.log(`\n${g.label}  [${g.id}]  (${members.length})${flag}`);
  for (const m of members.sort((a, b) => a.label.localeCompare(b.label))) {
    console.log(`    ${m.label}${retired[m.id] ? "  (retired)" : ""}`);
  }
}

const orphanCat = Object.values(added).filter((u) => !(u.groups ?? []).length);
const badCat = Object.values(added).filter((u) => (u.groups ?? []).some((g) => !groups[g]));
console.log(`\nUncategorised use cases: ${orphanCat.length}`);
for (const u of orphanCat) console.log(`    ${u.label}`);
console.log(`Pointing at a category that does not exist: ${badCat.length}`);
for (const u of badCat) console.log(`    ${u.label} → ${(u.groups ?? []).filter((g) => !groups[g]).join(", ")}`);

console.log("\n=== DEFINITION COMPLETENESS ===");
const FIELDS = ["oneLiner", "customerProblem", "desiredOutcome", "capabilities", "successIndicators"];
let full = 0, partial = 0, empty = 0;
const emptyOnes = [];
for (const id of Object.keys(added)) {
  const e = lib[id];
  const have = e ? FIELDS.filter((f) => Array.isArray(e[f]) ? e[f].length : !!e[f]).length : 0;
  if (have === FIELDS.length) full++;
  else if (have > 0) partial++;
  else { empty++; emptyOnes.push(added[id].label); }
}
console.log(`fully written: ${full}   partial: ${partial}   nothing at all: ${empty}`);
if (emptyOnes.length) for (const l of emptyOnes) console.log(`    (empty) ${l}`);

const noRow = Object.keys(lib).filter((id) => !added[id]);
console.log(`\nDefinitions with NO taxonomy row (would be invisible): ${noRow.length}`);
for (const id of noRow) console.log(`    ${id}`);

const clients = await sql`select properties from clients`;
let links = 0; const linkedIds = new Set();
for (const c of clients) {
  const raw = c.properties?.use_case_implementations ?? [];
  for (const i of (Array.isArray(raw) ? raw : Object.values(raw))) if (i?.useCaseId) { links++; linkedIds.add(i.useCaseId); }
}
console.log(`\n=== ADOPTION ===\naccount links: ${links}   distinct use cases linked: ${linkedIds.size}`);
const danglingLinks = [...linkedIds].filter((id) => !added[id]);
if (danglingLinks.length) console.log(`⚠ links pointing at a use case with no taxonomy row: ${danglingLinks.join(", ")}`);

await sql.end();
