#!/usr/bin/env node
/* =========================================================================
   Dump workspace_config keys to a timestamped JSON file, so a migration has
   something to roll back to.

   WHY IT EXISTS. The use-case taxonomy and the definition library live in
   workspace_config as schemaless JSONB. A script that rewrites one of them has
   no transaction log to undo and no migration to reverse — if it writes the
   wrong shape, the previous state is simply gone. This was learned the hard
   way: a reconcile was applied to production without a backup, duplicated
   eleven use cases, and there was nothing to restore from.

   Run it before any --yes. It only reads.

     node scripts/backup-workspace-config.mjs [--prod] [--out DIR]

   Restore is deliberately manual — read the file, decide, and write the key
   back. An automatic restore is another destructive path to get wrong.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// URL.pathname percent-encodes, so a repo checked out under a path with a
// space in it ("signal project") writes to a literal "signal%20project"
// directory instead. fileURLToPath decodes properly.
import { fileURLToPath } from "node:url";

const KEYS = ["use_case_taxonomy", "use_case_library"];

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
  ?? url.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1] ?? "unknown";
console.log(`→ database: ${ref}`);

const outDir = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : fileURLToPath(new URL("../.db-dumps", import.meta.url));
mkdirSync(outDir, { recursive: true });

const sql = postgres(url, { prepare: false, max: 1 });
const rows = await sql`select key, value from workspace_config where key = any(${KEYS})`;
await sql.end();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `${outDir}/workspace-config-${ref}-${stamp}.json`;
const payload = Object.fromEntries(rows.map((r) => [r.key, r.value]));
writeFileSync(file, JSON.stringify(payload, null, 2));

for (const [k, v] of Object.entries(payload)) {
  const n = v && typeof v === "object" ? Object.keys(v.added ?? v).length : 0;
  console.log(`   ${k}: ${n} entries`);
}
console.log(`\nBacked up to ${file}`);
