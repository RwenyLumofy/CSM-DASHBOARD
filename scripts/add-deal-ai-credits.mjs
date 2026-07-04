/**
 * 2026-06-24:
 *  - Add client_deals.ai_course_credits, synced from HubSpot deal
 *    `custom_ai_course_development_credits` (number). Read-only in the app.
 *  - Status values changed to Onboarding / Active / Renewal / Churn (label) —
 *    drop the "At risk" option; migrate any existing at_risk → active.
 *    (The "Churn" label keeps the stored value "churned".)
 *
 * Usage: node scripts/add-deal-ai-credits.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS ai_course_credits DOUBLE PRECISION`;
const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_deals`;
console.log(`✓ client_deals.ai_course_credits column ready (${n} deals)`);

const mig = await sql`UPDATE clients SET status = 'active' WHERE status = 'at_risk'`;
console.log(`✓ migrated ${mig.count} clients from at_risk → active`);
await sql.end();
