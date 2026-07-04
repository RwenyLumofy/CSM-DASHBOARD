/**
 * Deletes any client rows (and all their associated data) where the HubSpot
 * company's customer_type is NOT "arr" OR lifecyclestage is NOT "customer".
 *
 * Only touches clients that have a hubspot_id — import-only rows are left alone.
 *
 * Usage:  node scripts/remove-otp-companies.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
const HUBSPOT_TOKEN = env.HUBSPOT_ACCESS_TOKEN;
const BASE = "https://api.hubapi.com";

async function hsPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// 1. Load all clients that have a HubSpot company ID
const rows = await sql`SELECT id, hubspot_id, name, source FROM clients WHERE hubspot_id IS NOT NULL`;
console.log(`Found ${rows.length} clients with a HubSpot ID`);

if (rows.length === 0) { await sql.end(); process.exit(0); }

// 2. Batch-read customer_type + lifecyclestage from HubSpot (100 at a time)
const props = new Map();
const chunks = [];
for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));

for (const chunk of chunks) {
  const data = await hsPost("/crm/v3/objects/companies/batch/read", {
    properties: ["customer_type", "lifecyclestage"],
    inputs: chunk.map((r) => ({ id: r.hubspot_id })),
  });
  for (const r of data.results) {
    props.set(r.id, {
      customerType: (r.properties.customer_type ?? "").toLowerCase(),
      lifecycle: (r.properties.lifecyclestage ?? "").toLowerCase(),
    });
  }
}

// 3. Find clients that fail the filter
const toDelete = rows.filter((r) => {
  const p = props.get(r.hubspot_id);
  if (!p) return false; // HubSpot didn't return it — skip (don't delete)
  return !p.customerType.includes("arr") || p.lifecycle !== "customer";
});

if (toDelete.length === 0) {
  console.log("✓ No OTP / non-customer companies found — nothing to delete.");
  await sql.end();
  process.exit(0);
}

console.log(`\nWill DELETE ${toDelete.length} company/companies:`);
for (const r of toDelete) {
  const p = props.get(r.hubspot_id);
  console.log(`  - ${r.name} (${r.id}, source=${r.source}) → customer_type="${p.customerType}" lifecycle="${p.lifecycle}"`);
}

// 4. Delete all associated data then the client row
for (const r of toDelete) {
  const id = r.id;
  await sql`DELETE FROM arr_events       WHERE client_id = ${id}`;
  await sql`DELETE FROM arr_snapshots    WHERE client_id = ${id}`;
  await sql`DELETE FROM client_contacts  WHERE client_id = ${id}`;
  await sql`DELETE FROM client_emails    WHERE client_id = ${id}`;
  await sql`DELETE FROM client_meetings  WHERE client_id = ${id}`;
  await sql`DELETE FROM client_deals     WHERE client_id = ${id}`;
  await sql`DELETE FROM playbook_tasks   WHERE client_id = ${id}`;
  await sql`DELETE FROM timeline_events  WHERE client_id = ${id}`;
  await sql`DELETE FROM clients          WHERE id        = ${id}`;
  console.log(`  ✓ Deleted ${r.name}`);
}

// 5. Final count
const [{ count }] = await sql`SELECT COUNT(*) FROM clients`;
console.log(`\n✓ Done. ${count} clients remaining.`);
await sql.end();
