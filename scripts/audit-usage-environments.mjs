/**
 * Audit: find clients that likely have a SECOND (or third) Lumofy platform
 * environment that isn't linked in the Usage tab yet — the "BBK problem"
 * (an expansion deal sold into a separate environment, with its own Mixpanel
 * Company ID, that HubSpot's single company-level `mixpanel_company_id`
 * field can't represent).
 *
 * For every client:
 *   1. Count tracked (active) deals in our DB — 2+ deals is the risk signal
 *      the user described (sales/renewal + expansion may be different cohorts).
 *   2. Resolve today's linked environment(s): manual overrides
 *      (client.properties.__usage_env_overrides) + the HubSpot company-level
 *      Mixpanel Company ID (the only auto-discovery path today — there is no
 *      deal-level Mixpanel property in HubSpot yet).
 *   3. Extract candidate search tokens from the client's name/domain/deal
 *      names, then RARITY-FILTER them: a token is only trusted if it matches
 *      a small number of environments PORTFOLIO-WIDE (computed once, up
 *      front, in 2 queries total — not per client). This is what makes the
 *      difference between a genuine signal ("Beyon" matches 2 environments)
 *      and noise ("Bank"/"Saudi"/"شركة" match dozens) — no fixed, guessable
 *      stopword list can cover two languages reliably, but document
 *      frequency across the real data can.
 *   4. Flag clients where a distinctive token surfaces an UNLINKED environment.
 *
 * This is still a heuristic audit — every flagged client needs a human look
 * (via the Usage tab's environment editor) before adding anything.
 *
 * Usage: npx tsx scripts/audit-usage-environments.mjs [--json out.json]
 */
