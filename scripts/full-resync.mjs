/**
 * Forces a full (non-incremental) sync WITHOUT wiping data: resets the
 * checkpoint to 2020-01-01 so every qualifying company is re-processed
 * (refreshing CSM, deals, engagement), then POSTs /api/sync.
 *
 * Usage: node scripts/full-resync.mjs
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

const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
await sql`
  INSERT INTO sync_checkpoints (key, value, updated_at)
  VALUES ('last_synced_at', '2020-01-01T00:00:00.000Z', NOW())
  ON CONFLICT (key) DO UPDATE SET value = '2020-01-01T00:00:00.000Z', updated_at = NOW()
`;
console.log("✓ Checkpoint reset to 2020-01-01 — full pass.");
await sql.end();

// The full sync takes ~5 min — longer than fetch's default headers timeout.
// The server keeps running after the client disconnects, so we FIRE the request
// and POLL the checkpoint (set at the end of runSync) to detect completion.
const url = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/api/sync";
const sql2 = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
const secret = env.CRON_SECRET || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Firing sync (server runs ~5 min; polling for completion)...");
fetch(url, { method: "POST", headers: secret ? { authorization: `Bearer ${secret}` } : {} }).catch(() => {});

let done = false;
for (let i = 0; i < 240; i++) { // up to 20 min
  await sleep(5000);
  const [row] = await sql2`SELECT value FROM sync_checkpoints WHERE key = 'last_synced_at'`;
  if (row && !row.value.startsWith("2020")) { done = true; break; }
  process.stdout.write(".");
}
console.log("");

if (!done) { console.error("✗ Timed out waiting for sync to finish."); await sql2.end(); process.exit(1); }

const [{ clients }] = await sql2`SELECT COUNT(*)::int AS clients FROM clients`;
const [{ deals }]   = await sql2`SELECT COUNT(*)::int AS deals FROM client_deals`;
const [{ withcsm }] = await sql2`SELECT COUNT(*)::int AS withcsm FROM clients WHERE csm IS NOT NULL`;
const [{ emails }]  = await sql2`SELECT COUNT(*)::int AS emails FROM client_emails`;
const [{ meetings }]= await sql2`SELECT COUNT(*)::int AS meetings FROM client_meetings`;
const [{ contacts }]= await sql2`SELECT COUNT(*)::int AS contacts FROM client_contacts`;
console.log(`\n✓ Sync complete:`);
console.log(`  Clients:    ${clients} (${withcsm} with CSM)`);
console.log(`  Deals:      ${deals}`);
console.log(`  Engagement: ${contacts} contacts, ${emails} emails, ${meetings} meetings`);
await sql2.end();
