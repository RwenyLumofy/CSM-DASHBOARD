/**
 * Creates the contract-record tables (contract_records, client_status_overrides,
 * contract_audit) by running drizzle/contract-records.sql. Strictly additive and
 * idempotent: re-running it changes nothing.
 *
 * Production: paste drizzle/contract-records.sql into the Supabase SQL editor
 * instead — production credentials never need to reach a laptop.
 *
 * Usage:  node scripts/add-contract-tables.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* process.env wins over .env.local, and the target is printed before anything
   is written — see scripts/add-expansion-tables.mjs for why. */
let fileEnv = {};
try {
  const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  fileEnv = Object.fromEntries(
    envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
} catch { /* the environment must supply the URL */ }

const conn = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || fileEnv.DIRECT_DATABASE_URL || fileEnv.DATABASE_URL;
if (!conn) { console.error("No database URL. Set DIRECT_DATABASE_URL or DATABASE_URL, or provide .env.local."); process.exit(1); }
const target = (() => { try { const u = new URL(conn); return `${u.hostname}/${u.pathname.replace(/^\//, "") || "postgres"}`; } catch { return "an unparseable connection string"; } })();
console.log(`→ target: ${target}  (from ${process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL ? "the environment" : ".env.local"})`);

const sql = postgres(conn, { max: 1 });
const ddl = readFileSync(join(__dirname, "../drizzle/contract-records.sql"), "utf-8");
await sql.unsafe(ddl);
const [{ n }] = await sql`
  SELECT count(*)::int AS n FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('contract_records', 'client_status_overrides', 'contract_audit')`;
await sql.end();
if (n !== 3) { console.error(`✗ expected 3 contract tables, found ${n}`); process.exit(1); }
console.log("✓ contract tables ready (3)");
