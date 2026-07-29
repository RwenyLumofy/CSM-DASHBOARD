/**
 * Loads the Lumofy Use Case Definition Library (28 executive definitions,
 * July 2026) into workspace_config, and reconciles the taxonomy with the
 * catalogue that document specifies.
 *
 * Two keys are written:
 *   use_case_library    the definitions themselves
 *   use_case_taxonomy   renames, category moves and the three additions
 *
 * WHAT IT DOES NOT DO: it never retires anything the document does not
 * explicitly ask to be retired. 360° Feedback is in the current catalogue but
 * absent from the document's 28; it is left live and reported, because
 * silently dropping a use case that accounts may reference is worse than a
 * count that doesn't match a table.
 *
 * Idempotent: re-running produces the same state. Existing owner and review
 * stamps on a definition are PRESERVED — the document supplies wording, not
 * governance, and overwriting a real reviewer with null would lose work.
 *
 * Usage:  node scripts/load-use-case-definition-library.mjs [--dry]
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const conn = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
if (!conn) { console.error("✗ No DATABASE_URL in .env.local"); process.exit(1); }
console.log(`→ ${conn.replace(/:[^:@]+@/, ":****@").split("?")[0]}`);

const LIB = JSON.parse(readFileSync(process.env.LIB_JSON
  || "/private/tmp/claude-501/-Users-mahmoodmalik-Desktop-signal-project/09f4f574-4e86-4605-9c2f-c375b23f5828/scratchpad/ucdoc/library.json", "utf-8"));

/* ---- taxonomy reconciliation, per the document's "Recommended catalogue" ---- */

/** Shipped entries whose title or category the document changes. */
const RENAMES = {
  competency_framework:        { label: "Competency Framework & Job Architecture Design", groups: ["enablement"] },
  tna:                         { label: "Training Needs Analysis", groups: ["enablement"] },
  qiwa_disclosure:             { label: "Qiwa Training Disclosure", groups: ["readiness"] },
  // The document lists Certification Preparation once, under Readiness — this
  // is the "duplicate Certification Preparation → keep one canonical record"
  // decision. Dropping the Capability Building cross-listing is that fix.
  certification_prep:          { label: "Certification Preparation", groups: ["readiness"] },
  products_services_knowledge: { label: "Product & Service Knowledge Enablement", groups: ["capability"] },
  expertise_sharing:           { label: "Expertise Sharing", groups: ["capability"] },
  performance_management:      { label: "Comprehensive Performance Management", groups: ["performance"] },
  idp:                         { label: "Individual Development Plans (IDPs)", groups: ["performance"] },
  hiring_role_assessments:     { label: "Hiring & Role-Based Assessments", groups: ["assessment"] },
  internal_assessment_hub:     { label: "Building In-House Assessment Centers", groups: ["assessment"] },
  culture_engagement:          { label: "Employee Engagement & Feedback Measurement", groups: ["engagement"] },
};

/** The three the document adds to freed catalogue positions. Readable ids
 *  rather than uc_<random>: these come from the canonical document, not from
 *  ad-hoc creation in the UI, and none collides with a shipped id. */
const ADDITIONS = {
  career_coaching:       { label: "Career Coaching & Development Conversations", groups: ["capability"] },
  pip:                   { label: "Performance Improvement Plans (PIPs)",        groups: ["performance"] },
  team_building_culture: { label: "Team-Building & Culture Development",         groups: ["engagement"] },
};

/** Category labels the document uses. */
const GROUPS = {
  enablement:  { id: "enablement",  label: "Enablement",  blurb: "Building the foundations that make talent work coherent." },
  readiness:   { id: "readiness",   label: "Readiness & Transformation", blurb: "Preparing people for an obligation, a transition or a change." },
  capability:  { id: "capability",  label: "Capability Building", blurb: "Growing the skills a role or business actually requires." },
  performance: { id: "performance", label: "Performance & Talent", blurb: "Managing, evaluating and developing performance." },
  assessment:  { id: "assessment",  label: "Assessment & Workforce Intelligence", blurb: "Measuring capability to inform hiring and development decisions." },
  engagement:  { id: "engagement",  label: "Engagement & Culture", blurb: "Understanding and strengthening how it feels to work here." },
};

