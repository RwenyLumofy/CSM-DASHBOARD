#!/usr/bin/env node
/* =========================================================================
   Bring a Use Case Universe to the Definition Library's catalogue, whatever
   state it starts in.

   WHY ONE SCRIPT. The taxonomy has been through three models — a delta on a
   shipped list, a flat database, and hand editing in the production UI — and
   the environments diverged. Chaining restore → reconcile → backfill assumed a
   starting shape; production had a different one and the reconcile duplicated
   eleven use cases. This converges instead: it reads what is there, works out
   the difference from the target, and reports it before writing.

   THE TARGET is CATALOGUE below: 28 use cases across 6 categories, from
   "Lumofy Use Case Definition Library", Lumofy, 29 July 2026 — plus 360°
   Feedback, which the document omits and the team chose to keep.

   WHAT IT DOES
     · Creates the six categories with the document's labels.
     · Ensures one row per catalogue use case, keyed by its canonical slug so
       the alias table in lib/use-cases.ts keeps resolving onto it. Restores a
       row for any definition that has lost one.
     · DE-DUPLICATES by name. Where two rows carry the same use case, the one
       with a definition wins and the other is RETIRED with `mergedInto` set,
       so an account recorded against the loser still reads as the winner.
       Never deletes: an id an account may hold has to keep resolving.
     · Folds a duplicate category into its canonical twin, moving members
       across before removing the empty one.
     · Leaves anything the catalogue does not mention exactly as it is.

   Definitions are NOT touched — this only writes use_case_taxonomy.

     node scripts/converge-use-case-universe.mjs [--prod] [--yes]

   Dry run by default. --prod targets CLONE_SOURCE_URL from .env.clone.
   ========================================================================= */

import postgres from "postgres";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--yes");

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

const GROUPS = {
  enablement:  { id: "enablement",  label: "Enablement",  blurb: "Building the foundations that make talent work coherent." },
  readiness:   { id: "readiness",   label: "Readiness & Transformation", blurb: "Preparing people for an obligation, a transition or a change." },
  capability:  { id: "capability",  label: "Capability Building", blurb: "Growing the skills a role or business actually requires." },
  performance: { id: "performance", label: "Performance & Talent", blurb: "Managing, evaluating and developing performance." },
  assessment:  { id: "assessment",  label: "Assessment & Workforce Intelligence", blurb: "Measuring capability to inform hiring and development decisions." },
  engagement:  { id: "engagement",  label: "Engagement & Culture", blurb: "Understanding and strengthening how it feels to work here." },
};

/* The document's "Recommended catalogue" table, in its order. Ids are the
   canonical slugs the HubSpot alias table already resolves onto — a use case
   keyed by anything else is invisible to the adoption backfill. */
const CATALOGUE = [
  ["centralized_learning_academy", "Centralized Learning Academy", ["enablement"]],
  ["talent_strategy_activation", "End-to-End Talent Strategy Activation", ["enablement"]],
  ["internal_knowledge_base", "Internal Knowledge Base Development", ["enablement"]],
  ["competency_framework", "Competency Framework & Job Architecture Design", ["enablement"]],
  ["tna", "Training Needs Analysis", ["enablement"]],
  ["qiwa_disclosure", "Qiwa Training Disclosure", ["readiness"]],
  ["compliance_training", "Compliance Training", ["readiness"]],
  ["succession_hipo", "Succession Development (HiPo)", ["readiness"]],
  ["employee_onboarding", "Employee Onboarding", ["readiness"]],
  ["certification_prep", "Certification Preparation", ["readiness"]],
  ["gdp", "Graduate Development Program (GDP)", ["readiness"]],
  ["career_transition", "Career Transition Readiness", ["readiness"]],
  ["ai_readiness", "AI Readiness", ["readiness"]],
  ["digital_transformation", "Digital Transformation", ["readiness"]],
  ["job_role_specific", "Job-Role-Specific Training", ["capability"]],
  ["products_services_knowledge", "Product & Service Knowledge Enablement", ["capability"]],
  ["leadership_development", "Leadership Development", ["capability"]],
  ["technical_skills", "Technical Skills Training", ["capability"]],
  ["upskilling_reskilling", "Upskilling & Reskilling", ["capability"]],
  ["expertise_sharing", "Expertise Sharing", ["capability"]],
  ["career_coaching", "Career Coaching & Development Conversations", ["capability"]],
  ["performance_management", "Comprehensive Performance Management", ["performance"]],
  ["idp", "Individual Development Plans (IDPs)", ["performance"]],
  ["pip", "Performance Improvement Plans (PIPs)", ["performance"]],
  ["hiring_role_assessments", "Hiring & Role-Based Assessments", ["assessment"]],
  ["internal_assessment_hub", "Building In-House Assessment Centers", ["assessment"]],
  ["culture_engagement", "Employee Engagement & Feedback Measurement", ["engagement"]],
  ["team_building_culture", "Team-Building & Culture Development", ["engagement"]],
  /* Not in the document's 28. Kept by an explicit team decision — it exists in
     the catalogue, accounts may reference it, and dropping a use case quietly
     is worse than a count that doesn't match a table. */
  ["feedback_360", "360° Feedback", ["performance", "assessment"]],
];

