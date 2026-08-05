#!/usr/bin/env node
/* =========================================================================
   Snapshot and restore clients.health.

   WHY THIS EXISTS. Reverting the code does NOT undo a recompute. The health
   column is overwritten in place, so once the engine has swept the book the
   old scores are gone unless something kept them. This is the only rollback
   for the engine migration.

     node scripts/backup-restore-health.mjs backup --prod
     node scripts/backup-restore-health.mjs restore --prod --file <path>

   Backup is read-only. Restore prints what it will change and needs --apply,
   the same shape as the migration script.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const cmd = argv[0];
const prod = argv.includes("--prod");
const apply = argv.includes("--apply");
const fileArg = argv[argv.indexOf("--file") + 1];

if (cmd !== "backup" && cmd !== "restore") {
  console.error("usage: backup-restore-health.mjs <backup|restore> [--prod] [--file path] [--apply]");
  process.exit(1);
}

function envValue(file, key) {
  const src = readFileSync(join(root, file), "utf8");
  const m = new RegExp(`^${key}="?([^"\\n]+)"?`, "m").exec(src);
  if (!m) throw new Error(`${key} not found in ${file}`);
  return m[1];
}

const url = prod ? envValue(".env.clone", "CLONE_SOURCE_URL") : envValue(".env.local", "DATABASE_URL");
console.log(`target : ${prod ? "PRODUCTION" : "local"} — ${new URL(url).host}`);
const sql = postgres(url, { prepare: false, max: 1 });

if (cmd === "backup") {
  const rows = await sql`select id, name, health from clients where health is not null`;
  // Stamped after the query, not inside the script's logic — the file name is
  // the only thing tying a restore to the moment it came from.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = join(root, `.health-backup-${prod ? "prod" : "local"}-${stamp}.json`);
  writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), host: new URL(url).host, rows }, null, 1));

  const tiers = {};
  for (const r of rows) tiers[r.health?.tier ?? "(none)"] = (tiers[r.health?.tier ?? "(none)"] ?? 0) + 1;
  console.log(`\nsaved ${rows.length} health rows`);
  console.log("tiers :", JSON.stringify(tiers));
  console.log(`file  : ${out}`);
} else {
  if (!fileArg) { console.error("restore needs --file <path>"); process.exit(1); }
  const data = JSON.parse(readFileSync(fileArg, "utf8"));
  if (data.host !== new URL(url).host) {
    console.error(`\nREFUSING: backup came from ${data.host}, you are pointed at ${new URL(url).host}.`);
    process.exit(1);
  }
  console.log(`backup : ${data.rows.length} rows, taken ${data.takenAt}`);

  const current = await sql`select id, health from clients where id in ${sql(data.rows.map((r) => r.id))}`;
  const byId = new Map(current.map((c) => [c.id, c.health]));
  const changed = data.rows.filter((r) => JSON.stringify(byId.get(r.id)) !== JSON.stringify(r.health));
  console.log(`would change ${changed.length} of ${data.rows.length} rows back`);
  for (const r of changed.slice(0, 8)) {
    console.log(`  ${String(byId.get(r.id)?.tier ?? "—").padEnd(14)} -> ${String(r.health?.tier ?? "—").padEnd(14)} ${r.name}`);
  }
  if (changed.length > 8) console.log(`  … and ${changed.length - 8} more`);

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply.");
  } else {
    await sql.begin(async (tx) => {
      for (const r of changed) {
        await tx`update clients set health = ${sql.json(r.health)}, updated_at = now() where id = ${r.id}`;
      }
    });
    console.log(`\nRestored ${changed.length} rows.`);
  }
}

await sql.end();
