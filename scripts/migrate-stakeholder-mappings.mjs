#!/usr/bin/env node
/* =========================================================================
   Backfill the Communication tab's stakeholder matrix into stakeholder
   profiles.

   DRY RUN IS THE DEFAULT. Nothing is written unless --apply is passed. The
   report it prints in dry-run mode is exactly the report it prints after
   applying, so the two can be diffed.

   SAFE TO RE-RUN. Every profile it writes carries the legacy key it came
   from; a second pass matches on that and writes nothing. A profile a person
   created is reconciled — its roles gain the legacy ones, and not one other
   field is touched.

   NON-DESTRUCTIVE. clients.properties.stakeholder_mappings is left exactly as
   it is. It stays as rollback evidence until the cutover is accepted; dropping
   it is a separate, explicitly reviewed change.

     npx tsx scripts/migrate-stakeholder-mappings.mjs                     # dry run, test db
     npx tsx scripts/migrate-stakeholder-mappings.mjs --production        # dry run, production
     npx tsx scripts/migrate-stakeholder-mappings.mjs --production --apply
     npx tsx scripts/migrate-stakeholder-mappings.mjs --client=<id>
     npx tsx scripts/migrate-stakeholder-mappings.mjs --database-url=<url>
   ========================================================================= */

import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { planClientMigration } from "../lib/stakeholders/migrate.ts";
import { normalizeStakeholderProfiles, PROFILES_KEY } from "../lib/stakeholders/profile.ts";
import { normalizeStakeholderMappings } from "../lib/stakeholders.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = args.find((a) => a.startsWith("--client="))?.split("=")[1] ?? null;
const EXCEPTIONS_OUT = args.find((a) => a.startsWith("--exceptions="))?.split("=")[1] ?? null;

