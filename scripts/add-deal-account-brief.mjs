/**
 * Adds the `account_brief` text column to client_deals — the Sales → CSM
 * handover narrative synced from the HubSpot deal property `use_case_brief`
 * ("Account Brief for CSM Handover"). Nullable; synced (refreshed each sync).
 *
 * Usage: node scripts/add-deal-account-brief.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS account_brief TEXT`;
const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_deals`;
console.log(`✓ client_deals.account_brief column ready (${n} deals)`);
await sql.end();
