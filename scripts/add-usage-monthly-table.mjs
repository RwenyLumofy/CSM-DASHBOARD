/**
 * One-off: create client_usage_monthly — per-account usage HISTORY, one row per
 * client per calendar month (see lib/db/schema.ts clientUsageMonthly).
 * Safe to re-run.
 *
 * Backfill it afterwards with:
 *   npx tsx --env-file=.env.local scripts/backfill-usage-monthly.mts
 *
 * Usage: node scripts/add-usage-monthly-table.mjs
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
  CREATE TABLE IF NOT EXISTS client_usage_monthly (
    client_id text NOT NULL,
    month text NOT NULL,
    mau integer NOT NULL,
    wau integer,
    environment_id text,
    region text,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, month)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS client_usage_monthly_month_idx ON client_usage_monthly (month)`;

const [{ n }] = await sql`SELECT count(*)::int AS n FROM client_usage_monthly`;
console.log(`client_usage_monthly is ready (${n} rows).`);

await sql.end();
