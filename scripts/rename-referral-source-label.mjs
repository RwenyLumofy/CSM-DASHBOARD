/**
 * Renames the live `referral_source` property-definition label to the canonical
 * "Acquisition Channel" so Settings → Properties matches the clients-table column
 * and the deal card. The underlying key stays `referral_source` (no data change).
 *
 * Usage:  node scripts/rename-referral-source-label.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const connectionString = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("No DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL found in .env.local");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

const res = await sql`
  UPDATE property_definitions
     SET label = 'Acquisition Channel'
   WHERE key = 'referral_source'
`;
console.log(`✓ Updated ${res.count} row(s): referral_source label → "Acquisition Channel"`);

await sql.end();
