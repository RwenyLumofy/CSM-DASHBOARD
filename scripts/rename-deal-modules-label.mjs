/**
 * Renames the live `deal_modules` property-definition label from
 * "Package (Modules)" to "Module" so Settings → Properties matches the deal
 * card, which now shows this field as "Module" (see ClientProfileTabs.tsx
 * DEAL_FIELDS "products" entry). The underlying key stays `deal_modules`
 * (it only holds the sync-managed option list — no data change).
 *
 * Usage:  node scripts/rename-deal-modules-label.mjs
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
     SET label = 'Module'
   WHERE key = 'deal_modules'
`;
console.log(`✓ Updated ${res.count} row(s): deal_modules label → "Module"`);

await sql.end();