const sql = postgres(conn, { prepare: false, ssl: "require", max: 1 });

async function readKey(key) {
  const rows = await sql`SELECT value FROM workspace_config WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

try {
  const nowIso = new Date().toISOString();

  /* ---------- 1. taxonomy ---------- */
  const overlay = (await readKey("use_case_taxonomy")) ?? {};
  overlay.renamed ??= {};
  overlay.added ??= {};
  overlay.groups ??= {};

  for (const [id, edit] of Object.entries(RENAMES)) {
    overlay.renamed[id] = { ...(overlay.renamed[id] ?? {}), ...edit };
  }
  for (const [id, add] of Object.entries(ADDITIONS)) {
    overlay.added[id] = {
      id, ...add,
      summary: (LIB[id]?.oneLiner ?? "").slice(0, 400),
      createdAt: overlay.added[id]?.createdAt ?? nowIso,
      createdBy: overlay.added[id]?.createdBy ?? "use-case-definition-library.docx",
    };
  }
  for (const [id, g] of Object.entries(GROUPS)) overlay.groups[id] = g;

  /* Every entry's one-liner comes from the document, so the taxonomy summary
     (what the list and the picker show) should match it rather than drift. */
  for (const [id, e] of Object.entries(LIB)) {
    if (ADDITIONS[id]) continue;                       // already set above
    if (!e.oneLiner) continue;
    overlay.renamed[id] = { ...(overlay.renamed[id] ?? {}), summary: e.oneLiner.slice(0, 400) };
  }

  /* ---------- 2. definitions ---------- */
  const existing = (await readKey("use_case_library")) ?? {};
  const library = { ...existing };
  for (const [id, e] of Object.entries(LIB)) {
    const prior = existing[id] ?? {};
    library[id] = {
      ...prior,
      oneLiner: e.oneLiner,
      customerProblem: e.customerProblem,
      desiredOutcome: e.desiredOutcome,
      clientPhrases: e.clientPhrases,
      audience: e.audience,
      capabilities: e.capabilities,
      successIndicators: e.successIndicators,
      relatedUseCases: e.relatedUseCases,
      products: e.products,
      status: "active",
      // Governance is the team's, not the document's.
      ownerEmail: prior.ownerEmail ?? null,
      lastReviewedAt: prior.lastReviewedAt ?? null,
      reviewedBy: prior.reviewedBy ?? null,
      sourceUrl: prior.sourceUrl ?? null,
      delivers: prior.delivers ?? [],
      updatedAt: nowIso,
      updatedBy: "Lumofy Use Case Definition Library (Jul 2026)",
    };
  }

  console.log(`\ndefinitions: ${Object.keys(LIB).length} written, ${Object.keys(library).length} total in key`);
  console.log(`taxonomy:    ${Object.keys(RENAMES).length} renamed/moved, ${Object.keys(ADDITIONS).length} added, ${Object.keys(GROUPS).length} categories relabelled`);

  const notInDoc = Object.keys(existing).filter((id) => !LIB[id]);
  if (notInDoc.length) console.log(`\n⚠ definitions kept but not in the document: ${notInDoc.join(", ")}`);

  if (DRY) { console.log("\n(dry run — nothing written)"); await sql.end(); process.exit(0); }

  for (const [key, value] of [["use_case_taxonomy", overlay], ["use_case_library", library]]) {
    await sql`
      INSERT INTO workspace_config (key, value, updated_at)
      VALUES (${key}, ${sql.json(value)}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }

  // Read back rather than trust the write.
  const backLib = await readKey("use_case_library");
  const backTax = await readKey("use_case_taxonomy");
  const n = Object.keys(backLib ?? {}).length;
  const withProblem = Object.values(backLib ?? {}).filter((e) => e.customerProblem).length;
  const added = Object.keys(backTax?.added ?? {}).length;
  console.log(`\n✓ verified: ${n} definitions stored, ${withProblem} with a customer problem, ${added} taxonomy additions`);
  if (withProblem < 28) { console.error("✗ fewer than 28 definitions carry a customer problem"); process.exit(1); }
} finally {
  await sql.end();
}
