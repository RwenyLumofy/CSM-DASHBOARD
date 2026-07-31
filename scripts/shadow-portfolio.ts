/* Shadow-score the whole portfolio on Version 1.1 and dump JSON for the health
   dashboard preview. Real usage/support/sentiment; a uniform SAMPLE CS Pulse
   (the input we don't capture yet). No persistence.
   Run: node --import tsx scripts/shadow-portfolio.ts > /tmp/portfolio-health.json */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { calculateAccountHealth } from "../lib/health/engine";
import { MODEL_V1_1, CS_PULSE_TIERS } from "../lib/health/model-v1";
import { buildAccountFacts, type CsPulseInput } from "../lib/health/facts";

const require = createRequire(import.meta.url);
const postgres = require("postgres");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const PULSE: CsPulseInput = {
  ratingsByMetricKey: { stakeholder_coverage_rating: "moderate", engagement_execution_rating: "strong", renewal_readiness_rating: "moderate" },
  singleThreaded: false, sponsorAccess: true, economicBuyerKnown: true, championLeft: false,
};

const clients = await sql`select id, name, status, renewal_date, support, arr from clients where status <> 'onboarding' order by arr desc nulls last`;
const snaps = await sql`select client_id, metrics from client_usage_snapshots`;
const contacts = await sql`select client_id, count(*)::int c from client_contacts where is_primary = true group by client_id`;
await sql.end();

const snapBy = new Map(snaps.map((s: any) => [s.client_id, s.metrics]));
const pcBy = new Map(contacts.map((c: any) => [c.client_id, c.c]));

const out = [];
for (const c of clients) {
  const facts = buildAccountFacts({
    clientId: c.id, status: c.status,
    renewalDate: c.renewal_date ? new Date(c.renewal_date).toISOString() : null,
    usage: (snapBy.get(c.id) as Record<string, number>) ?? null,
    support: c.support ? { csat: c.support.csat, csatResponses: c.support.csatResponses, nps: c.support.nps } : null,
    primaryContactCount: (pcBy.get(c.id) as number | undefined) ?? 0,
    pulse: PULSE,
  });
  const r = calculateAccountHealth(MODEL_V1_1, facts, new Date().toISOString());
  out.push({
    name: c.name, status: c.status, arr: c.arr ?? 0,
    score: r.calculatedScore, band: r.calculatedBand, applied: r.appliedStatus,
    coverage: r.dataCoverage, confidence: r.dataConfidence, momentum: r.momentum,
    notAssessed: r.notAssessed, primaryRisk: r.primaryRisk,
    positive: r.positiveDrivers, negative: r.negativeDrivers,
    components: r.components.map((cc) => ({
      name: cc.name, score: cc.score, weight: cc.originalWeight, missing: cc.isMissing,
      children: (cc.children ?? []).map((ch) => ({ name: ch.name, score: ch.score, weight: ch.originalWeight, missing: ch.isMissing, source: (ch.metrics ?? [])[0]?.source ?? null })),
    })),
  });
}

console.log(JSON.stringify({ model: `${MODEL_V1_1.modelName} v${MODEL_V1_1.version}`, tiers: CS_PULSE_TIERS.map((t) => t.label), count: out.length, accounts: out }, null, 0));
