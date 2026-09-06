#!/usr/bin/env node
/* =========================================================================
   Apply drizzle/0006_notes_type_occurred_at_mentions.sql.

   Dry run by default, and it prints the host it is about to touch BEFORE
   doing anything — same habit as scripts/apply-task-updates-migration.mjs.

     node scripts/apply-notes-migration.mjs          # test clone, dry run
     node scripts/apply-notes-migration.mjs --apply  # test clone, for real
     node scripts/apply-notes-migration.mjs --prod --apply

   The migration is additive and idempotent (ADD COLUMN IF NOT EXISTS /
   CREATE TABLE IF NOT EXISTS), so re-running is a no-op. Nothing here writes
   to an existing row — and this script proves it: it counts the notes and
   hashes their bodies before and after, and REFUSES to report success if
   either changed.
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

console.log(`target : ${prod ? "PRODUCTION" : "test clone"} — ${host}`);
console.log(`mode   : ${apply ? "APPLY" : "dry run (pass --apply to execute)"}\n`);

const sql = postgres(url, { prepare: false, max: 1 });

/* Comment lines are stripped FIRST — filtering chunks by whether they *begin*
   with "--" silently drops every statement carrying a leading comment. */
const statements = readFileSync(join(root, "drizzle/0006_notes_type_occurred_at_mentions.sql"), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);

console.log(`${statements.length} statements to run:`);
for (const s of statements) console.log(`  · ${s.split("\n").join(" ").replace(/\s+/g, " ").slice(0, 76)}…`);

/** Schema state plus a fingerprint of the note CONTENT that must not change. */
async function state() {
  const [t] = await sql`select
    (select count(*)::int from information_schema.columns
       where table_name = 'client_notes'
         and column_name in ('type','occurred_at','meeting_id','deleted_at')) as new_note_cols,
    (select count(*)::int from information_schema.tables
       where table_name = 'client_note_mentions') as mentions_table,
    (select count(*)::int from information_schema.columns
       where table_name = 'client_meetings' and column_name = 'source') as meetings_source_col`;
  const [n] = await sql`select
    count(*)::int as notes,
    coalesce(md5(string_agg(id || ':' || body || ':' || created_at, '|' order by id)), 'empty') as fingerprint
    from client_notes`;
  return { ...t, notes: n.notes, fingerprint: n.fingerprint };
}

const before = await state();
console.log("\nbefore :", before);

if (!apply) {
  console.log("\nNothing written. Re-run with --apply.");
  await sql.end();
  process.exit(0);
}

// One transaction: a half-applied schema is worse than an unapplied one.
await sql.begin(async (tx) => {
  for (const s of statements) await tx.unsafe(s);
});

const after = await state();
console.log("after  :", after);

/* The guarantee, checked rather than asserted: no note was added, removed or
   rewritten. If this trips, the migration did something it was not supposed
   to and the operator needs to know before anyone trusts the result. */
const intact = before.notes === after.notes && before.fingerprint === after.fingerprint;
console.log(
  intact
    ? `\nApplied. ${after.notes} notes untouched (fingerprint unchanged).`
    : `\nAPPLIED, BUT NOTE CONTENT CHANGED — ${before.notes} → ${after.notes} notes. Investigate before proceeding.`,
);

await sql.end();
process.exit(intact ? 0 : 1);
