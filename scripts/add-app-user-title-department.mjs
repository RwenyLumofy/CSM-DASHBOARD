/**
 * Adds `title` and `department` (both nullable TEXT) to app_users so a person
 * can be entered once with their job title + department alongside their
 * permission tier — Phase 1 of the employees-list consolidation
 * (docs/employees-consolidation-spec.md). Strictly additive: no data moved,
 * nothing dropped, safe to re-run.
 *
 * Usage:  node scripts/add-app-user-title-department.mjs
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
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS title TEXT`;
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department TEXT`;
console.log("✓ app_users.title + app_users.department columns ready");
await sql.end();
