/**
 * Adds `title` and `department` (both nullable TEXT) to app_users so a person
 * can be entered once with their job title + department alongside their
 * permission tier — Phase 1 of the employees-list consolidation
 * (docs/employees-consolidation-spec.md). Strictly additive: no data moved,
 * nothing dropped, safe to re-run.
 *
 * Self-verifying: it prints which database it connected to (credentials
 * masked), runs the ALTERs, then reads information_schema straight back and
 * FAILS LOUDLY if the columns still aren't there — so a run can never *look*
 * successful without the columns actually landing.
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
if (!conn) { console.error("✗ No DIRECT_DATABASE_URL or DATABASE_URL found in .env.local"); process.exit(1); }

const masked = conn.replace(/(:\/\/)[^@]*@/, "$1USER:PASS@");
console.log(`→ Connecting to: ${masked}`);

// prepare:false keeps this safe even if the URL happens to be the transaction
// pooler (6543); onnotice silences the harmless "column already exists" chatter.
const sql = postgres(conn, { max: 1, prepare: false, onnotice: () => {} });

try {
  const before = await sql`
    select column_name from information_schema.columns
    where table_name = 'app_users' and column_name in ('title','department')
  `;
  console.log(`  app_users present before: [${before.map((r) => r.column_name).join(", ") || "neither"}]`);

  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS title TEXT`;
  await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department TEXT`;

  // Read back — the whole point. If these aren't both present now, the ALTER
  // did not take effect on THIS database and we must not report success.
  const after = await sql`
    select column_name from information_schema.columns
    where table_name = 'app_users' and column_name in ('title','department')
    order by column_name
  `;
  const names = after.map((r) => r.column_name);
  const ok = names.includes("title") && names.includes("department");

  if (!ok) {
    console.error(`✗ FAILED — after ALTER, app_users still only has: [${names.join(", ") || "neither"}]`);
    console.error("  The columns were NOT added to this database. Check that this URL is the same");
    console.error("  database your deployed app uses (Vercel → Project → Settings → Environment Variables → DATABASE_URL).");
    process.exit(2);
  }

  console.log("✓ app_users.title + app_users.department columns ready on this database.");
  console.log("  Go change a member's role now — it will persist.");
} catch (e) {
  console.error("✗ Migration errored:", e?.message || e);
  process.exit(3);
} finally {
  await sql.end();
}
