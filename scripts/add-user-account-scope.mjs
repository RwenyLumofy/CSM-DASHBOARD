/**
 * Pass 2 of the Members redesign — per-user account scope.
 *   • app_users.scope  (nullable text): 'all' | 'assigned' | 'selected' | null(=role default)
 *   • user_account_grants (user_email, client_id): the accounts a 'selected'-scope
 *     member may access.
 * Strictly additive: no data moved, nothing dropped, safe to re-run.
 *
 * Usage:  node scripts/add-user-account-scope.mjs
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

const conn = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
const sql = postgres(conn, { max: 1 });
await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS scope TEXT`;
await sql`
  CREATE TABLE IF NOT EXISTS user_account_grants (
    user_email TEXT NOT NULL,
    client_id  TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_email, client_id)
  )`;
await sql`CREATE INDEX IF NOT EXISTS user_account_grants_user_idx ON user_account_grants (user_email)`;
console.log("✓ app_users.scope + user_account_grants ready");
await sql.end();
