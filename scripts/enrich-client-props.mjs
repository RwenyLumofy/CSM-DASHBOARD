/**
 * Enrich existing clients with the missing properties from the master Excel.
 * - Matches each Excel row to an existing client by normalized name.
 * - Fills ONLY missing property keys (never overwrites an existing value).
 * - Touches ONLY the `properties` JSONB — never ARR, CSM, name, renewal, etc.
 *
 * Dry run by default (writes nothing). Pass --write to persist.
 *
 * Usage:
 *   node scripts/enrich-client-props.mjs          # preview
 *   node scripts/enrich-client-props.mjs --write  # apply
 */
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const WRITE = process.argv.includes("--write");
const XLSX_PATH = "C:/Users/97338/Downloads/New folder (3)/all clients.xlsx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, "../.env.local"), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

/* ---------------------------------------------------------------- parsing */

const REFERRAL_MAP = {
  "direct sales": "Direct Sales", "direct": "Direct Sales",
  "tamkeen subsidy": "Tamkeen", "tamkeen": "Tamkeen",
  "jisr": "Jisr", "partner - jisr": "Jisr", "partner-jisr": "Jisr",
  "futurex": "FutureX", "future x": "FutureX",
  "indirect": "Indirect",
};

function str(v) { return v == null ? "" : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim()); }
function num(v) {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/[,\s$]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function multi(v) {
  const s = str(v);
  if (!s) return undefined;
  const parts = s.split(/[;,\/]/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}
function flexDate(v) {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s || /no dates|not set|n\/a/i.test(s)) return undefined;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}
function platformDates(v) {
  const s = str(v);
  if (!s || /no dates/i.test(s)) return [undefined, undefined];
  const parts = s.split(/→|–|->|—/).map((p) => p.trim());
  return [flexDate(parts[0]), parts[1] ? flexDate(parts[1]) : undefined];
}

/** Build the typed property object from one Excel row. Keys = property_definitions keys. */
function rowToProps(r) {
  const p = {};
  const set = (k, val) => { if (val !== undefined && val !== "" && !(Array.isArray(val) && !val.length)) p[k] = val; };

  set("tier", str(r["Tier"]) || undefined);
  set("region", multi(r["Region"]));
  set("industry_prop", multi(r["Industry"]));
  set("licenses_purchased", num(r["Licenses Purchased"]));
  set("total_licenses", num(r["Total Licenses"]));
  set("complementary_licenses", num(r["Complementary Licenses"]));
  set("user_price", num(r["User price"]));
  // Contract length is free text ("3 years 5 months") — keep raw, skip "No dates set".
  const cl = str(r["Contract Length (Years)"]);
  if (cl && !/no dates|not set/i.test(cl)) set("contract_length_years", cl);
  set("package", multi(r["Package "] ?? r["Package"]));
  set("support_model", str(r["Support Model"]) || undefined);
  set("use_case", multi(r["Use Case"]));
  set("global_library_package", multi(r["Global Library Package"]));
  set("global_library_licenses", num(r["Global Library Licenses"]));
  set("phase", str(r["Phase"]) || undefined);
  const ref = str(r["Referral Source"]) || str(r["Source"]);
  if (ref) set("referral_source", REFERRAL_MAP[ref.toLowerCase()] ?? ref);
  set("closed_won_date_prop", flexDate(r["Closed Won Date"]));
  set("contract_effective_date_prop", flexDate(r["Contract Effective Date"]));
  set("handover_meeting_date", flexDate(r["Handover Meeting Date"]));
  set("invoice_sent_date", flexDate(r["Invoice Sent Date"]));
  set("kickoff_meeting_date", flexDate(r["Kick-Off Meeting"]));
  set("launch_date", flexDate(r["Launch Date"]));
  set("global_library_expiry_date", flexDate(r["Global Content Library expiry dates"]));
  const [pStart, pEnd] = platformDates(r["Platform Licenses start-ending dates"]);
  set("platform_start_date", pStart);
  set("platform_end_date", pEnd);
  return p;
}

function hasValue(v) {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function norm(s) {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.,]+$/, "");
}
function ascii(s) {
  return norm(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/* ---------------------------------------------------------------- run */

const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer", cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });

const clients = await sql`SELECT id, name, domain, properties FROM clients`;
const byNorm = new Map();
const byAscii = new Map();
for (const c of clients) {
  byNorm.set(norm(c.name), c);
  if (ascii(c.name)) byAscii.set(ascii(c.name), c);
}

// Explicit aliases for cases token-overlap can't catch (single-token rename).
const ALIASES = { "mmbrand": "mm brand", "ikea bahrain": "ikea", "bbkuwait": "bank of bahrain & kuwait" }; // excel-norm -> db-norm

function tokens(s) {
  return new Set(norm(s).split(/[\s\-,&.()]+/).filter((t) => t.length >= 2));
}
const dbTokens = clients.map((c) => ({ c, t: tokens(c.name) }));

function matchClient(name) {
  const n = norm(name), a = ascii(name);
  if (byNorm.has(n)) return { c: byNorm.get(n), how: "exact" };
  if (ALIASES[n] && byNorm.has(ALIASES[n])) return { c: byNorm.get(ALIASES[n]), how: "alias" };
  if (a && byAscii.has(a)) return { c: byAscii.get(a), how: "ascii" };
  // Token overlap: best DB client by shared tokens; require >=2 and a unique winner.
  const nt = tokens(name);
  let best = null, bestScore = 0, tie = false;
  for (const { c, t } of dbTokens) {
    let shared = 0;
    for (const x of nt) if (t.has(x)) shared++;
    if (shared > bestScore) { bestScore = shared; best = c; tie = false; }
    else if (shared === bestScore && shared > 0) tie = true;
  }
  if (best && bestScore >= 2 && !tie) return { c: best, how: `tokens(${bestScore})` };
  return null;
}

let matched = 0, totalAdds = 0;
const unmatchedRows = [];
const matchedClientIds = new Set();
const samples = [];
const fuzzyMatches = [];

for (const r of rows) {
  const name = str(r["Client Name"]);
  if (!name) continue;
  const m = matchClient(name);
  if (!m) { unmatchedRows.push(name); continue; }
  const client = m.c;
  if (m.how !== "exact") fuzzyMatches.push(`${name}  →  ${client.name}  [${m.how}]`);
  matched++;
  matchedClientIds.add(client.id);

  const excelProps = rowToProps(r);
  const existing = client.properties ?? {};
  const adds = {};
  for (const [k, v] of Object.entries(excelProps)) {
    if (!hasValue(existing[k])) adds[k] = v; // fill missing only
  }
  const addCount = Object.keys(adds).length;
  totalAdds += addCount;

  if (samples.length < 4 && addCount > 0) {
    samples.push({ name: client.name, adds });
  }

  if (WRITE && addCount > 0) {
    const merged = { ...existing, ...adds };
    // Pass the OBJECT via sql.json — NOT JSON.stringify()+::jsonb, which
    // postgres.js double-encodes into a jsonb string scalar.
    await sql`UPDATE clients SET properties = ${sql.json(merged)}, updated_at = NOW() WHERE id = ${client.id}`;
  }
}

const unmatchedClients = clients.filter((c) => !matchedClientIds.has(c.id)).map((c) => c.name);

console.log(`\n${WRITE ? "✍️  WRITE MODE" : "🔍 DRY RUN (no writes)"}`);
console.log(`Excel rows: ${rows.length} | DB clients: ${clients.length}`);
console.log(`Matched: ${matched} | Unmatched Excel rows: ${unmatchedRows.length} | DB clients with no Excel row: ${unmatchedClients.length}`);
console.log(`Total missing-prop values that ${WRITE ? "were" : "would be"} added: ${totalAdds}`);

if (fuzzyMatches.length) console.log(`\nResolved (non-exact) matches — verify these are correct:\n  ${fuzzyMatches.join("\n  ")}`);
if (unmatchedRows.length) console.log(`\n⚠ Unmatched Excel rows (no enrichment):\n  ${unmatchedRows.join("\n  ")}`);
if (unmatchedClients.length) console.log(`\n⚠ DB clients not in Excel (stay as-is):\n  ${unmatchedClients.join("\n  ")}`);

console.log(`\nSample of fields ${WRITE ? "added" : "to add"}:`);
for (const s of samples) {
  console.log(`\n  ${s.name}:`);
  for (const [k, v] of Object.entries(s.adds)) console.log(`    + ${k} = ${Array.isArray(v) ? v.join(", ") : v}`);
}

await sql.end();
