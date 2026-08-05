#!/usr/bin/env node
/* =========================================================================
   Before-and-after: what does feeding the stakeholder roster into the health
   engine actually change?

   Read-only. Scores every migrated account twice against the SAME model — once
   with the roster withheld (the old behaviour) and once with it — and reports
   only the accounts whose applied status or score moved. Any unexpected
   difference is meant to be investigated, not accepted.
   ========================================================================= */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { buildAccountFacts } from "../lib/health/facts.ts";
import { calculateAccountHealth } from "../lib/health/engine.ts";
import { assembleModel } from "../lib/health/model-assembly.ts";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS, normalizePulse, pulseToEngineInput } from "../lib/health/pulse.ts";
import { normalizeStakeholderProfiles, PROFILES_KEY } from "../lib/stakeholders/profile.ts";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const sql = postgres(env.DATABASE_URL, { ssl: "require", max: 2 });

const clients = await sql`select id, name, status, renewal_date, properties from clients order by name`;
const contacts = await sql`select client_id, is_primary from client_contacts`;
await sql.end();

const primaryByClient = new Map();
for (const c of contacts) if (c.is_primary) primaryByClient.set(c.client_id, (primaryByClient.get(c.client_id) ?? 0) + 1);

const model = assembleModel(CS_PULSE_DIMENSIONS, CS_PULSE_TIERS);
const NOW = new Date();
const score = (cl, stakeholders) => {
  const props = cl.properties ?? {};
  const facts = buildAccountFacts({
    clientId: cl.id, status: cl.status,
    renewalDate: cl.renewal_date ? new Date(cl.renewal_date).toISOString() : null,
    usage: null, support: null, sentimentNps: null,
    primaryContactCount: primaryByClient.get(cl.id) ?? 0,
    stakeholders,
    pulse: pulseToEngineInput(normalizePulse(props.cs_pulse), CS_PULSE_DIMENSIONS, NOW.getTime()),
  }, NOW);
  return calculateAccountHealth(model, facts, NOW.toISOString());
};

const rows = [];
let considered = 0, unchanged = 0;
for (const cl of clients) {
  const profiles = normalizeStakeholderProfiles((cl.properties ?? {})[PROFILES_KEY]);
  if (!profiles.length) continue;
  considered++;
  const before = score(cl, []);
  const after = score(cl, profiles);
  const reasons = (r) => [...new Set((r.activeStatusRules ?? []).map((x) => x.reason))].sort().join(" | ");
  if (before.appliedStatus === after.appliedStatus && reasons(before) === reasons(after)) { unchanged++; continue; }
  rows.push({ name: cl.name, before: before.appliedStatus, after: after.appliedStatus, rb: reasons(before), ra: reasons(after) });
}

console.log(`\n=== Stakeholder roster -> health engine: before / after ===\n`);
console.log(`  ${considered} accounts now carry stakeholder profiles`);
console.log(`  ${unchanged} unchanged (same status, same reasons)`);
console.log(`  ${rows.length} changed\n`);
for (const r of rows) {
  console.log(`  ${r.name.slice(0, 44).padEnd(45)} ${r.before} -> ${r.after}`);
  const gone = r.rb.split(" | ").filter((x) => x && !r.ra.includes(x));
  const added = r.ra.split(" | ").filter((x) => x && !r.rb.includes(x));
  for (const g of gone) console.log(`       cleared:  ${g}`);
  for (const a of added) console.log(`       NEW:      ${a}`);
}
console.log();
