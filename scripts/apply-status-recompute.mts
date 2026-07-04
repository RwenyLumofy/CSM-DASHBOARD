/**
 * One-off: apply the new auto-computed lifecycle status (lib/status.ts) to
 * every existing client by running the real recomputeClient() against data
 * already in our DB — no HubSpot fetch involved. Run once, right after
 * migrate-churn-override.mjs, to roll the new status logic out to the
 * existing book without waiting for the next scheduled HubSpot sync.
 *
 * Usage: npx tsx scripts/apply-status-recompute.mts
 */
import { getClientsFromDb, recomputeClient } from "../lib/repo/drizzle";

const before = await getClientsFromDb();
console.log(`Recomputing status for ${before.length} clients...`);

let done = 0;
for (const c of before) {
  await recomputeClient(c.id);
  done++;
  if (done % 10 === 0) console.log(`  ${done}/${before.length}...`);
}

const after = await getClientsFromDb();
const beforeById = new Map(before.map((c) => [c.id, c.status]));
const changed = after.filter((c) => beforeById.get(c.id) !== c.status);
console.log(`\nDone. Recomputed ${done} clients, ${changed.length} status changes:`);
for (const c of changed) console.log(`  ${c.name.padEnd(30)} ${beforeById.get(c.id)} -> ${c.status}`);
process.exit(0);
