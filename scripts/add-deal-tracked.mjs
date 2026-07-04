/**
 * Adds the `tracked` boolean column to client_deals (default true), so CSMs can
 * mark deals dead/active and exclude dead deals from ARR.
 *
 * Usage: node scripts/add-deal-tracked.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS tracked BOOLEAN NOT NULL DEFAULT TRUE`;
const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_deals`;
console.log(`✓ client_deals.tracked column ready (${n} deals, all tracked by default)`);
await sql.end();
