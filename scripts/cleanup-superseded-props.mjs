/**
 * Removes property definitions (and their orphaned per-client values) that are
 * now superseded by HubSpot-synced / computed fields, eliminating duplication:
 *   - region            → duplicate of the synced Country (core field)
 *   - industry_prop     → duplicate of the synced Industry (core field)
 *   - implementation_level → now synced per-deal from HubSpot
 *   - support_model     → now synced per-deal from HubSpot (deal `support_level`)
 *   - total_licenses    → now computed per deal (Licenses + Complementary)
 *
 * Usage: node scripts/cleanup-superseded-props.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

const KEYS = ["region", "industry_prop", "implementation_level", "support_model", "total_licenses"];

// 1. Delete the property definitions.
const delDefs = await sql`DELETE FROM property_definitions WHERE key IN ${sql(KEYS)}`;
console.log(`✓ deleted ${delDefs.count} property definitions: ${KEYS.join(", ")}`);

// 2. Strip the orphaned values from every client's properties JSONB.
const before = await sql`SELECT COUNT(*)::int AS n FROM clients WHERE properties ?| ARRAY['region','industry_prop','implementation_level','support_model','total_licenses']::text[]`;
await sql`
  UPDATE clients
  SET properties = properties - 'region' - 'industry_prop' - 'implementation_level' - 'support_model' - 'total_licenses'
  WHERE properties ?| ARRAY['region','industry_prop','implementation_level','support_model','total_licenses']::text[]
`;
console.log(`✓ stripped those keys from ${before[0].n} client property records`);

const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM property_definitions`;
console.log(`property_definitions now: ${n}`);
await sql.end();
