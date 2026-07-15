/**
 * One-off: (1) force-refresh Al Dana Amphitheatre's usage now that its
 * mixpanel_company_id was corrected in HubSpot, (2) diagnose every other
 * non-churned client for the SAME class of issue (usage linking via
 * mixpanel_company_id, and Intercom NPS/CSAT/support linking via the
 * envId -> domain -> name chain) using the exact production matching code.
 *
 * Read-only for every client except Al Dana (whose usage snapshot this
 * legitimately force-refreshes, at the user's request). Usage: npx tsx
 * scripts/diagnose-usage-intercom-links.mjs
 */
import { readFileSync } from "fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  if (!line.includes("=") || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const { HubSpotClient } = await import("../lib/integrations/hubspot.ts");
const { MetabaseClient } = await import("../lib/integrations/metabase.ts");
const { IntercomClient } = await import("../lib/integrations/intercom.ts");
const postgres = (await import("postgres")).default;

const sql = postgres(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL, { max: 1 });
const hs = new HubSpotClient();
const mb = new MetabaseClient();
const ic = new IntercomClient();
const DB_ID = { aws: 4, ksa: 5 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// (Al Dana Amphitheatre's usage refresh is triggered separately via
// POST /api/usage-refresh, since lib/usage/index.ts imports "server-only"
// and can't run under a plain tsx script.)

// ── Step 2: usage-link diagnosis for every non-churned client ────────────
console.log(`\n${"=".repeat(72)}`);
console.log("STEP 2: Usage (Metabase) linking check — all non-churned clients");
console.log("=".repeat(72));

const clients = await sql`SELECT id, name, domain, hubspot_id, status FROM clients WHERE status != 'churned' ORDER BY name`;
console.log(`${clients.length} non-churned clients.`);

const usageIssues = [];
await mapLimit(clients, 6, async (c) => {
  if (!c.hubspot_id) { usageIssues.push({ client: c, reason: "no hubspot_id link at all" }); return; }
  let mixId = null;
  try {
    mixId = await hs.fetchCompanyMixpanelId(c.hubspot_id);
  } catch (e) {
    usageIssues.push({ client: c, reason: `HubSpot fetch failed: ${e}` });
    return;
  }
  if (!mixId) { usageIssues.push({ client: c, reason: "mixpanel_company_id is EMPTY in HubSpot" }); return; }
  if (!UUID_RE.test(mixId)) { usageIssues.push({ client: c, reason: `mixpanel_company_id is not a valid UUID: "${mixId}"` }); return; }
  let resolved = false;
  for (const region of ["aws", "ksa"]) {
    try {
      const rows = await mb.runNativeQuery(DB_ID[region], `SELECT name_en_us FROM public.environments_environment WHERE id = '${mixId}' LIMIT 1`);
      if (rows.length > 0) { resolved = true; break; }
    } catch { /* try next region */ }
  }
  if (!resolved) usageIssues.push({ client: c, reason: `mixpanel_company_id "${mixId}" does not match ANY environment in AWS or KSA Metabase — same class of bug as Al Dana` });
});

console.log(`\n${usageIssues.length} client(s) with a usage-linking problem:`);
for (const i of usageIssues) console.log(`  ${i.client.name} (${i.client.id}, ${i.client.status}) — ${i.reason}`);

// ── Step 3: Intercom NPS/CSAT/support linking check ───────────────────────
console.log(`\n${"=".repeat(72)}`);
console.log("STEP 3: Intercom (support/NPS/CSAT) linking check — all non-churned clients");
console.log("=".repeat(72));

const [icCompanies, contactIndex, conversations] = await Promise.all([
  ic.listCompanies(),
  ic.fetchContactCompanyIndex(),
  ic.searchConversations({}),
]);
console.log(`Fetched ${icCompanies.length} Intercom companies, ${conversations.length} conversations.`);

const convByCompany = new Map();
for (const conv of conversations) {
  const companyIds = new Set();
  for (const cid of conv.contactIds) for (const co of contactIndex.get(cid) ?? []) companyIds.add(co);
  for (const co of companyIds) {
    const list = convByCompany.get(co) ?? [];
    list.push(conv);
    convByCompany.set(co, list);
  }
}
const convsByEnvironmentId = new Map();
const convsByDomain = new Map();
const convsByName = new Map();
for (const co of icCompanies) {
  const convs = convByCompany.get(co.id) ?? [];
  if (co.companyId) {
    const key = co.companyId.trim().toLowerCase();
    convsByEnvironmentId.set(key, [...(convsByEnvironmentId.get(key) ?? []), ...convs]);
  }
  if (co.domain) {
    const key = co.domain.toLowerCase();
    convsByDomain.set(key, [...(convsByDomain.get(key) ?? []), ...convs]);
  }
  convsByName.set(co.name.toLowerCase(), [...(convsByName.get(co.name.toLowerCase()) ?? []), ...convs]);
}

const rows = await sql`SELECT receipt_id, company_external_id, company_intercom_id, user_id FROM survey_responses`;
const survByExternalId = new Map();
for (const r of rows) {
  if (!r.company_external_id) continue;
  const key = r.company_external_id.trim().toLowerCase();
  survByExternalId.set(key, (survByExternalId.get(key) ?? 0) + 1);
}
const survByCompanyCount = new Map();
for (const r of rows) {
  const companyIds = new Set();
  if (r.company_intercom_id) companyIds.add(r.company_intercom_id);
  else if (r.user_id) for (const co of contactIndex.get(r.user_id) ?? []) companyIds.add(co);
  for (const co of companyIds) survByCompanyCount.set(co, (survByCompanyCount.get(co) ?? 0) + 1);
}
const survByDomain = new Map();
const survByName = new Map();
for (const co of icCompanies) {
  const n = survByCompanyCount.get(co.id) ?? 0;
  if (n === 0) continue;
  if (co.domain) survByDomain.set(co.domain.toLowerCase(), (survByDomain.get(co.domain.toLowerCase()) ?? 0) + n);
  survByName.set(co.name.toLowerCase(), (survByName.get(co.name.toLowerCase()) ?? 0) + n);
}

const intercomIssues = [];
for (const c of clients) {
  if (!c.hubspot_id) { intercomIssues.push({ client: c, reason: "no hubspot_id link at all" }); continue; }
  let envId = null;
  try { envId = await hs.fetchCompanyMixpanelId(c.hubspot_id); } catch { /* fall through */ }

  const nameKey = c.name.toLowerCase();
  const domainKey = c.domain ? c.domain.toLowerCase() : null;
  const envKey = envId ? envId.trim().toLowerCase() : null;

  const convMatch = (envKey && convsByEnvironmentId.has(envKey)) ? "envId" : (domainKey && convsByDomain.has(domainKey)) ? "domain" : convsByName.has(nameKey) ? "name" : null;
  const survMatch = (envKey && survByExternalId.has(envKey)) ? "envId" : (domainKey && survByDomain.has(domainKey)) ? "domain" : survByName.has(nameKey) ? "name" : null;

  if (!convMatch && !survMatch) {
    intercomIssues.push({ client: c, reason: `NO match on envId/domain/name for conversations OR surveys (envId=${envId ?? "none"}, domain=${c.domain ?? "none"})` });
  } else if (envKey && convMatch !== "envId" && convMatch !== null) {
    intercomIssues.push({ client: c, reason: `envId "${envId}" didn't match, fell back to ${convMatch} for tickets (surveys: ${survMatch ?? "no match"}) — same class of bug as Al Dana, just masked by the fallback` });
  } else if (envKey && survMatch && survMatch !== "envId") {
    intercomIssues.push({ client: c, reason: `envId "${envId}" didn't match surveys, fell back to ${survMatch} (tickets: ${convMatch ?? "no match"})` });
  }
}

console.log(`\n${intercomIssues.length} client(s) with an Intercom linking problem:`);
for (const i of intercomIssues) console.log(`  ${i.client.name} (${i.client.id}, ${i.client.status}) — ${i.reason}`);

console.log(`\n${"=".repeat(72)}`);
console.log(`DONE. Usage issues: ${usageIssues.length}. Intercom issues: ${intercomIssues.length}.`);
console.log("=".repeat(72));

await sql.end();
