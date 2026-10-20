/**
 * Turns on row level security for the public tables that were created without
 * it, by running drizzle/rls-enable-missing.sql. Adds no policies — the app
 * connects as postgres, the table owner, so it is unaffected. Idempotent:
 * re-running it changes nothing.
 *
 * Production: paste drizzle/rls-enable-missing.sql into the Supabase SQL editor
 * instead — production credentials never need to reach a laptop.
 *
 * Usage:  node scripts/rls-enable-missing.mjs
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
const ddl = readFileSync(join(__dirname, "../drizzle/rls-enable-missing.sql"), "utf-8");
await sql.unsafe(ddl);
const off = await sql`
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  ORDER BY 1`;
await sql.end();
if (off.length) { console.error(`✗ ${off.length} public table(s) still without RLS: ${off.map((r) => r.relname).join(", ")}`); process.exit(1); }
console.log("✓ every public table has row level security on");
