/**
 * Creates the property_definitions table (if not exists) and adds the
 * `properties` JSONB column to clients, then seeds all 25 property definitions.
 *
 * Safe to re-run on a LIVE environment: once any rows already exist, it only
 * inserts keys that are missing and leaves existing rows (and any admin
 * label/option/group/order customization made via Settings → Properties)
 * untouched. Pass --force to overwrite existing rows with the seed values
 * instead — rarely what you want after go-live.
 *
 * Usage:  node scripts/create-properties.mjs [--force]
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const connectionString = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("No DATABASE_URL / POSTGRES_URL / SUPABASE_DB_URL found in .env.local");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });

/* ----------------------------------------------------------------- DDL */

await sql`
  CREATE TABLE IF NOT EXISTS property_definitions (
    key          TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    type         TEXT NOT NULL,
    options      JSONB NOT NULL DEFAULT '[]',
    "group"      TEXT NOT NULL DEFAULT 'general',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    is_system    BOOLEAN NOT NULL DEFAULT TRUE,
    is_read_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
console.log("✓ property_definitions table ready");

await sql`
  ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'
`;
console.log("✓ clients.properties column ready");

await sql`
  ALTER TABLE property_definitions
    ADD COLUMN IF NOT EXISTS hidden_options JSONB NOT NULL DEFAULT '[]'
