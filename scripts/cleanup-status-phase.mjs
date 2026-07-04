/**
 * 2026-06-24 model changes:
 *  - Merge Status + Phase → one account-level manual prop (the core `status`).
 *    Removes the per-deal `phase` (def, column, stored values).
 *  - Add manual `global_library_start_date` (alongside the expiry date).
 *
 * Usage: node scripts/cleanup-status-phase.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

// 1. Add the new manual Global Library Start Date definition (idempotent).
await sql`
  INSERT INTO property_definitions (key, label, type, options, "group", sort_order, is_system, is_read_only)
  VALUES ('global_library_start_date', 'Global Library Start Date', 'date', ${sql.json([])}, 'dates', 85, true, false)
  ON CONFLICT (key) DO NOTHING
`;
console.log("✓ global_library_start_date definition ensured");

// 2. Remove the Phase definition + its stored per-client values.
const delPhase = await sql`DELETE FROM property_definitions WHERE key = 'phase'`;
console.log(`✓ deleted phase definition (${delPhase.count})`);
const strip = await sql`SELECT COUNT(*)::int AS n FROM clients WHERE properties ? 'phase'`;
await sql`UPDATE clients SET properties = properties - 'phase' WHERE properties ? 'phase'`;
console.log(`✓ stripped phase from ${strip[0].n} client property records`);

// 3. Drop the per-deal phase column.
await sql`ALTER TABLE client_deals DROP COLUMN IF EXISTS phase`;
console.log("✓ dropped client_deals.phase column");

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM property_definitions`;
console.log(`property_definitions now: ${n}`);
await sql.end();
