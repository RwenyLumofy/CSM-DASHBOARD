/**
 * One-off: create survey_responses — the append-only store of Intercom
 * outbound-survey answers (NPS + platform CSAT) that backs the Satisfaction
 * tab (see lib/db/schema.ts surveyResponses). Safe to re-run.
 *
 * Usage: node scripts/add-survey-responses-table.mjs
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
  CREATE TABLE IF NOT EXISTS survey_responses (
    receipt_id text PRIMARY KEY,
    survey_id text,
    user_id text,
    email text,
    name text,
    company_intercom_id text,
    company_external_id text,
    nps_score integer,
    csat_score integer,
    responded_at timestamptz,
    received_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS survey_responses_company_external_id_idx ON survey_responses (company_external_id)`;
await sql`CREATE INDEX IF NOT EXISTS survey_responses_company_intercom_id_idx ON survey_responses (company_intercom_id)`;
await sql`CREATE INDEX IF NOT EXISTS survey_responses_user_id_idx ON survey_responses (user_id)`;
console.log("survey_responses is ready.");

await sql.end();