`;
console.log("✓ property_definitions.hidden_options column ready");

/* ----------------------------------------------------------------- seed */

const DEFS = [
  // ── Client group ─────────────────────────────────────────────────────
  {
    key: "tier", label: "Tier", type: "single_select",
    options: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"],
    group: "client", sortOrder: 10, isSystem: true, isReadOnly: false,
  },
  // NOTE: Region (→ synced Country core field) and Industry (→ synced Industry
  // core field) were removed — they duplicated HubSpot-synced data.

  // ── Contract group ────────────────────────────────────────────────────
  {
    key: "licenses_purchased", label: "Licenses Purchased", type: "number",
    options: [], group: "contract", sortOrder: 10, isSystem: true, isReadOnly: false,
  },
  // NOTE: Total Licenses removed — now computed per deal (Licenses + Complementary).
  {
    key: "complementary_licenses", label: "Complementary Licenses", type: "number",
    options: [], group: "contract", sortOrder: 30, isSystem: true, isReadOnly: false,
  },
  {
    key: "user_price", label: "User Price", type: "currency",
    options: [], group: "contract", sortOrder: 40, isSystem: true, isReadOnly: false,
  },
  {
    key: "contract_length_years", label: "Contract Length (Years)", type: "number",
    options: [], group: "contract", sortOrder: 50, isSystem: true, isReadOnly: false,
  },

  // ── Product group ─────────────────────────────────────────────────────
  {
    key: "package", label: "Package", type: "multi_select",
    // Mirrors the HubSpot deal `modules` picklist.
    options: ["Perform", "Develop", "Engage", "Other"],
    group: "product", sortOrder: 10, isSystem: true, isReadOnly: false,
  },
  // NOTE: Support Model removed — Support Level now synced per deal from HubSpot.
  {
    key: "use_case", label: "Use Case", type: "multi_select",
    // Mirrors the HubSpot deal `use_cases` picklist.
    options: [
      "Unclear", "Onboarding New Joiner", "Preparing for a New Role (Succession Development)",
      "Building Leadership Capabilities", "Preparation for Certification", "Building Job-related Skills",
      "Compliance and Regulatory Requirements", "Product Knowledge", "Service Knowledge",
      "Functional Knowledge", "Sharing Experience of Top Performers",
      "Sharing Experience of a Subject Matter Expert (SME)", "Qiwa Disclosure", "Upskilling / Reskilling",
      "Centralizing L&D under One Digital Platform", "Training Needs Analysis (TNA)", "Performance Management",
      "Competency Framework Development", "360 Degree Feedback", "Engagement Surveys",
      "Graduate Development Program (GDP)", "Hiring & Selection", "Talenet Assesments",
      "Internal Knowledge Base Development", "Individual Development Plans (IDPs)", "Other",
    ],
    group: "product", sortOrder: 30, isSystem: true, isReadOnly: false,
  },
  // NOTE: Global Library Package & Licenses removed — now synced per deal from
  // HubSpot (deal `global_libraries` / `global_libraries_licenses`).

  // ── Engagement group ──────────────────────────────────────────────────
  // NOTE: Phase removed — merged into the account-level Status (core field).
  {
    key: "referral_source", label: "Acquisition Channel", type: "single_select",
    options: ["Direct Sales", "Tamkeen", "Jisr", "FutureX", "Indirect"],
    group: "engagement", sortOrder: 20, isSystem: true, isReadOnly: false,
  },

  // ── Deal-scoped picklists (sync-managed; hold options for the deal-card
  //    editors). isReadOnly so they stay out of account-level editing UIs. The
  //    sync's reconcileDealSelectOptions keeps options in lockstep with HubSpot. ──
  {
    key: "deal_account_executive", label: "Account Executive", type: "single_select",
    options: [
      "Mahmood Malik", "Safa AlFulaij", "Ahmed Faraj", "Tasneem Elghareeb", "Rania Qasim", "Mustafa Abbas",
      "Batool Momani", "Ali Abbas", "Mohamed Shamlooh", "Ruba Sinokrot", "Zainab Ali", "Mohamed Shantory",
      "Sakina Asghar", "Reem Sharar", "Suzan Alkhriesat", "Sara Abdulwahab", "Hussain Alsayyad",
      "Hasan AlHashimi", "Fatema almasoud", "Taif Saleh", "mahmoud elrweny", "Qasim Alshakhoori",
      "Sara Mashhoor", "Shehab Beram", "Sayed Hussain Almukhtar",
    ],
    group: "engagement", sortOrder: 90, isSystem: true, isReadOnly: true,
  },
  {
    key: "deal_modules", label: "Package (Modules)", type: "multi_select",
    options: ["Perform", "Develop", "Engage", "Other"],
    group: "product", sortOrder: 100, isSystem: true, isReadOnly: true,
  },
  {
    key: "deal_use_cases", label: "Use Case (Deal)", type: "multi_select",
    options: [
      "Unclear", "Onboarding New Joiner", "Preparing for a New Role (Succession Development)",
      "Building Leadership Capabilities", "Preparation for Certification", "Building Job-related Skills",
      "Compliance and Regulatory Requirements", "Product Knowledge", "Service Knowledge",
      "Functional Knowledge", "Sharing Experience of Top Performers",
      "Sharing Experience of a Subject Matter Expert (SME)", "Qiwa Disclosure", "Upskilling / Reskilling",
      "Centralizing L&D under One Digital Platform", "Training Needs Analysis (TNA)", "Performance Management",
      "Competency Framework Development", "360 Degree Feedback", "Engagement Surveys",
      "Graduate Development Program (GDP)", "Hiring & Selection", "Talenet Assesments",
      "Internal Knowledge Base Development", "Individual Development Plans (IDPs)", "Other",
    ],
    group: "product", sortOrder: 110, isSystem: true, isReadOnly: true,
  },
  {
    key: "deal_global_libraries", label: "Global Library (Deal)", type: "multi_select",
    options: ["Go1", "Opensesame", "Udemy", "Linkedin", "Almentor", "Entalaqa", "Pluralsight", "None"],
    group: "product", sortOrder: 120, isSystem: true, isReadOnly: true,
  },
  {
    key: "deal_support_level", label: "Support Level", type: "single_select",
    options: ["Level 1", "Level 2", "Level 3"],
    group: "contract", sortOrder: 100, isSystem: true, isReadOnly: true,
  },
  {
    key: "deal_implementation_level", label: "Implementation Level", type: "single_select",
    options: ["Self-Serve", "Guided", "White Glove"],
    group: "contract", sortOrder: 110, isSystem: true, isReadOnly: true,
  },

  // ── Dates group ───────────────────────────────────────────────────────
  {
    key: "closed_won_date_prop", label: "Closed Won Date", type: "date",
    options: [], group: "dates", sortOrder: 10, isSystem: true, isReadOnly: false,
  },
  {
    key: "contract_effective_date_prop", label: "Contract Effective Date", type: "date",
    options: [], group: "dates", sortOrder: 20, isSystem: true, isReadOnly: false,
  },
  {
    key: "invoice_sent_date", label: "Invoice Sent Date", type: "date",
    options: [], group: "dates", sortOrder: 40, isSystem: true, isReadOnly: false,
  },
  {
    key: "kickoff_meeting_date", label: "Kick-Off Meeting Date", type: "date",
    options: [], group: "dates", sortOrder: 50, isSystem: true, isReadOnly: false,
  },
  {
    key: "platform_start_date", label: "Platform Start Date", type: "date",
    options: [], group: "dates", sortOrder: 70, isSystem: true, isReadOnly: false,
  },
  {
    key: "platform_end_date", label: "Platform End Date", type: "date",
    options: [], group: "dates", sortOrder: 80, isSystem: true, isReadOnly: false,
  },
  {
    key: "global_library_start_date", label: "Global Library Start Date", type: "date",
    options: [], group: "dates", sortOrder: 85, isSystem: true, isReadOnly: false,
  },
  {
    key: "global_library_expiry_date", label: "Global Library Expiry Date", type: "date",
    options: [], group: "dates", sortOrder: 90, isSystem: true, isReadOnly: false,
  },
];

// Safety guard: this script is meant for FIRST-TIME setup only. Re-running it
// against a live environment would silently overwrite every admin label/
// option/group/sortOrder customization made since (Settings → Properties has
// no way to tell those edits apart from the original seed). Once any rows
// already exist, refuse to touch existing keys unless --force is passed.
const FORCE = process.argv.includes("--force");
const [{ count: existingCountRaw } = { count: "0" }] = await sql`SELECT count(*)::int AS count FROM property_definitions`;
const existingCount = Number(existingCountRaw);
if (existingCount > 0 && !FORCE) {
  console.log(`\n⚠ property_definitions already has ${existingCount} row(s) — this looks like a live environment, not a fresh setup.`);
  console.log("  Re-running this seed would overwrite any label/option/group/order changes made via Settings → Properties since.");
  console.log("  Inserting any NEW keys from DEFS that don't exist yet, but leaving existing rows untouched.");
  console.log("  Pass --force to overwrite existing rows anyway (rarely what you want).\n");
  for (const def of DEFS) {
    const inserted = await sql`
      INSERT INTO property_definitions
        (key, label, type, options, "group", sort_order, is_system, is_read_only)
      VALUES (
        ${def.key}, ${def.label}, ${def.type},
        ${JSON.stringify(def.options)}, ${def.group},
        ${def.sortOrder}, ${def.isSystem}, ${def.isReadOnly}
      )
      ON CONFLICT (key) DO NOTHING
      RETURNING key
    `;
    console.log(inserted.length ? `  + ${def.key} (new)` : `  · ${def.key} (already exists, left untouched)`);
  }
  console.log(`\n✓ Done — existing definitions were not modified. Re-run with --force to overwrite them.`);
  await sql.end();
  process.exit(0);
}

for (const def of DEFS) {
  await sql`
    INSERT INTO property_definitions
      (key, label, type, options, "group", sort_order, is_system, is_read_only)
    VALUES (
      ${def.key}, ${def.label}, ${def.type},
      ${JSON.stringify(def.options)}, ${def.group},
      ${def.sortOrder}, ${def.isSystem}, ${def.isReadOnly}
    )
    ON CONFLICT (key) DO UPDATE SET
      label        = EXCLUDED.label,
      type         = EXCLUDED.type,
      options      = EXCLUDED.options,
      "group"      = EXCLUDED."group",
      sort_order   = EXCLUDED.sort_order,
      is_system    = EXCLUDED.is_system,
      is_read_only = EXCLUDED.is_read_only
  `;
  console.log(`  ✓ ${def.key}`);
}

console.log(`\n✓ Seeded ${DEFS.length} property definitions`);
await sql.end();
