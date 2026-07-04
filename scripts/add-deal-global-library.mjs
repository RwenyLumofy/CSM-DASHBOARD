/**
 * Adds the global content library columns to client_deals, synced from HubSpot
 * deal props:
 *   - global_library_package  ← deal `global_libraries` (checkbox, multi)
 *   - global_library_licenses ← deal `global_libraries_licenses` (number)
 * Read-only in the app (shown on the deal card).
 *
 * Usage: node scripts/add-deal-global-library.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS global_library_package JSONB NOT NULL DEFAULT '[]'::jsonb`;
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS global_library_licenses DOUBLE PRECISION`;
const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_deals`;
console.log(`✓ client_deals global library columns ready (${n} deals)`);
await sql.end();
