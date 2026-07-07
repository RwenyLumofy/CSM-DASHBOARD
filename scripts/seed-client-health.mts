/**
 * One-off: roll out the Client Health score builder (Settings → Workflows →
 * Client health) to an existing environment.
 *   1. Seeds the two new read-only, system-computed properties the formula
 *      depends on (use_cases_rollup, onboarding_period_days) — safe to
 *      re-run, upsertPropertyDefinition only refreshes label/options/sortOrder.
 *   2. Seeds the default formula config (all 8 metrics enabled, equal
 *      weight, 75/55 thresholds) into workspace_config, ONLY if nothing is
 *      stored yet — never overwrites an admin's saved formula.
 *
 * Does NOT call recomputeAllClientHealth() itself — that function's
 * getClientUsage() dependency (lib/usage/index.ts) is `"server-only"`-guarded,
 * so it throws immediately outside a real Next.js server context (this is a
 * plain tsx script). After this script finishes, trigger the recompute via
 * the running app instead:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/client-health
 * (or the deployed URL, once this is live). Also runs automatically every
 * day via vercel.json's cron schedule.
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-client-health.mts
 */
import { DEAL_FIELD_FALLBACK_OPTIONS } from "../lib/deal-overrides";
import { DEFAULT_CLIENT_HEALTH_CONFIG, CLIENT_HEALTH_CONFIG_KEY } from "../lib/metrics/health-config";
import { getWorkspaceConfigFromDb, setWorkspaceConfigDb, upsertPropertyDefinition } from "../lib/repo/drizzle";

console.log("1. Seeding read-only properties...");
await upsertPropertyDefinition({
  key: "use_cases_rollup",
  label: "Use Case(s)",
  type: "multi_select",
  options: DEAL_FIELD_FALLBACK_OPTIONS.useCases,
  hiddenOptions: [],
  group: "product",
  sortOrder: 35,
  isSystem: true,
  isReadOnly: true,
});
console.log("  ✓ use_cases_rollup");
await upsertPropertyDefinition({
  key: "onboarding_period_days",
  label: "Onboarding period (days)",
  type: "number",
  options: [],
  hiddenOptions: [],
  group: "dates",
  sortOrder: 55,
  isSystem: true,
  isReadOnly: true,
});
console.log("  ✓ onboarding_period_days");

console.log("\n2. Checking health formula config...");
const stored = await getWorkspaceConfigFromDb(CLIENT_HEALTH_CONFIG_KEY);
if (stored) {
  console.log("  · Already configured — left untouched.");
} else {
  await setWorkspaceConfigDb(CLIENT_HEALTH_CONFIG_KEY, DEFAULT_CLIENT_HEALTH_CONFIG);
  console.log("  ✓ Seeded default formula (8 metrics enabled, equal weight, 75/55 thresholds).");
}

console.log("\n✓ Properties + config ready. Now trigger a recompute via the running app:");
console.log("  curl -H \"Authorization: Bearer $CRON_SECRET\" http://localhost:3100/api/cron/client-health");
process.exit(0);
