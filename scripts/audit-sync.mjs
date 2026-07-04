/**
 * Full integrity audit of synced HubSpot data:
 *  - checkpoint freshness, totals, CSM coverage
 *  - orphan rows (client_id not in clients)
 *  - cross-client leakage (same HubSpot object id under >1 client)
 *  - per-client spot-check vs HubSpot (contacts = company ∪ qualifying-deal assoc)
 *
 * Usage: node scripts/audit-sync.mjs
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
const TOKEN = env.HUBSPOT_ACCESS_TOKEN;
const BASE = "https://api.hubapi.com";
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });
const hsPost = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => { if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); });

console.log("════════ SYNC INTEGRITY AUDIT ════════\n");

// 1. Checkpoint
const [cp] = await sql`SELECT value, updated_at FROM sync_checkpoints WHERE key='last_synced_at'`;
console.log(`Checkpoint last_synced_at: ${cp?.value}`);
console.log(`  (written ${cp?.updated_at?.toISOString?.() ?? cp?.updated_at})`);

// 2. Totals + CSM
const [t] = await sql`SELECT
  (SELECT COUNT(*) FROM clients)::int AS clients,
  (SELECT COUNT(*) FROM clients WHERE csm IS NOT NULL)::int AS with_csm,
  (SELECT COUNT(*) FROM client_contacts)::int AS contacts,
  (SELECT COUNT(*) FROM client_emails)::int AS emails,
  (SELECT COUNT(*) FROM client_meetings)::int AS meetings,
  (SELECT COUNT(*) FROM client_deals)::int AS deals`;
console.log(`\nTotals: ${t.clients} clients (${t.with_csm} with CSM) | ${t.contacts} contacts | ${t.emails} emails | ${t.meetings} meetings | ${t.deals} deals`);

// 3. Orphans (child rows whose client_id no longer exists)
const orph = async (tbl) => (await sql`SELECT COUNT(*)::int AS n FROM ${sql(tbl)} x WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = x.client_id)`)[0].n;
console.log(`\nOrphan rows (client_id missing):`);
for (const tbl of ["client_contacts", "client_emails", "client_meetings", "client_deals", "arr_events"]) {
  console.log(`  ${tbl}: ${await orph(tbl)}`);
}

// 4. Cross-client leakage (same HubSpot object id mapped to >1 client)
const leak = async (tbl, col) => sql`SELECT ${sql(col)} AS hid, COUNT(DISTINCT client_id)::int AS clients FROM ${sql(tbl)} WHERE ${sql(col)} IS NOT NULL GROUP BY 1 HAVING COUNT(DISTINCT client_id) > 1`;
console.log(`\nCross-client leakage (same HubSpot id under >1 client):`);
for (const [tbl, col] of [["client_contacts", "hubspot_contact_id"], ["client_emails", "hubspot_email_id"], ["client_meetings", "hubspot_meeting_id"], ["client_deals", "hubspot_deal_id"]]) {
  const rows = await leak(tbl, col);
  console.log(`  ${tbl}: ${rows.length === 0 ? "none ✓" : rows.length + " LEAKED ⚠"}`);
}

// 5. Spot-check contacts vs HubSpot for a sample of companies
const DIRECT = "81ee3345-1b0f-42aa-9e78-580614546602", INDIRECT = "72831594", CS = "98749610";
const QUAL = { [DIRECT]: ["deal_registration_closed_won"], [INDIRECT]: ["140914462"], [CS]: ["180725914", "1362217384"] };
const sample = await sql`SELECT id, hubspot_id, name FROM clients WHERE name ILIKE ANY(ARRAY['%GPIC%','%Abudawood%','%Albawardi%','%Afniah%','%Almanea%']) ORDER BY name`;

console.log(`\nPer-company contact spot-check (app vs HubSpot company∪deal):`);
for (const c of sample) {
  const co = await hsPost(`/crm/v3/associations/companies/contacts/batch/read`, { inputs: [{ id: c.hubspot_id }] });
  const coIds = new Set((co.results[0]?.to ?? []).map((t) => t.id));
  const dl = await hsPost(`/crm/v3/associations/companies/deals/batch/read`, { inputs: [{ id: c.hubspot_id }] });
  const dealIds = (dl.results[0]?.to ?? []).map((t) => t.id);
  let qual = [];
  if (dealIds.length) {
    const dp = await hsPost(`/crm/v3/objects/deals/batch/read`, { properties: ["pipeline", "dealstage"], inputs: dealIds.map((id) => ({ id })) });
    qual = dp.results.filter((d) => (QUAL[d.properties.pipeline] ?? []).includes(d.properties.dealstage)).map((d) => d.id);
  }
  const dcIds = new Set();
  if (qual.length) {
    const da = await hsPost(`/crm/v3/associations/deals/contacts/batch/read`, { inputs: qual.map((id) => ({ id })) });
    for (const r of da.results) for (const tt of r.to) dcIds.add(tt.id);
  }
  const union = new Set([...coIds, ...dcIds]);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_contacts WHERE client_id = ${c.id}`;
  const match = n === union.size ? "✓" : "⚠ MISMATCH";
  console.log(`  ${c.name}: app=${n} | HubSpot company=${coIds.size}+deal-only=${union.size - coIds.size}=${union.size}  ${match}`);
}

await sql.end();
console.log(`\n════════ END AUDIT ════════`);
