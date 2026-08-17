/**
 * Seeds the real expansion pipeline as supplied on 2026-08-13.
 *
 * Estimated ARR, opportunity text, stage and confidence are exactly as given.
 * OWNER, NEXT STEP and EXPECTED CLOSE ARE ABSENT FROM THE SOURCE and are left
 * empty rather than invented — which is itself the finding. Expect every row to
 * read "needs attention" on day one; that is the gap the page exists to close,
 * not a bug.
 *
 * Idempotent: a row is matched on (client_id, name) and skipped if present, so
 * re-running never duplicates and never overwrites a CSM's later edits.
 *
 * Accounts are matched by name against `clients`. An entry whose account is not
 * in Signal is REPORTED AND SKIPPED, never created: expansion is by definition
 * into an existing client, and inventing the account to hold the opportunity
 * would put a fictional customer in the account book.
 *
 * Usage:  node scripts/seed-expansion-pipeline.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* process.env WINS over .env.local — see the same note in
   add-expansion-tables.mjs. Reading only the file made this script incapable of
   seeding anything but the test database, while reporting success. */
let fileEnv = {};
try {
  const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
  fileEnv = Object.fromEntries(
    envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
} catch {
  /* No .env.local — the environment must supply the URL. */
}

const conn =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL ||
  fileEnv.DIRECT_DATABASE_URL || fileEnv.DATABASE_URL;

if (!conn) {
  console.error("No database URL. Set DIRECT_DATABASE_URL or DATABASE_URL, or provide .env.local.");
  process.exit(1);
}

/* This one WRITES BUSINESS DATA, so it says where before it does. */
const target = (() => {
  try { const u = new URL(conn); return `${u.hostname}/${u.pathname.replace(/^\//, "") || "postgres"}`; }
  catch { return "an unparseable connection string"; }
})();
console.log(`→ seeding: ${target}  (from ${process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL ? "the environment" : ".env.local"})\n`);

const sql = postgres(conn, { max: 1 });

const AS_OF = "2026-08-13";

/**
 * `match` is an ILIKE pattern tried against clients.name AND clients.domain.
 *
 * The pipeline names accounts informally ("MEWA", "Neo Space") and the account
 * book does not. Domain is part of the match because Sawaeed is stored under
 * its ARABIC name (سواعد) — a name-only matcher silently skipped it, which is
 * the worst possible failure here: a real opportunity quietly absent from a
 * board whose entire purpose is that no motion is invisible.
 */
const PIPELINE = [
  {
    match: "%Ministry of Environment%MEWA%", account: "MEWA",
    name: "Expand to 3,000 users across the Ministry",
    description: "Proposal sent; cybersecurity requirements under discussion.",
    stage: "proposed", expectedArr: 116550, expansionType: "licences", product: "Develop",
    confidence: "high", proposalDate: AS_OF,
  },
  {
    match: "%neo space%", account: "Neo Space",
    name: "Add ~500 Geo Spatial users",
    description: "Delayed with Procurement; timing remains uncertain.",
    stage: "proposed", expectedArr: 51976, expansionType: "licences", product: "Develop + Perform",
    confidence: "medium", proposalDate: AS_OF,
  },
  {
    // The account book holds this one under its Arabic name; the pipeline
    // spreadsheet transliterates it. A name match on "sawaeed" finds nothing,
    // so match the Arabic name and, as a second route, the domain.
    match: "%سواعد%", domain: "%sawaeed%", account: "Sawaeed (سواعد)",
    name: "Expand from 500 to 550–700 users",
    description: "Part of the upcoming renewal. Final user count pending confirmation. ARR is based on the maximum potential expansion — 200 users at the previous deal price.",
    stage: "qualified", expectedArr: 26500, expansionType: "licences", product: "Develop",
    confidence: "high", proposalDate: null,
  },
  {
    match: "%GCCIA%", account: "GCCIA",
    name: "Expand Perform to the existing 130 users",
    description: "Two PM Cycle simulations completed; requirements are with Product for review.",
    stage: "qualified", expectedArr: 5460, expansionType: "module", product: "Perform",
    confidence: "medium", proposalDate: null,
  },
  {
    match: "%Arla%", account: "Arla Foods",
    name: "Expansion to KSA users",
    description: "650 users estimated in total. Direction expected to become clearer during September renewal discussions.",
    stage: "identified", expectedArr: 24668, expansionType: "geography", product: "Develop",
    confidence: "low", proposalDate: null,
  },
  {
    match: "%Arla%", account: "Arla Foods",
    name: "POKA integration",
    description: "Initial discussion held with Arla and POKA in May. Paused while the key stakeholder was on leave; recently resumed.",
    // Null ARR is legitimate: a real motion nobody has sized yet.
    stage: "identified", expectedArr: null, expansionType: "use_case", product: null,
    confidence: "low", proposalDate: null,
  },
  {
    match: "%Radwa%", account: "Saudi Radwa",
    name: "Content development — video animation",
    description: null,
    stage: "identified", expectedArr: 4000, expansionType: "content", product: null,
    confidence: "low", proposalDate: null,
  },
];

let created = 0, skipped = 0;
const missing = [];

for (const row of PIPELINE) {
  const [client] = await sql`
    SELECT id, name, currency FROM clients
    WHERE name ILIKE ${row.match} OR domain ILIKE ${row.domain ?? row.match}
    ORDER BY name LIMIT 1`;
  if (!client) {
    missing.push(row);
    continue;
  }

  const [existing] = await sql`
    SELECT id FROM expansion_opportunities
    WHERE client_id = ${client.id} AND name = ${row.name} LIMIT 1`;
  if (existing) {
    skipped += 1;
    continue;
  }

  const id = `exp-${randomUUID()}`;
  await sql`
    INSERT INTO expansion_opportunities (
      id, client_id, name, description, stage, outcome, expected_arr, currency,
      expansion_type, product, owner_email, expected_close_date, confidence,
      last_activity_at, stage_changed_at, proposal_date, created_by_email, created_at
    ) VALUES (
      ${id}, ${client.id}, ${row.name}, ${row.description}, ${row.stage}, NULL,
      ${row.expectedArr}, ${client.currency || "USD"}, ${row.expansionType}, ${row.product},
      NULL, NULL, ${row.confidence},
      ${`${AS_OF}T00:00:00Z`}, ${`${AS_OF}T00:00:00Z`}, ${row.proposalDate}, NULL, ${`${AS_OF}T00:00:00Z`}
    )`;
  await sql`
    INSERT INTO expansion_activity (id, opportunity_id, what, actor_email, at)
    VALUES (${`exa-${randomUUID()}`}, ${id}, 'Imported from the expansion pipeline', NULL, ${`${AS_OF}T00:00:00Z`})`;
  created += 1;
  console.log(`  + ${client.name} — ${row.name}`);
}

console.log(`\n✓ ${created} created, ${skipped} already present`);
if (missing.length) {
  console.log(`\n⚠ ${missing.length} not seeded — no such account in Signal:`);
  for (const m of missing) console.log(`  · ${m.account} — ${m.name}`);
  console.log("\n  Expansion is always into an existing client. Add the account first,");
  console.log("  then create the opportunity from the board.");
}

await sql.end();
