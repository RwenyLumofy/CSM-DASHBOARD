#!/usr/bin/env node
/* =========================================================================
   Apply drizzle/0005_add_task_updates.sql.

   Dry run by default, and it prints the host it is about to touch BEFORE
   asking for anything — the one habit that would have caught the taxonomy
   incident earlier in this work.

     node scripts/apply-task-updates-migration.mjs          # local, dry run
     node scripts/apply-task-updates-migration.mjs --apply  # local, for real
     node scripts/apply-task-updates-migration.mjs --prod --apply

   The migration is additive and idempotent (CREATE TABLE IF NOT EXISTS /
   ADD COLUMN IF NOT EXISTS), so re-running is a no-op rather than a hazard.
   Nothing here writes to an existing row.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prod = process.argv.includes("--prod");
const apply = process.argv.includes("--apply");

function envValue(file, key) {
  const src = readFileSync(join(root, file), "utf8");
  const m = new RegExp(`^${key}="?([^"\\n]+)"?`, "m").exec(src);
  if (!m) throw new Error(`${key} not found in ${file}`);
  return m[1];
}

const url = prod ? envValue(".env.clone", "CLONE_SOURCE_URL") : envValue(".env.local", "DATABASE_URL");
const host = new URL(url).host;

console.log(`target : ${prod ? "PRODUCTION" : "local"} — ${host}`);
console.log(`mode   : ${apply ? "APPLY" : "dry run (pass --apply to execute)"}\n`);

const sql = postgres(url, { prepare: false, max: 1 });

/* Split on semicolons that end a statement. Comment lines are stripped FIRST:
   a previous attempt filtered chunks by whether they *began* with "--", which
   silently dropped every statement that carried a leading comment — including
   the CREATE TABLEs. */
const statements = readFileSync(join(root, "drizzle/0005_add_task_updates.sql"), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

console.log(`${statements.length} statements to run:`);
for (const s of statements) console.log(`  · ${s.split("\n")[0].slice(0, 78)}…`);

async function state() {
  const [t] = await sql`select
    (select count(*)::int from information_schema.tables where table_name = 'task_updates') as task_updates,
    (select count(*)::int from information_schema.tables where table_name = 'task_update_mentions') as mentions,
    (select count(*)::int from information_schema.columns
       where table_name = 'notifications' and column_name in ('entity_type','entity_id')) as ntf_cols`;
  return t;
}

console.log("\nbefore :", await state());

if (apply) {
  // One transaction: a half-applied schema is worse than an unapplied one.
  await sql.begin(async (tx) => {
    for (const s of statements) await tx.unsafe(s);
  });
  console.log("after  :", await state());
  console.log("\nApplied.");
} else {
  console.log("\nNothing written. Re-run with --apply.");
}

await sql.end();
