/**
 * One-off: create client_usage_snapshots — the persisted, cron-refreshed
 * Metabase usage cache (see lib/db/schema.ts clientUsageSnapshots). Safe to
 * re-run.
 *
 * Usage: node scripts/add-usage-snapshots-table.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";

const envContent = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

await sql`
  CREATE TABLE IF NOT EXISTS client_usage_snapshots (
    client_id text PRIMARY KEY,
    environment_id text NOT NULL,
    region text NOT NULL,
    environment_name text,
    metrics jsonb NOT NULL,
    trends jsonb NOT NULL,
    learning jsonb NOT NULL,
    score jsonb NOT NULL,
    fetched_at timestamptz NOT NULL,
    sync_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;
console.log("client_usage_snapshots is ready.");

await sql.end();
