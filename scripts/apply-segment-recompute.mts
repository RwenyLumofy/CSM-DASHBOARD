/**
 * One-off: bring every account's segment back in line with its headcount.
 *
 * Until 2026-10-28 the segment was decided once, inside the HubSpot sync, from
 * HubSpot's own `numberofemployees`. A CSM correcting the headcount wrote the
 * new number and marked it overridden — and nothing ever revisited the
 * segment, so the row kept the one HubSpot's original number had implied.
 * Three accounts were sitting in production that way: 4,400 employees tagged
 * SMB, 250 tagged SMB, 110 tagged SMB.
 *
 * The code now keeps the two in step (lib/segment.ts), but only when something
 * recomputes the account — and a sales-only sync may not touch an account for
 * a long time. This heals the existing rows once.
 *
 * SAFE TO RE-RUN. It writes a segment only where the stored one disagrees with
 * the headcount, and never touches an account whose segment a human set by
 * hand (marked in __field_overrides) — that override is the escape hatch for a
 * local entity whose HubSpot record carries the global company's headcount.
 *
 * Usage: npx tsx --env-file=.env.local scripts/apply-segment-recompute.mts
 *        (add --dry to print the changes without writing)
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { fieldOverridesSet } from "../lib/client-overrides";
import { nextSegment } from "../lib/segment";
import type { Client } from "../lib/types";

const dry = process.argv.includes("--dry");
const db = getDb();

const rows = await db
  .select({
    id: schema.clients.id,
    name: schema.clients.name,
    employees: schema.clients.employees,
    segment: schema.clients.segment,
    properties: schema.clients.properties,
  })
  .from(schema.clients);

const changes = rows
  .map((r) => {
    const overridden = fieldOverridesSet(r.properties as Record<string, unknown> | undefined).has("segment");
    const next = nextSegment(r.employees, overridden, r.segment as Client["segment"] | null);
    return next ? { id: r.id, name: r.name, employees: r.employees, from: r.segment, to: next } : null;
  })
  .filter((c): c is NonNullable<typeof c> => c !== null);

console.log(`${rows.length} accounts · ${changes.length} segment${changes.length === 1 ? "" : "s"} to correct`);
for (const c of changes) {
  console.log(`   ${c.name}: ${c.employees ?? "no"} employees · ${c.from} → ${c.to}`);
}

if (dry) {
  console.log("\n--dry: nothing written.");
  process.exit(0);
}

for (const c of changes) {
  await db.update(schema.clients).set({ segment: c.to, updatedAt: new Date() }).where(eq(schema.clients.id, c.id));
}
console.log(changes.length ? `\nWrote ${changes.length}.` : "\nNothing to do.");
process.exit(0);
