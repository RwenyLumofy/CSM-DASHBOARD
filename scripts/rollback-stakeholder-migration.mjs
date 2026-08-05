#!/usr/bin/env node
/* =========================================================================
   Reverse the stakeholder-mapping backfill.

   WHAT IT REMOVES. Only profiles the migration created — `source: "migration"`
   with a `migration.legacyKey`. A profile somebody typed is never touched, and
   neither is `stakeholder_mappings`, which the backfill left exactly as it
   found it.

   WHAT IT CANNOT CLEANLY REVERSE. A profile the backfill RECONCILED — one that
   already existed and had legacy roles merged into it — carries a person's own
   data, so deleting it would destroy their work. Removing just the merged roles
   is not safe either: once reconciled, nothing distinguishes a role the
   migration added from one the CSM added afterwards. Those are reported for
   manual reversal rather than guessed at.

   That distinction is why the rollback window matters. At the time of writing
   the production run reconciles nothing — there are no pre-existing profiles —
   so a rollback is exact. Every profile created by hand after the migration
   narrows that.

     node scripts/rollback-stakeholder-migration.mjs           # dry run
     node scripts/rollback-stakeholder-migration.mjs --apply
   ========================================================================= */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { normalizeStakeholderProfiles, normalizeStakeholderLinks, PROFILES_KEY, LINKS_KEY } from "../lib/stakeholders/profile.ts";

const APPLY = process.argv.includes("--apply");
const DB_URL = (() => {
  /* An explicit --database-url wins, so production is named at the call site
     rather than by editing .env.local — which would otherwise leave that file
     pointed at production for whatever runs next. Falls back to .env.local. */
  const flag = process.argv.find((a) => a.startsWith("--database-url="))?.slice("--database-url=".length);
  if (flag) return flag;
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
  return env.DATABASE_URL;
})();
/** Host only, credentials stripped — printed so a wrong-database run is
 *  obvious before it writes. */
const DB_LABEL = DB_URL.replace(/\/\/[^@]*@/, "//***@").split("?")[0];

const sql = postgres(DB_URL, { ssl: "require", max: 3 });
console.log(`\n=== Stakeholder backfill rollback — ${APPLY ? "APPLY" : "DRY RUN"} ===`);
console.log(`    db: ${DB_LABEL}\n`);

const clients = await sql`select id, name, properties from clients order by name`;
const T = { clients: 0, removed: 0, kept: 0, reconciled: [], linksDropped: 0, failed: [] };

for (const cl of clients) {
  const props = cl.properties ?? {};
  const profiles = normalizeStakeholderProfiles(props[PROFILES_KEY]);
  if (!profiles.length) continue;

  const remove = profiles.filter((p) => p.source === "migration" && p.migration?.legacyKey);
  const reconciled = profiles.filter((p) => p.source !== "migration" && p.migration?.reconciledWith);
  if (!remove.length && !reconciled.length) continue;

  T.clients++;
  T.removed += remove.length;
  T.kept += profiles.length - remove.length;
  for (const p of reconciled) {
    T.reconciled.push({ client: cl.name, id: p.id, roles: p.roles });
  }

  const keptIds = new Set(profiles.filter((p) => !remove.includes(p)).map((p) => p.id));
  /* Links pointing at a removed profile would dangle. The backfill creates no
     links, so any of these were drawn by a person about a migrated record —
     counted and reported, because losing them is a real (if small) loss. */
  const links = normalizeStakeholderLinks(props[LINKS_KEY]);
  const keptLinks = links.filter((l) => keptIds.has(l.fromId) && keptIds.has(l.toId));
  T.linksDropped += links.length - keptLinks.length;

  console.log(`  ${cl.name.slice(0, 46).padEnd(47)} -${String(remove.length).padStart(2)} migrated  keep ${profiles.length - remove.length}${reconciled.length ? `  (${reconciled.length} reconciled — manual)` : ""}`);

  if (!APPLY || !remove.length) continue;
  try {
    await sql`
      update clients
         set properties = coalesce(properties, '{}'::jsonb) || ${sql.json({
           [PROFILES_KEY]: profiles.filter((p) => !remove.includes(p)),
           [LINKS_KEY]: keptLinks,
         })}
       where id = ${cl.id}`;
  } catch (err) {
    T.failed.push({ client: cl.name, error: String(err?.message ?? err) });
  }
}
await sql.end();

const line = (k, v) => console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log(`\n--- ${APPLY ? "removed" : "would remove"} ---`);
line("clients touched", T.clients);
line("migrated profiles removed", T.removed);
line("profiles kept (created by hand)", T.kept);
line("relationship links dropped with them", T.linksDropped);
line("reconciled profiles needing manual reversal", T.reconciled.length);
line("failures", T.failed.length);

if (T.reconciled.length) {
  console.log("\n--- reconciled: roles must be removed by hand ---");
  for (const r of T.reconciled) console.log(`  ${r.client}  ${r.id}  roles: ${r.roles.join(", ")}`);
}
if (T.failed.length) {
  console.log("\n--- failures ---");
  for (const f of T.failed) console.log(`  ${f.client}: ${f.error}`);
}
console.log(`\n  stakeholder_mappings was never modified — the legacy matrix is intact.`);
console.log(APPLY ? "  Re-run the backfill to migrate again.\n" : "  Nothing was written. Re-run with --apply.\n");
process.exit(T.failed.length ? 1 : 0);
