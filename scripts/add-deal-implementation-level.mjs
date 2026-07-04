/**
 * Adds the `implementation_level` text column to client_deals — synced from the
 * HubSpot deal select "Implementation Level" (Self-Serve / Guided / White Glove).
 * Read-only in the app (shown as a badge on the deal card).
 *
 * Usage: node scripts/add-deal-implementation-level.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS implementation_level TEXT`;
const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_deals`;
console.log(`✓ client_deals.implementation_level column ready (${n} deals)`);
await sql.end();
