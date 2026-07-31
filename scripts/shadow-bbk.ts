/* Shadow-score a real account on Version 1.1 — no persistence, no UI. Fetches
   the account's real usage/support data, supplies a SAMPLE CS Pulse (the CSM
   input we don't capture yet), runs the engine, and prints the full result.
   Run:  node --import tsx scripts/shadow-bbk.ts [name-substring]        */
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

const needle = process.argv[2] || "bbk";

// A representative CS Pulse (this is the CSM judgment we'll capture in the form).
const SAMPLE_PULSE: CsPulseInput = {
  ratingsByMetricKey: {
    stakeholder_coverage_rating: "moderate",
    engagement_execution_rating: "strong",
    renewal_readiness_rating: "moderate",
  },
  singleThreaded: false,
  sponsorAccess: true,
  economicBuyerKnown: true,
  championLeft: false,
};

const [client] = await sql`select id, name, status, renewal_date, support from clients where name ilike ${"%" + needle + "%"} order by arr desc nulls last limit 1`;
if (!client) { console.log(`No client matching "${needle}"`); await sql.end(); process.exit(0); }
const [snap] = await sql`select metrics from client_usage_snapshots where client_id = ${client.id} limit 1`;
const [pc] = await sql`select count(*)::int c from client_contacts where client_id = ${client.id} and is_primary = true`;
await sql.end();

const facts = buildAccountFacts({
  clientId: client.id,
  status: client.status,
  renewalDate: client.renewal_date ? new Date(client.renewal_date).toISOString() : null,
  usage: (snap?.metrics as Record<string, number>) ?? null,
  support: client.support ? { csat: client.support.csat, csatResponses: client.support.csatResponses, nps: client.support.nps } : null,
  primaryContactCount: pc?.c ?? 0,
  pulse: SAMPLE_PULSE,
});

const r = calculateAccountHealth(MODEL_V1_1, facts, new Date().toISOString());

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
console.log(`\n════════ ${client.name}  (status: ${client.status}) ════════`);
console.log(`Calculated:  ${r.calculatedScore ?? "—"}  →  ${r.calculatedBand ?? "—"}`);
console.log(`APPLIED:     ${r.appliedStatus}${r.notAssessed ? `  (${r.notAssessedReason})` : ""}`);
console.log(`Coverage:    ${pct(r.dataCoverage)}  (${r.dataConfidence})     Momentum: ${r.momentum}`);
console.log(`Pulse scale: ${CS_PULSE_TIERS.map((t) => t.label).join(" / ")}   [sample pulse applied]`);
if (r.primaryRisk) console.log(`Primary risk: ${r.primaryRisk}`);
if (r.positiveDrivers.length) console.log(`\n+ Drivers: ${r.positiveDrivers.join(" · ")}`);
if (r.negativeDrivers.length) console.log(`− Drivers: ${r.negativeDrivers.join(" · ")}`);
if (r.activeStatusRules.length) console.log(`\nRules fired: ${r.activeStatusRules.map((x) => `${x.ruleName} → ${x.resultingStatus}`).join(", ")}`);

console.log(`\nComponent breakdown:`);
for (const c of r.components) {
  const w = `${Math.round(c.originalWeight * 100)}%`;
  console.log(`  ${c.name.padEnd(38)} ${(c.score ?? "—").toString().padStart(5)}  w=${w.padStart(4)}${c.isMissing ? "  [MISSING]" : ""}${c.fallbackUsed ? "  [fallback]" : ""}`);
  for (const ch of c.children ?? []) {
    console.log(`    · ${ch.name.padEnd(34)} ${(ch.score ?? "—").toString().padStart(5)}  w=${(Math.round(ch.originalWeight * 100) + "%").padStart(4)}${ch.isMissing ? "  [MISSING → redistributed]" : ""}`);
  }
}
console.log("");
