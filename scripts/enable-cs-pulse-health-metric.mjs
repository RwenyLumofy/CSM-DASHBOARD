#!/usr/bin/env node
/* =========================================================================
   Add `cs_pulse` to an already-configured workspace's health formula.

   WHY THIS IS MANDATORY, NOT OPTIONAL. getClientHealthConfig
   (lib/assignment/config.ts) builds the config by mapping HEALTH_METRIC_ORDER
   over whatever is stored, falling back to `{ enabled: false, weight: 0 }` for
   any key the stored formula does not mention. That fallback exists for a good
   reason — a new metric must never silently re-weight an admin's tuned formula.
   The consequence here is that shipping cs_pulse to a workspace that has ever
   saved a formula lands it SWITCHED OFF at weight 0: the release appears to
   have worked and nothing changes until somebody opens Settings.

   A workspace that has NEVER saved a formula needs nothing — it reads
   DEFAULT_CLIENT_HEALTH_CONFIG, which already includes cs_pulse.

   WEIGHT. 37.5 against the nine measured metrics at 12.5 is a 25% share,
   matching the weight MODEL_V1_1 already gives CS Pulse. Carried over rather
   than invented. If an admin has retuned the other weights, this preserves the
   same 25% RATIO against whatever they now sum to, rather than pasting 37.5 in
   and quietly changing what Pulse is worth relative to their formula.

   Does not recompute any score — client health is recomputed by the nightly
   cron (app/api/cron/client-health) and by saving the formula in Settings.
   Run one of those afterwards, or wait for the nightly.

   Dry run by default. Pass --yes to write, --prod to target production.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--yes");
const KEY = "client_health_formula";
const PULSE_SHARE = 0.25; // of the total enabled weight, per MODEL_V1_1

const url = (() => {
  if (process.argv.includes("--prod")) {
    const f = readFileSync(new URL("../.env.clone", import.meta.url), "utf8");
    const u = f.match(/^CLONE_SOURCE_URL="?([^"\n]+)"?/m)?.[1];
    if (!u) { console.error("No CLONE_SOURCE_URL in .env.clone"); process.exit(1); }
    return u;
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  return f.match(/^DATABASE_URL="([^"]+)"/m)?.[1];
})();
if (!url) { console.error("No database URL."); process.exit(1); }
console.log(`→ database: ${url.match(/db\.([a-z0-9]{20})\.supabase/)?.[1] ?? url.match(/postgres\.([a-z0-9]{20})[:@]/)?.[1] ?? "(unidentified)"}\n`);

const sql = postgres(url, { prepare: false, max: 1 });
const rows = await sql`select value from workspace_config where key = ${KEY}`;
const stored = rows[0]?.value ?? null;

if (!stored || !Array.isArray(stored.metrics)) {
  console.log("No stored health formula — this workspace reads the default, which already");
  console.log("includes cs_pulse. Nothing to migrate.");
  await sql.end();
  process.exit(0);
}

const metrics = [...stored.metrics];
const existing = metrics.find((m) => m.key === "cs_pulse");
if (existing) {
  console.log(`cs_pulse is already in the stored formula — enabled=${existing.enabled}, weight=${existing.weight}.`);
  console.log("Leaving it exactly as it is: an admin's own choice is not something to overwrite.");
  await sql.end();
  process.exit(0);
}

/* Solve for the weight that gives Pulse a 25% share of the enabled total:
     w / (enabledTotal + w) = 0.25   →   w = enabledTotal / 3
   Using the admin's own numbers rather than a hard-coded 37.5, so a workspace
   that has retuned its weights gets the same RATIO, not a stranger's constant. */
const enabledTotal = metrics.filter((m) => m.enabled).reduce((s, m) => s + (Number(m.weight) || 0), 0);
const weight = enabledTotal > 0 ? Math.round((enabledTotal / 3) * 10) / 10 : 37.5;

console.log(`stored metrics: ${metrics.length}   enabled weight total: ${enabledTotal}`);
console.log(`would add: cs_pulse  enabled=true  weight=${weight}  (${Math.round((weight / (enabledTotal + weight)) * 100)}% share)`);
console.log(`           params.validityDays = 30\n`);
console.log("Every account's health is unchanged until a recompute runs. Accounts with a");
console.log("current Pulse will then move; accounts without one will not move at all,");
console.log("because a missing metric is skipped and the remaining weights renormalise.");

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Add --yes to apply.");
  await sql.end();
  process.exit(0);
}

metrics.push({ key: "cs_pulse", enabled: true, weight, params: { validityDays: 30 } });
await sql`
  insert into workspace_config (key, value, updated_at)
  values (${KEY}, ${sql.json({ ...stored, metrics })}, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()`;

console.log("\nWritten. Run the client-health cron or re-save the formula in Settings to recompute.");
await sql.end();
