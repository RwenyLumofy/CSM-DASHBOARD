/**
 * Import today's deals into contract records, and compare the ARR they give
 * with the ARR Signal shows today.
 *
 * Default is a DRY RUN: reads only, prints per-account differences and the
 * flags a person should review, and writes nothing. With --write it replaces
 * each account's imported records (ids ctr-hs-*, ctr-exp-*, ctr-churn-*) and
 * logs one "import" audit row per account. Records created in Signal after the
 * import are never touched.
 *
 * Rules: lib/contracts/import.ts (tested). ARR: lib/contracts/ledger.ts (tested).
 *
 * Usage:
 *   set -a; . ./.env.local; set +a
 *   npx tsx scripts/import-contract-records.mts            # dry run
 *   npx tsx scripts/import-contract-records.mts --write    # write to the target database
 */
import { and, eq, inArray, like, or } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { getClientsFromDb, getDealsByClient } from "../lib/repo/drizzle";
import { buildContractRecords } from "../lib/contracts/import";
import { arrOn } from "../lib/contracts/ledger";

const write = process.argv.includes("--write");
const today = new Date().toISOString().slice(0, 10);
const target = (() => { try { const u = new URL(process.env.DATABASE_URL ?? ""); return `${u.hostname} as ${u.username}`; } catch { return "unknown"; } })();
console.log(`→ ${write ? "WRITING to" : "dry run against"} ${target}`);

const db = getDb();
const clients = await getClientsFromDb();
const opps = await db.select().from(schema.expansionOpportunities).where(eq(schema.expansionOpportunities.outcome, "won"));

let differ = 0, liveToday = 0, liveNew = 0, churnedToday = 0, churnedNew = 0, recordCount = 0;
const flagged: string[] = [];
for (const c of clients) {
  const deals = await getDealsByClient(c.id);
  const { records, flags } = buildContractRecords({
    client: { id: c.id, status: c.status, churnedAt: c.churnedAt, currency: c.currency, properties: c.properties },
    deals,
    wonOpportunities: opps.filter((o) => o.clientId === c.id).map((o) => ({
      id: o.id, name: o.name, finalArr: o.finalArr, currency: o.currency, outcomeDate: o.outcomeDate, arrRecorded: o.arrRecorded, product: o.product,
    })),
  });
  recordCount += records.length;
  const arrNew = arrOn(records.map((r) => ({ id: r.id, kind: r.kind, start: r.startDate, amount: r.amount, licences: r.licences, currency: r.currency, counted: r.counted })), today);
  if (c.status === "churned") { churnedToday += c.arr; churnedNew += arrNew; } else { liveToday += c.arr; liveNew += arrNew; }
  if (Math.abs(arrNew - c.arr) > 1) {
    differ++;
    console.log(`  ${c.name.slice(0, 44).padEnd(44)} ${c.status.padEnd(10)} today ${Math.round(c.arr).toString().padStart(8)} → new ${Math.round(arrNew).toString().padStart(8)}`);
  }
  for (const f of flags) flagged.push(`${c.name}: ${f}`);

  if (write) {
    await db.transaction(async (tx) => {
      // Replace only what the import owns; records made in Signal later are kept.
      await tx.delete(schema.contractRecords).where(and(eq(schema.contractRecords.clientId, c.id), or(
        like(schema.contractRecords.id, "ctr-hs-%"), like(schema.contractRecords.id, "ctr-exp-%"), like(schema.contractRecords.id, "ctr-churn-%"))));
      if (records.length) {
        await tx.insert(schema.contractRecords).values(records.map((r) => ({
          ...r, oneTimeFees: [], startingModules: [], yearAmounts: null, supportAmount: null, createdBy: "import", updatedBy: "import",
        })));
      }
      await tx.insert(schema.contractAudit).values({ clientId: c.id, action: "import", actor: "import", after: { records: records.length, arr: arrNew, flags } });
    });
  }
}

console.log(`\n${clients.length} accounts · ${recordCount} records · ${differ} with a different ARR`);
console.log(`Live accounts:    today ${Math.round(liveToday)} · from contract records ${Math.round(liveNew)}`);
console.log(`Churned accounts: today ${Math.round(churnedToday)} · from contract records ${Math.round(churnedNew)}`);
console.log(`\n${flagged.length} flags to review:`);
for (const f of flagged) console.log(`  - ${f}`);
if (write) {
  const n = await db.select({ id: schema.contractRecords.id }).from(schema.contractRecords).where(inArray(schema.contractRecords.clientId, clients.map((c) => c.id)));
  console.log(`\n✓ wrote; contract_records now holds ${n.length} rows for these accounts`);
}
process.exit(0);
