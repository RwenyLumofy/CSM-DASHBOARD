/**
 * Close ALL blocking schema drift between lib/db/schema.ts and the live
 * database, in ONE idempotent, self-verifying pass — so member add / role
 * change / access-scope / Today-task saves stop failing with "column/relation
 * ... does not exist" one item at a time. Covers the three gaps found by the
 * code-vs-DB audit: app_users.scope, user_account_grants, today_tasks.
 *
 * Everything here is ADD ... IF NOT EXISTS / CREATE ... IF NOT EXISTS: strictly
 * additive, moves no data, safe to re-run. It prints the target DB (credentials
 * masked), applies the changes, then reads the catalog back and FAILS LOUDLY if
 * anything the app needs is still missing.
 *
 * Usage:  node scripts/align-app-users-schema.mjs
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
if (!conn) { console.error("✗ No DIRECT_DATABASE_URL or DATABASE_URL found in .env.local"); process.exit(1); }
console.log(`→ Connecting to: ${conn.replace(/(:\/\/)[^@]*@/, "$1USER:PASS@")}`);

const sql = postgres(conn, { max: 1, prepare: false, onnotice: () => {} });

// Every app_users column the code writes/reads, beyond the original
// {email,name,role,added_by_email,created_at}. All nullable TEXT → additive.
const APP_USER_COLUMNS = ["title", "department", "scope"];

try {
  // 1. app_users columns
  for (const col of APP_USER_COLUMNS) {
    await sql.unsafe(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS ${col} TEXT`);
  }

  // 2. user_account_grants table (+ PK + index) — accounts a 'selected'-scope
  //    member may reach. Matches schema.ts exactly.
  await sql`
    CREATE TABLE IF NOT EXISTS user_account_grants (
      user_email  TEXT NOT NULL,
      client_id   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_email, client_id)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS user_account_grants_user_idx ON user_account_grants (user_email)`;

  // 3. today_tasks table (+ index) — user-authored Today-board tasks. Also
  //    missing from production; adding a Today task would 42P01 without it.
  await sql`
    CREATE TABLE IF NOT EXISTS today_tasks (
      id                TEXT PRIMARY KEY,
      owner_email       TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      account_id        TEXT,
      project_id        TEXT,
      due_date          TIMESTAMPTZ,
      priority          TEXT NOT NULL DEFAULT 'normal',
      notes             TEXT,
      source_type       TEXT,
      source_id         TEXT,
      created_by_email  TEXT,
      status            TEXT NOT NULL DEFAULT 'open',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS today_tasks_owner_idx ON today_tasks (owner_email)`;

  // 4. Read the catalog back and assert everything the app needs is present.
  const cols = (await sql`
    select column_name from information_schema.columns where table_name = 'app_users'
  `).map((r) => r.column_name);
  const missingCols = APP_USER_COLUMNS.filter((c) => !cols.includes(c));
  const grantsExists = (await sql`select to_regclass('public.user_account_grants') as t`)[0].t !== null;
  const todayExists = (await sql`select to_regclass('public.today_tasks') as t`)[0].t !== null;

  console.log(`  app_users columns now: [${[...cols].sort().join(", ")}]`);
  console.log(`  user_account_grants table: ${grantsExists ? "present" : "MISSING"}`);
  console.log(`  today_tasks table: ${todayExists ? "present" : "MISSING"}`);

  const missing = [...missingCols, ...(grantsExists ? [] : ["user_account_grants"]), ...(todayExists ? [] : ["today_tasks"])];
  if (missing.length) {
    console.error(`✗ FAILED — still missing: ${missing.join(", ")}`);
    console.error("  These did not apply to THIS database. Confirm this URL is the same database your");
    console.error("  deployed app uses (Vercel → Project → Settings → Environment Variables → DATABASE_URL).");
    process.exit(2);
  }

  console.log("✓ Schema fully aligned with code. Member add / role change / access scope / Today tasks will all persist now.");
} catch (e) {
  console.error("✗ Migration errored:", e?.message || e);
  process.exit(3);
} finally {
  await sql.end();
}
