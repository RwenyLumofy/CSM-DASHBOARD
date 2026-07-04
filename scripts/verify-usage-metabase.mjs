/**
 * Acceptance test for the Usage-tab SQL against LIVE Metabase, exercising the
 * real MetabaseClient.runNativeQuery code path. Runs the shipped SNAPSHOT_SQL +
 * TREND_SQL for the BBK environment (db 4 / AWS) and asserts the numbers
 * validated during metric mapping.
 *
 * Prereqs in .env.local: METABASE_URL + METABASE_API_KEY (native-query perm).
 * Usage: npx tsx scripts/verify-usage-metabase.mjs
 */
import { readFileSync } from "fs";

// tsx doesn't auto-load .env.local; populate process.env BEFORE importing config-dependent modules.
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  if (!line.includes("=") || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

if (!process.env.METABASE_URL || !process.env.METABASE_API_KEY) {
  console.log("METABASE_URL / METABASE_API_KEY not set in .env.local — add them, then re-run.");
  process.exit(0);
}

const { SNAPSHOT_SQL, TREND_SQL } = await import("../lib/usage/queries.ts");
const { MetabaseClient } = await import("../lib/integrations/metabase.ts");

const BBK = "2559da93-06ce-4258-9b2d-26c456af704b";
const AWS_DB = 4;
const withEnv = (sql) => sql.replaceAll(":ENV_ID", `'${BBK}'`);
const mb = new MetabaseClient();

console.log("Running SNAPSHOT_SQL for BBK (AWS db)…");
const snapRows = await mb.runNativeQuery(AWS_DB, withEnv(SNAPSHOT_SQL));
const snap = snapRows[0] ?? {};
const get = (k) => { const kk = Object.keys(snap).find((x) => x.toLowerCase() === k); return kk ? Number(snap[kk]) : undefined; };

const EXPECT = {
  mau: 27, total_users: 53, seats: 52, competencies_total: 62,
  competencies_ai_generated: 60, sessions_created: 1,
  learning_enrollments: 0, pm_cycles_configured: 0,
};
let pass = 0, fail = 0;
for (const [k, exp] of Object.entries(EXPECT)) {
  const got = get(k);
  const ok = got === exp;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${k}: got ${got}, expected ${exp}`);
  ok ? pass++ : fail++;
}
console.log("\nFull snapshot row:", snap);

console.log("\nRunning TREND_SQL for BBK…");
const trend = await mb.runNativeQuery(AWS_DB, withEnv(TREND_SQL));
console.log(`  trend rows: ${trend.length}; metrics:`, [...new Set(trend.map((r) => r.metric))].join(", "));
console.log(
  "  active_users monthly:",
  trend.filter((r) => r.metric === "active_users").map((r) => `${String(r.month).slice(0, 7)}=${r.value}`).join(", "),
);

console.log(`\n${fail === 0 ? "ALL SNAPSHOT ASSERTIONS PASSED" : `${fail} assertion(s) FAILED`} (${pass}/${pass + fail}).`);
process.exit(fail === 0 ? 0 : 1);
