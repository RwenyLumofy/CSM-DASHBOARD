#!/usr/bin/env node
/* =========================================================================
   Non-destructive documentation check.

   Validates that /docs stays connected to the codebase it describes. It NEVER
   writes, rewrites, or generates documentation — it reports.

     1. Every repository path cited in a doc exists.
     2. Every internal markdown link resolves.
     3. Every feature/rule doc carries verification metadata.
     4. Every route under app/ appears somewhere in the docs.
     5. No obvious secret values were copied into a doc.
     6. (--changed) Product files changed with no docs change → a WARNING.

   EXIT CODES
     0  clean, or warnings only
     1  errors found (broken path/link, or a suspected secret)

   Warnings never fail the check. Trivial refactors, formatting and test-only
   changes are excluded from the coverage warning by design — a docs checker
   that cries wolf gets disabled, and then it protects nothing.

   Usage:
     node scripts/docs-check.mjs
     node scripts/docs-check.mjs --changed          # vs. HEAD
     node scripts/docs-check.mjs --changed=main     # vs. a base ref
   ========================================================================= */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

/* ------------------------------------------------------------- collect docs */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === ".md") out.push(full);
  }
  return out;
}

if (!existsSync(DOCS)) {
  console.error("docs/ not found — nothing to check.");
  process.exit(1);
}

const docs = walk(DOCS);
const rel = (f) => relative(ROOT, f);

/* -------------------------------------------------- 1 & 2. links and paths */

/** Markdown links: [text](target). Skips external and anchor-only links. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Inline-code paths that look like repository files, e.g. `lib/auth.ts`.
 *  Deliberately narrow: must contain a slash and end in a known extension. */
const CODE_PATH = /`([A-Za-z0-9_@./[\]()-]*\/[A-Za-z0-9_@./[\]()-]*\.(?:ts|tsx|mjs|mts|sql|json|md|css))`/g;

/** Paths a citation may legitimately use that are not literal files. */
const GLOB_HINT = /[*]/;

/** Top-level entries a real repository citation must start with. Anything else
 *  in backticks is prose (a filename shorthand inside a list, or a deliberate
 *  reference to something that does NOT exist — e.g. a stale README link we are
 *  documenting as broken). Checking those would train people to ignore this. */
const REPO_ROOTS = new Set(
  readdirSync(ROOT).filter((e) => statSync(join(ROOT, e)).isDirectory()),
);

/** Resolve a cited path, or null when it is prose rather than a citation. */
function resolveCitation(cited, docDir) {
  if (GLOB_HINT.test(cited)) return null;
  if (cited.startsWith("./") || cited.startsWith("../")) return resolve(docDir, cited);
  const [first] = cited.split("/");
  if (!REPO_ROOTS.has(first)) return null; // shorthand or prose — not a citation
  return resolve(ROOT, cited);
}

for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  const here = dirname(doc);

  for (const [, target] of text.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [pathPart] = target.split("#");
    if (!pathPart) continue; // pure anchor
    // Markdown requires parentheses in a path to be percent-encoded — Next's
    // route groups, app/(app), hit this on every page link.
    let decoded = pathPart;
    try { decoded = decodeURIComponent(pathPart); } catch { /* leave as-is */ }
    const resolved = resolve(here, decoded);
    if (!existsSync(resolved)) err(rel(doc), `broken link → ${target}`);
  }

  for (const [, cited] of text.matchAll(CODE_PATH)) {
    const resolved = resolveCitation(cited, here);
    if (resolved && !existsSync(resolved)) {
      err(rel(doc), `cited path does not exist → ${cited}`);
    }
  }
}

/* ------------------------------------------- 3. verification metadata */

const NEEDS_METADATA = [join(DOCS, "product"), join(DOCS, "business-rules")];

for (const doc of docs) {
  if (!NEEDS_METADATA.some((d) => doc.startsWith(d))) continue;
  if (doc.endsWith(join("business-rules", "README.md"))) continue;
  const text = readFileSync(doc, "utf8");
  if (!/\*\*(?:Documentation status|Status):\*\*/.test(text))
    warn(rel(doc), "no `**Status:**` or `**Documentation status:**` line");
  if (!/\*\*Last verified:\*\*/.test(text))
    warn(rel(doc), "no `**Last verified:**` line");
  if (!/\*\*(?:Verified against )?[Cc]ommit:\*\*/.test(text))
    warn(rel(doc), "no verified-against-commit line");
}

/* ------------------------------------------------- 4. route coverage */

function routes(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (entry === "page.tsx") out.push(relative(ROOT, full));
  }
  return out;
}

const allDocsText = docs.map((d) => readFileSync(d, "utf8")).join("\n");

/** app/(app)/foo/page.tsx → /foo ; app/(app)/page.tsx → / */
function routeOf(file) {
  return (
    file
      .replace(/^app\//, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\((?:[^)]+)\)\/?/g, "")
      .replace(/^\/?/, "/")
      .replace(/\/$/, "") || "/"
  );
}

for (const file of routes(join(ROOT, "app"))) {
  if (file.includes("scratch-")) continue; // prototypes, deliberately undocumented
  if (file.includes("sign-in")) continue;
  const route = routeOf(file);
  if (route === "/") continue;
  if (!allDocsText.includes(route)) {
    warn("route coverage", `${route} (${file}) is not mentioned in any doc`);
  }
}

/* --------------------------------------------------- 5. secret sniffing */

const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9]{16,}/, "possible API key"],
  [/\bpat-[A-Za-z0-9-]{16,}/, "possible HubSpot private-app token"],
  [/postgres(?:ql)?:\/\/[^\s`)]+:[^\s`)@]+@/, "database connection string with credentials"],
  [/\beyJ[A-Za-z0-9_-]{20,}\./, "possible JWT"],
  [/(?:SECRET|TOKEN|API_KEY|SERVICE_ROLE_KEY)\s*=\s*["']?[A-Za-z0-9_\-+/]{12,}/, "environment value with a literal secret"],
];

for (const doc of docs) {
  const text = readFileSync(doc, "utf8");
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) err(rel(doc), `${label} — remove it`);
  }
}

/* ------------------------------------- 6. changed product files vs docs */

const changedArg = process.argv.find((a) => a.startsWith("--changed"));
if (changedArg) {
  const base = changedArg.includes("=") ? changedArg.split("=")[1] : "HEAD";
  let changed = [];
  try {
    changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    warn("docs-check", `could not run \`git diff --name-only ${base}\` — skipping coverage check`);
  }

  const isProduct = (f) =>
    /^(app|components|lib|drizzle)\//.test(f) &&
    !/\.test\.(ts|tsx)$/.test(f) &&
    !/\.css$/.test(f) &&
    !f.startsWith("app/scratch-");

  const productChanges = changed.filter(isProduct);
  const docChanges = changed.filter((f) => f.startsWith("docs/"));

  if (productChanges.length > 0 && docChanges.length === 0) {
    warnings.push(
      `docs coverage: ${productChanges.length} product file(s) changed and no docs were updated.\n` +
        productChanges.slice(0, 12).map((f) => `    ${f}`).join("\n") +
        (productChanges.length > 12 ? `\n    …and ${productChanges.length - 12} more` : "") +
        "\n    If this change alters product behaviour, run the signal-product-documenter agent." +
        "\n    If it is a refactor, formatting, or test-only change, ignore this."
    );
  }
}

/* ------------------------------------------------------------- report */

console.log(`docs-check — ${docs.length} documents\n`);

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log("");
  process.exit(1);
}

console.log(warnings.length ? "No errors (warnings above)." : "All checks passed.");
