/**
 * Removes the legacy account-level "Launch Date" property definition (key
 * launch_date) and its orphaned per-client values — superseded by the
 * per-deal Launch field (client.properties.__deal_dates[dealId].launch_date,
 * shown on the deal card), which is now the sole source of truth for both
 * profile completeness (lib/profile-completeness.ts) and account lifecycle
 * status (lib/status.ts). The legacy field let accounts show "active"
 * status and "complete" profiles off a stale/unrelated value even when
 * their real per-deal Launch field was empty (confirmed live 2026-07-09).
 *
 * Usage: node scripts/cleanup-legacy-launch-date.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

const delDefs = await sql`DELETE FROM property_definitions WHERE key = 'launch_date'`;
console.log(`deleted ${delDefs.count} property definition: launch_date`);

const before = await sql`SELECT COUNT(*)::int AS n FROM clients WHERE properties ? 'launch_date'`;
await sql`UPDATE clients SET properties = properties - 'launch_date' WHERE properties ? 'launch_date'`;
console.log(`stripped launch_date from ${before[0].n} client property records`);

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM property_definitions`;
console.log(`property_definitions now: ${n}`);
await sql.end();
