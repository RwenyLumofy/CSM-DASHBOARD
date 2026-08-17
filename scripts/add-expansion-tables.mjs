/**
 * Creates the four `expansion_*` tables — the expansion CRM for existing
 * clients (Account → Opportunity, four stages, three closed outcomes).
 * Strictly additive and idempotent: re-running it changes nothing.
 *
 * Nothing here touches `arr_events`. Closing an opportunity never writes to the
 * ARR ledger — see docs/specs/revenue/expansion-opportunities-specification.md.
 *
 * Usage:  node scripts/add-expansion-tables.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* process.env WINS over .env.local.
   This script previously read the file and nothing else, which made it unable to
   target production at all: .env.local holds TEST credentials, so
   `DIRECT_DATABASE_URL=<prod> node scripts/add-expansion-tables.mjs` silently
   re-ran against test and printed "✓ ready" while production stayed without the
   tables. A migration that reports success against the wrong database is worse
   than one that fails. */
let fileEnv = {};
try {
  const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  fileEnv = Object.fromEntries(
    envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
} catch {
  /* No .env.local (a CI or one-off run) — the environment must supply the URL. */
}

const conn =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL ||
  fileEnv.DIRECT_DATABASE_URL || fileEnv.DATABASE_URL;

if (!conn) {
  console.error("No database URL. Set DIRECT_DATABASE_URL or DATABASE_URL, or provide .env.local.");
  process.exit(1);
}

/* Say WHICH database is about to be changed, before changing it. The whole class
   of mistake above is invisible unless the target is printed. */
const target = (() => {
  try { const u = new URL(conn); return `${u.hostname}/${u.pathname.replace(/^\//, "") || "postgres"}`; }
  catch { return "an unparseable connection string"; }
})();
const source =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL ? "the environment" : ".env.local";
console.log(`→ target: ${target}  (from ${source})`);

const sql = postgres(conn, { max: 1 });

await sql`
  CREATE TABLE IF NOT EXISTS expansion_opportunities (
    id text PRIMARY KEY,
    client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    stage text NOT NULL DEFAULT 'identified',
    outcome text,
    expected_arr double precision,
    currency text NOT NULL DEFAULT 'USD',
    expansion_type text NOT NULL DEFAULT 'module',
    product text,
    owner_email text,
    expected_close_date date,
    confidence text,
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    stage_changed_at timestamptz NOT NULL DEFAULT now(),
    proposal_date date,
    outcome_date date,
    final_arr double precision,
    agreement_type text,
    confirmed_by text,
    arr_recorded boolean NOT NULL DEFAULT false,
    close_reason text,
    close_note text,
    created_by_email text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

/* An outcome is what CLOSED means. Enforced in the database, not only in the
   action, because "stage = closed with no outcome" and "outcome set on a live
   opportunity" both make the board lie about the pipeline. */
await sql`
  DO $$ BEGIN
    ALTER TABLE expansion_opportunities
      ADD CONSTRAINT expansion_outcome_iff_closed
      CHECK ((stage = 'closed') = (outcome IS NOT NULL));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

await sql`
  CREATE TABLE IF NOT EXISTS expansion_next_steps (
    id text PRIMARY KEY,
    opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
    text text NOT NULL,
    due_date date NOT NULL,
    created_by_email text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE TABLE IF NOT EXISTS expansion_notes (
    id text PRIMARY KEY,
    opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
    body text NOT NULL,
    author_email text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

await sql`
  CREATE TABLE IF NOT EXISTS expansion_activity (
    id text PRIMARY KEY,
    opportunity_id text NOT NULL REFERENCES expansion_opportunities(id) ON DELETE CASCADE,
    what text NOT NULL,
    actor_email text,
    at timestamptz NOT NULL DEFAULT now()
  )`;

await sql`CREATE INDEX IF NOT EXISTS expansion_opportunities_client_id_idx ON expansion_opportunities (client_id)`;
await sql`CREATE INDEX IF NOT EXISTS expansion_opportunities_stage_idx ON expansion_opportunities (stage)`;
await sql`CREATE INDEX IF NOT EXISTS expansion_next_steps_opportunity_idx ON expansion_next_steps (opportunity_id, due_date)`;
await sql`CREATE INDEX IF NOT EXISTS expansion_notes_opportunity_idx ON expansion_notes (opportunity_id, created_at)`;
await sql`CREATE INDEX IF NOT EXISTS expansion_activity_opportunity_idx ON expansion_activity (opportunity_id, at)`;

console.log("✓ expansion tables ready");
await sql.end();
