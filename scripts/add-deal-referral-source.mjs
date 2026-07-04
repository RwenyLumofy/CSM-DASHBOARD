/**
 * Adds the `referral_source` column to client_deals. Each won deal stores its
 * own derived referral source so the client-level referral_source /
 * closed_won_date_prop can be re-derived from the FULL deal history on every
 * sync (fixes incremental-sync staleness when an older deal is re-modified).
 *
 * Usage:  node scripts/add-deal-referral-source.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

// Prefer the direct (session-mode, port 5432) connection for DDL.
const conn = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
const sql = postgres(conn, { max: 1 });
await sql`ALTER TABLE client_deals ADD COLUMN IF NOT EXISTS referral_source TEXT`;
console.log("✓ client_deals.referral_source column ready");
await sql.end();
