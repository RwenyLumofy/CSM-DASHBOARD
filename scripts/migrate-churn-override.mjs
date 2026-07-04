/**
 * One-off: status is becoming auto-computed (see lib/status.ts) — the only
 * manual lever left is churn, stored under client.properties.__status_override.
 * Any client already sitting at status="churned" was set that way by a CSM
 * through the old free-choice dropdown; without this migration,
 * recomputeClient() would have no record of that manual decision and would
 * silently re-derive them back to onboarding/active/renewal on the next sync.
 * This stamps the override onto every currently-churned client so the manual
 * decision survives the switch-over. Safe to re-run (idempotent).
 *
 * Usage: node scripts/migrate-churn-override.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";

const envContent = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

const rows = await sql`
  UPDATE clients
  SET properties = properties || '{"__status_override": "churned"}'::jsonb
  WHERE status = 'churned' AND properties->>'__status_override' IS DISTINCT FROM 'churned'
  RETURNING id, name
`;
console.log(`Stamped __status_override=churned onto ${rows.length} client(s):`);
for (const r of rows) console.log(`  - ${r.name} (${r.id})`);

await sql.end();