import { readFileSync, writeFileSync } from "fs";
import postgres from "postgres";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
  if (!line.includes("=") || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const { HubSpotClient } = await import("../lib/integrations/hubspot.ts");
const { MetabaseClient } = await import("../lib/integrations/metabase.ts");

const sql = postgres(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL, { max: 1 });
const hs = new HubSpotClient();
const mb = new MetabaseClient();
const DB_ID = { aws: 4, ksa: 5 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RARE_MAX = 4; // a token must match <= this many environments PORTFOLIO-WIDE to be trusted

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── token extraction (name / domain / deal names) ──────────────────────────
const GENERIC_WORDS = new Set([
  // English business/administrative boilerplate
  "company", "co", "corp", "corporation", "ltd", "llc", "group", "holding", "holdings",
  "international", "the", "and", "of", "for", "with", "inc", "plc", "est", "establishment",
  "trading", "services", "solutions", "foundation", "institute", "authority", "ministry",
  "deal", "expansion", "renewal", "license", "licenses", "subscription", "package",
  "users", "user", "seats", "seat", "direct", "indirect", "sales", "cs", "bin", "binti",
  // directional/regional adjectives — too generic to identify a specific company
  "east", "west", "north", "south", "middle", "gulf", "arab", "arabia", "arabian",
  // this dataset's own noisy generics, discovered empirically (2 audit passes)
  "saudi", "bahrain", "bank", "development", "engineering", "consulting", "consultant",
  "building", "content", "integration", "environment", "water",
]);
// Arabic generic/boilerplate words (transliteration varies; keep the literal forms
// that showed up as false-positive drivers in this portfolio).
const GENERIC_WORDS_AR = new Set([
  "شركة", "مؤسسة", "دار", "بن", "بنت", "للاستثمار", "للتجارة", "السعودية", "التجاري", "التجارية",
  "الخليجي", "الخليجية", "الطبية", "الطبي", "للتنمية", "التنمية",
]);
// Platform-internal / non-customer environments (test, staging, integration demos)
// that showed up as false-positive noise across MULTIPLE unrelated clients — these
// are never a real customer cohort, so exclude them from candidate results outright.
const INTERNAL_ENV_MARKERS = ["lumofy content team", "content replicator", "go1 integration", "dev-testing", "sso integration", "integration guide", "integration environment"];
function looksInternal(name) {
  const n = (name ?? "").toLowerCase();
  return INTERNAL_ENV_MARKERS.some((m) => n.includes(m));
}

function significantWords(s) {
  return (s || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => {
      if (w.length < 3 || /^\d+$/.test(w)) return false;
      const lw = w.toLowerCase();
      return !GENERIC_WORDS.has(lw) && !GENERIC_WORDS_AR.has(w);
    });
}

function acronymOf(name) {
  const words = significantWords(name).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < 2) return null;
  const acro = words.map((w) => w[0]).join("").toUpperCase();
  return acro.length >= 2 && acro.length <= 6 ? acro : null;
}

function domainToken(domain) {
  if (!domain) return null;
  const base = domain.split(".")[0];
  return base && base.length >= 3 ? base : null;
}

function candidateTokens(client, deals) {
  const set = new Set();
  for (const w of significantWords(client.name)) set.add(w);
  const acro = acronymOf(client.name);
  if (acro) set.add(acro);
  const dom = domainToken(client.domain);
  if (dom) set.add(dom);
  for (const d of deals) for (const w of significantWords(d.name)) set.add(w);
  return [...set];
}

function sanitizeToken(t) {
  return t.replace(/[^a-zA-Z0-9؀-ۿ_-]/g, "").slice(0, 40);
}

// ── main ────────────────────────────────────────────────────────────────

const clients = await sql`SELECT id, name, domain, hubspot_id, properties FROM clients ORDER BY name`;
const allDeals = await sql`SELECT client_id, name, pipeline, category, tracked FROM client_deals WHERE tracked IS DISTINCT FROM false`;
const dealsByClient = new Map();
for (const d of allDeals) {
  if (!dealsByClient.has(d.client_id)) dealsByClient.set(d.client_id, []);
  dealsByClient.get(d.client_id).push(d);
}

// Pass 1: every client's candidate tokens (before rarity filtering).
const tokensByClient = new Map();
const allTokens = new Set();
for (const c of clients) {
  const toks = candidateTokens(c, dealsByClient.get(c.id) ?? []).map(sanitizeToken).filter((t) => t.length >= 3);
  tokensByClient.set(c.id, toks);
  for (const t of toks) allTokens.add(t);
}
console.log(`Pass 1: ${allTokens.size} unique candidate tokens across ${clients.length} clients.`);

// Pass 2: compute PORTFOLIO-WIDE document frequency for every token, in one
// query per DB region (unnest + count), so noisy generic words self-identify
// by matching many environments — no guessed stopword list required.
console.log("Pass 2: computing portfolio-wide match frequency per token (this replaces guesswork with real data)...");
const tokenFreq = new Map([...allTokens].map((t) => [t, 0]));
const tokenList = [...allTokens];
for (const region of ["aws", "ksa"]) {
  const arrLiteral = "ARRAY[" + tokenList.map((t) => `'${t.replace(/'/g, "''")}'`).join(",") + "]";
  const chunkSize = 400; // keep the ARRAY literal reasonably sized
  for (let i = 0; i < tokenList.length; i += chunkSize) {
    const chunk = tokenList.slice(i, i + chunkSize);
    const lit = "ARRAY[" + chunk.map((t) => `'${t.replace(/'/g, "''")}'`).join(",") + "]";
    const rows = await mb.runNativeQuery(
      DB_ID[region],
      `SELECT tok, count(DISTINCT e.id) AS n
       FROM unnest(${lit}) AS tok
       JOIN public.environments_environment e ON e.name_en_us ILIKE '%' || tok || '%' OR e.slug ILIKE '%' || tok || '%'
       GROUP BY tok`,
    );
    for (const r of rows) tokenFreq.set(r.tok, (tokenFreq.get(r.tok) ?? 0) + Number(r.n));
  }
  void arrLiteral;
}
const rareTokens = new Set([...tokenFreq.entries()].filter(([, n]) => n > 0 && n <= RARE_MAX).map(([t]) => t));
const genericFound = [...tokenFreq.entries()].filter(([, n]) => n > RARE_MAX).sort((a, b) => b[1] - a[1]);
console.log(`  ${rareTokens.size} tokens are distinctive (<= ${RARE_MAX} env matches portfolio-wide) — these drive the search.`);
if (genericFound.length > 0) {
  console.log(`  ${genericFound.length} tokens turned out generic and were excluded, e.g.: ${genericFound.slice(0, 10).map(([t, n]) => `"${t}"(${n})`).join(", ")}`);
}

// Pass 3: per-client resolution + search using ONLY distinctive tokens.
console.log(`\nPass 3: resolving linked environments + searching with distinctive tokens (concurrency 6)...\n`);

const results = await mapLimit(clients, 6, async (c) => {
  const deals = dealsByClient.get(c.id) ?? [];
  const trackedCount = deals.length;
  const props = c.properties ?? {};
  const overrides = (props.__usage_env_overrides ?? []).map((o) => o.envId?.toLowerCase()).filter(Boolean);

  let companyMixId = null;
  try {
    if (hs.configured && c.hubspot_id) companyMixId = await hs.fetchCompanyMixpanelId(c.hubspot_id);
  } catch {
    /* best-effort */
  }

  const linkedIds = new Set(overrides);
  if (companyMixId && UUID_RE.test(companyMixId)) linkedIds.add(companyMixId.toLowerCase());

  const linkedEnvs = [];
  for (const id of linkedIds) {
    for (const region of ["aws", "ksa"]) {
      try {
        const rows = await mb.runNativeQuery(DB_ID[region], `SELECT name_en_us FROM public.environments_environment WHERE id = '${id}' LIMIT 1`);
        if (rows.length) {
          linkedEnvs.push({ id, region, name: rows[0].name_en_us ?? null });
          break;
        }
      } catch {
        /* best-effort */
      }
    }
  }

  const myTokens = (tokensByClient.get(c.id) ?? []).filter((t) => rareTokens.has(t));
  const candidates = [];
  if (myTokens.length > 0) {
    const where = myTokens.map((t) => `(e.name_en_us ILIKE '%${t}%' OR e.slug ILIKE '%${t}%')`).join(" OR ");
    for (const region of ["aws", "ksa"]) {
      try {
        const rows = await mb.runNativeQuery(
          DB_ID[region],
          `SELECT e.id, e.name_en_us, e.slug, (SELECT count(*) FROM public.users_lumofyuser u WHERE u.environment_id = e.id) AS users
           FROM public.environments_environment e WHERE ${where} ORDER BY users DESC LIMIT 10`,
        );
        for (const r of rows) {
          if (linkedIds.has(String(r.id).toLowerCase())) continue;
          if (looksInternal(r.name_en_us) || looksInternal(r.slug)) continue;
          const matchedOn = myTokens.filter((t) => (r.name_en_us ?? "").toLowerCase().includes(t.toLowerCase()) || (r.slug ?? "").toLowerCase().includes(t.toLowerCase()));
          candidates.push({ id: r.id, region, name: r.name_en_us, slug: r.slug, users: Number(r.users), matchedOn });
        }
      } catch {
        /* best-effort */
      }
    }
  }

  const flagged = trackedCount >= 2 && (linkedEnvs.length < 2 || candidates.length > 0);
  return { client: c, trackedCount, linkedEnvs, candidates: candidates.slice(0, 5), flagged, tokensTried: tokensByClient.get(c.id) ?? [], distinctiveTokens: myTokens };
});

const flagged = results.filter((r) => r.flagged);
const withCandidates = flagged.filter((r) => r.candidates.length > 0);
const noCandidateButMismatch = flagged.filter((r) => r.candidates.length === 0);

console.log(`\n${"=".repeat(72)}`);
console.log(`SUMMARY: ${results.length} clients audited, ${flagged.length} flagged for review`);
console.log(`  ${withCandidates.length} have a RARITY-FILTERED unlinked environment candidate (high confidence)`);
console.log(`  ${noCandidateButMismatch.length} have 2+ deals but no distinctive name match (needs manual investigation)`);
console.log("=".repeat(72));

if (withCandidates.length > 0) {
  console.log(`\n--- HIGH CONFIDENCE: distinctive, rare token matched an unlinked environment ---`);
  for (const r of withCandidates) {
    console.log(`\n${r.client.name}  (hubspot ${r.client.hubspot_id}, ${r.trackedCount} tracked deals)`);
    console.log(`  Currently linked: ${r.linkedEnvs.length === 0 ? "NONE" : r.linkedEnvs.map((e) => `${e.name ?? e.id.slice(0, 8)} (${e.region}, ${e.id})`).join("; ")}`);
    console.log(`  Distinctive tokens used: ${r.distinctiveTokens.join(", ") || "(none)"}`);
    for (const cand of r.candidates) {
      console.log(`  CANDIDATE: "${cand.name}" (${cand.region}, ${cand.users} users) matched on [${cand.matchedOn.join(", ")}] — ${cand.id}`);
    }
  }
}

if (noCandidateButMismatch.length > 0) {
  console.log(`\n--- NEEDS MANUAL LOOK: 2+ active deals, <2 linked envs, no distinctive match ---`);
  for (const r of noCandidateButMismatch) {
    console.log(`  ${r.client.name} (${r.trackedCount} deals, ${r.linkedEnvs.length} linked env) — all tokens too generic or none found. Tried: ${r.tokensTried.join(", ") || "(none)"}`);
  }
}

const jsonArgIdx = process.argv.indexOf("--json");
if (jsonArgIdx !== -1 && process.argv[jsonArgIdx + 1]) {
  writeFileSync(process.argv[jsonArgIdx + 1], JSON.stringify({ results, tokenFreq: Object.fromEntries(tokenFreq) }, null, 2));
  console.log(`\nFull results written to ${process.argv[jsonArgIdx + 1]}`);
}

await sql.end();