const key = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

const sql = postgres(url, { prepare: false, max: 1 });
const cfg = await sql`select key, value from workspace_config where key in ('use_case_taxonomy','use_case_library')`;
const tax = cfg.find((r) => r.key === "use_case_taxonomy")?.value ?? {};
const lib = cfg.find((r) => r.key === "use_case_library")?.value ?? {};

const added = { ...(tax.added ?? {}) };
const groups = { ...(tax.groups ?? {}) };
const retired = { ...(tax.retired ?? {}) };

const hasDefinition = (id) => {
  const e = lib[id];
  return !!e && !!(e.oneLiner || e.customerProblem || e.desiredOutcome
    || e.capabilities?.length || e.successIndicators?.length);
};

const log = { categories: [], kept: [], created: [], relabelled: [], merged: [], restored: [], untouched: [] };

/* ---- 1. categories: canonical six, duplicates folded in ---- */
for (const g of Object.values(GROUPS)) {
  if (!groups[g.id]) log.categories.push(`create "${g.label}"`);
  groups[g.id] = g;
}
for (const g of Object.values({ ...groups })) {
  if (GROUPS[g.id]) continue;
  const twin = Object.values(GROUPS).find((c) => key(c.label) === key(g.label));
  if (!twin) { log.untouched.push(`category "${g.label}" [${g.id}] — not in the catalogue, left alone`); continue; }
  let moved = 0;
  for (const row of Object.values(added)) {
    if (!(row.groups ?? []).includes(g.id)) continue;
    row.groups = [...new Set(row.groups.filter((x) => x !== g.id).concat(twin.id))];
    moved++;
  }
  delete groups[g.id];
  log.categories.push(`fold "${g.label}" [${g.id}] into [${twin.id}] — ${moved} use case(s) moved`);
}

/* ---- 2. one row per catalogue entry, de-duplicated by name ---- */
for (const [id, label, cats] of CATALOGUE) {
  /* Every row carrying this name, whatever its id. The canonical row wins when
     it has a definition; otherwise whichever twin does; otherwise the canonical
     one, so the id the alias table resolves onto is the survivor. */
  const sameName = Object.values(added).filter((r) => key(r.label) === key(label));
  const winner = hasDefinition(id) ? id
    : (sameName.find((r) => hasDefinition(r.id))?.id ?? id);

  const before = added[winner];
  added[winner] = { ...(before ?? {}), id: winner, label, groups: cats, summary: lib[winner]?.oneLiner?.slice(0, 400) ?? before?.summary ?? "" };
  if (!before) log[hasDefinition(winner) ? "restored" : "created"].push(`${label}  [${winner}]`);
  else if (before.label !== label) log.relabelled.push(`"${before.label}" → "${label}"  [${winner}]`);
  else log.kept.push(`${label}  [${winner}]`);
  if (retired[winner]) { delete retired[winner]; log.relabelled.push(`un-retired ${label}  [${winner}]`); }

  for (const dup of sameName) {
    if (dup.id === winner) continue;
    retired[dup.id] = {
      reason: `Duplicate of "${label}"; merged so existing account links keep resolving.`,
      mergedInto: winner,
      retiredAt: new Date().toISOString(),
      retiredBy: "converge-use-case-universe.mjs",
    };
    log.merged.push(`"${dup.label}" [${dup.id}] → [${winner}]${hasDefinition(dup.id) ? "  ⚠ HAD A DEFINITION" : "  (was empty)"}`);
  }
}

/* ---- 3. report ---- */
const inCatalogue = new Set(CATALOGUE.map(([id]) => id));
for (const r of Object.values(added)) {
  if (inCatalogue.has(r.id) || retired[r.id]) continue;
  log.untouched.push(`use case "${r.label}" [${r.id}] — not in the catalogue, left live`);
}

const section = (title, list) => { if (list.length) { console.log(`${title} (${list.length})`); for (const l of list) console.log(`   ${l}`); console.log(); } };
section("CATEGORIES", log.categories);
section("RESTORED — definition existed, row did not", log.restored);
section("CREATED — new empty row", log.created);
section("RENAMED / UN-RETIRED", log.relabelled);
section("MERGED AWAY (retired, links still resolve)", log.merged);
section("LEFT ALONE", log.untouched);

const live = Object.values(added).filter((r) => !retired[r.id]);
console.log(`RESULT: ${live.length} live use cases, ${Object.keys(groups).length} categories, ${Object.keys(retired).length} retired.`);
console.log(`        with a definition: ${live.filter((r) => hasDefinition(r.id)).length} / ${live.length}`);
console.log(`        unchanged rows: ${log.kept.length}`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Add --yes to apply."); await sql.end(); process.exit(0); }

await sql`
  insert into workspace_config (key, value, updated_at)
  values ('use_case_taxonomy', ${sql.json({ ...tax, added, groups, retired, renamed: undefined })}, now())
  on conflict (key) do update set value = excluded.value, updated_at = now()`;
console.log("\nWritten.");
await sql.end();
