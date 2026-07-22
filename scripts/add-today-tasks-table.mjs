/**
 * Creates the `today_tasks` table — user-authored tasks on the Today operating
 * board (linked to an account and/or project). Strictly additive, idempotent.
 *
 * Usage:  node scripts/add-today-tasks-table.mjs
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
await sql`
  CREATE TABLE IF NOT EXISTS today_tasks (
    id text PRIMARY KEY,
    owner_email text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    account_id text,
    project_id text,
    due_date timestamptz,
    priority text NOT NULL DEFAULT 'normal',
    notes text,
    source_type text,
    source_id text,
    created_by_email text,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
// Additive columns for tables that predate the richer task model.
await sql`ALTER TABLE today_tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'`;
await sql`ALTER TABLE today_tasks ADD COLUMN IF NOT EXISTS notes text`;
await sql`ALTER TABLE today_tasks ADD COLUMN IF NOT EXISTS source_type text`;
await sql`ALTER TABLE today_tasks ADD COLUMN IF NOT EXISTS source_id text`;
await sql`ALTER TABLE today_tasks ADD COLUMN IF NOT EXISTS created_by_email text`;
await sql`CREATE INDEX IF NOT EXISTS today_tasks_owner_idx ON today_tasks (owner_email)`;
await sql`CREATE INDEX IF NOT EXISTS today_tasks_account_idx ON today_tasks (account_id)`;
console.log("✓ today_tasks table ready");
await sql.end();