const DB_URL = (() => {
  /* An explicit --database-url wins, so production is named at the call site
     rather than by editing .env.local — which would otherwise leave that file
     pointed at production for whatever runs next. Falls back to .env.local. */
  const flag = args.find((a) => a.startsWith("--database-url="))?.slice("--database-url=".length);
  if (flag) return flag;
  /* `--production` reads CLONE_SOURCE_URL from .env.clone — the file that
     already names production for the clone script. It exists so nobody has to
     paste a database URL onto a command line, where it lands in shell history.
     It is not a shortcut past the safety rail: --apply is still required, and
     the connected host is still printed before anything runs. */
  const file = args.includes("--production") ? ".env.clone" : ".env.local";
  const key = file === ".env.clone" ? "CLONE_SOURCE_URL" : "DATABASE_URL";
  const env = Object.fromEntries(
    readFileSync(file, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
  const url = env[key];
  if (!url) throw new Error(`${key} not found in ${file}`);
  return url;
})();
/** Host only, credentials stripped — printed so a wrong-database run is
 *  obvious in the first three lines rather than after it has written. */
const DB_LABEL = `${process.argv.includes("--production") ? "PRODUCTION  " : ""}${DB_URL.replace(/\/\/[^@]*@/, "//***@").split("?")[0]}`;

const sql = postgres(DB_URL, { ssl: "require", max: 3 });
const NOW = new Date().toISOString();

console.log(`\n=== Stakeholder mapping backfill — ${APPLY ? "APPLY" : "DRY RUN"} ===`);
console.log(`    ${NOW}${ONLY ? `  ·  client ${ONLY}` : ""}`);
console.log(`    db: ${DB_LABEL}\n`);

const clients = ONLY
  ? await sql`select id, name, properties from clients where id = ${ONLY}`
  : await sql`select id, name, properties from clients order by name`;
const contactRows = await sql`select id, client_id, first_name, last_name, email, job_title, phone from client_contacts`;
const staffRows = await sql`select id, email from app_users`.catch(() => []);

const contactsByClient = new Map();
for (const c of contactRows) {
  const list = contactsByClient.get(c.client_id) ?? [];
  list.push({ id: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, jobTitle: c.job_title, phone: c.phone });
  contactsByClient.set(c.client_id, list);
}
const staffEmails = Object.fromEntries(staffRows.filter((s) => s.email).map((s) => [s.id, s.email]));

const T = { clients: 0, created: 0, reconciled: 0, unchanged: 0, roles: 0, exceptions: [], failed: [], written: 0 };

for (const cl of clients) {
  const props = cl.properties ?? {};
  const mappings = normalizeStakeholderMappings(props.stakeholder_mappings);
  if (!mappings.some((m) => m.contactIds.length)) continue;

  let plan;
  try {
    plan = planClientMigration({
      clientId: cl.id, clientName: cl.name, mappings,
      contacts: contactsByClient.get(cl.id) ?? [],
      existing: normalizeStakeholderProfiles(props[PROFILES_KEY]),
      staffEmails, now: NOW,
      newId: () => `sh_${randomUUID()}`,
    });
  } catch (err) {
    // One client's bad blob must not stop the other 30.
    T.failed.push({ client: cl.name, error: String(err?.message ?? err) });
    continue;
  }

  T.clients++;
  T.created += plan.created; T.reconciled += plan.reconciled;
  T.unchanged += plan.unchanged; T.roles += plan.rolesPreserved;
  T.exceptions.push(...plan.exceptions);

  const flag = plan.exceptions.length ? " !" : "  ";
  console.log(`${flag} ${cl.name.slice(0, 46).padEnd(47)} +${String(plan.created).padStart(2)} new  ~${String(plan.reconciled).padStart(2)} merged  =${String(plan.unchanged).padStart(2)} same  ${plan.rolesPreserved} roles`);

  if (!APPLY || !plan.upserts.length) continue;

  /* One statement per client: the whole account's profile set is replaced
     atomically, so a mid-run failure can never leave one account holding half
     a migration. `properties || patch` is the same merge every other writer
     uses, so a concurrent edit to an unrelated key is not clobbered. */
  try {
    const existing = normalizeStakeholderProfiles(props[PROFILES_KEY]);
    const byId = new Map(existing.map((p) => [p.id, p]));
    for (const u of plan.upserts) byId.set(u.id, u);
    const next = [...byId.values()];
    await sql`
      update clients
         set properties = coalesce(properties, '{}'::jsonb) || ${sql.json({ [PROFILES_KEY]: next })}
       where id = ${cl.id}`;
    T.written += plan.upserts.length;
  } catch (err) {
    T.failed.push({ client: cl.name, error: String(err?.message ?? err) });
  }
}

await sql.end();

const line = (k, v) => console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`\n--- ${APPLY ? "applied" : "would apply"} ---`);
line("clients with legacy mappings", T.clients);
line("profiles created", T.created);
line("existing profiles reconciled", T.reconciled);
line("already migrated, untouched", T.unchanged);
line("role associations preserved", T.roles);
line("profiles written", APPLY ? T.written : 0);
line("exceptions for review", T.exceptions.length);
line("clients that failed", T.failed.length);

if (T.exceptions.length) {
  console.log("\n--- exceptions ---");
  for (const e of T.exceptions.slice(0, 20))
    console.log(`  ${e.clientName}: [${e.legacyRole}] ${e.reason}\n      -> ${e.resolution}`);
  if (T.exceptions.length > 20) console.log(`  ... and ${T.exceptions.length - 20} more`);
}
if (T.failed.length) {
  console.log("\n--- failures (safe to re-run; nothing partial was written) ---");
  for (const f of T.failed) console.log(`  ${f.client}: ${f.error}`);
}
if (EXCEPTIONS_OUT) {
  writeFileSync(EXCEPTIONS_OUT, JSON.stringify({ ranAt: NOW, applied: APPLY, totals: { ...T, exceptions: T.exceptions.length }, exceptions: T.exceptions, failed: T.failed }, null, 2));
  console.log(`\n  exception report -> ${EXCEPTIONS_OUT}`);
}
console.log(APPLY ? "\n  Legacy stakeholder_mappings left untouched as rollback evidence.\n" : "\n  Nothing was written. Re-run with --apply.\n");
process.exit(T.failed.length ? 1 : 0);
