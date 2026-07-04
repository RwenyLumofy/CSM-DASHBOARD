/**
 * Removes the account-level Global Library property definitions (and their
 * orphaned per-client values) — now superseded by the per-deal HubSpot-synced
 * fields global_library_package / global_library_licenses.
 *
 * Usage: node scripts/cleanup-global-library-props.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

const KEYS = ["global_library_package", "global_library_licenses"];

const delDefs = await sql`DELETE FROM property_definitions WHERE key IN ${sql(KEYS)}`;
console.log(`✓ deleted ${delDefs.count} property definitions: ${KEYS.join(", ")}`);

const before = await sql`SELECT COUNT(*)::int AS n FROM clients WHERE properties ?| ARRAY['global_library_package','global_library_licenses']::text[]`;
await sql`
  UPDATE clients
  SET properties = properties - 'global_library_package' - 'global_library_licenses'
  WHERE properties ?| ARRAY['global_library_package','global_library_licenses']::text[]
`;
console.log(`✓ stripped those keys from ${before[0].n} client property records`);

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM property_definitions`;
console.log(`property_definitions now: ${n}`);
await sql.end();
