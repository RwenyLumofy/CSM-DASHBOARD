#!/usr/bin/env node
/* =========================================================================
   Publish /docs to Notion as a navigable, filterable database.

   ONE-WAY, GIT IS THE SOURCE OF TRUTH. Notion is a MIRROR, not an editing
   surface. Every page carries a "generated from <path> at <commit>" callout
   and gets overwritten on the next run — because the whole point of this
   documentation set is that it sits next to the code, is verified against it,
   and is checked by scripts/docs-check.mjs. A Notion copy that people edit is
   a second source of truth, which is the exact failure this system exists to
   prevent. Edit the markdown; re-run this.

   A DATABASE, NOT A PAGE TREE. The question people actually bring to these
   docs is "what covers X, and can I trust it" — which is a filter, not a
   folder walk. One database with Section / Status / Last verified / Commit
   answers it; a nested page tree does not. Views are created for you.

   IDEMPOTENT. Page ids are recorded in docs/.notion-map.json and reused, so a
   re-run updates in place rather than creating duplicates. Delete that file
   and the next run creates everything fresh.

   DRY RUN BY DEFAULT, like every other script in this repo. Pass --yes to
   write.

   Usage:
     export NOTION_TOKEN=ntn_xxx            # internal integration secret
     export NOTION_PARENT_PAGE_ID=<page id> # a page the integration can edit
     node scripts/docs-to-notion.mjs             # preview
     node scripts/docs-to-notion.mjs --yes       # publish
     node scripts/docs-to-notion.mjs --yes --only product/health

   Setup in Notion (once):
     1. notion.so/my-integrations -> New integration -> copy the secret.
     2. Open the parent page -> ... -> Connections -> add the integration.
        WITHOUT THIS STEP every call 404s; Notion scopes integrations to the
        pages they are explicitly connected to.
     3. The parent page id is the 32-hex string in its URL.
   ========================================================================= */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, sep, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

// fileURLToPath, not URL.pathname: this checkout lives under a directory with a
// space in it, and pathname percent-encodes it into a path that does not exist.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const MAP_FILE = join(DOCS, ".notion-map.json");
const API = "https://api.notion.com/v1";

const WRITE = process.argv.includes("--yes");
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i > -1 ? process.argv[i + 1] : null;
})();

const TOKEN = process.env.NOTION_TOKEN ?? "";
const PARENT = (process.env.NOTION_PARENT_PAGE_ID ?? "").replace(/-/g, "");

/* ------------------------------------------------------------------ notion */

async function notion(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${json.code ?? ""} ${json.message ?? ""}`);
  }
  return json;
}

/* ------------------------------------------------------- markdown -> blocks */

const TXT_LIMIT = 2000; // Notion's per-rich-text-object ceiling

/** Inline markdown -> Notion rich text. Handles `code`, **bold**, *italic*
 *  and [links](). Deliberately small: these docs use nothing else. */
function richText(md) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\*[^*]+\*)/g;
  let last = 0, m;
  const push = (content, annotations = {}, link = null) => {
    if (!content) return;
    for (let i = 0; i < content.length; i += TXT_LIMIT) {
      out.push({
        type: "text",
        text: { content: content.slice(i, i + TXT_LIMIT), link: link ? { url: link } : null },
        annotations,
      });
    }
  };
  while ((m = re.exec(md))) {
    push(md.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("`")) push(t.slice(1, -1), { code: true });
    else if (t.startsWith("**")) push(t.slice(2, -2), { bold: true });
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/);
      // Relative repo links mean nothing in Notion; keep the label, drop the href.
      push(label, {}, /^https?:/.test(href) ? href : null);
    } else push(t.slice(1, -1), { italic: true });
    last = m.index + t.length;
  }
  push(md.slice(last));
  return out.length ? out : [{ type: "text", text: { content: "" } }];
}

const para = (t) => ({ object: "block", type: "paragraph", paragraph: { rich_text: richText(t) } });

function tableBlock(rows) {
  // rows: array of arrays of cell strings. First row is the header.
  const width = Math.max(...rows.map((r) => r.length));
  return {
    object: "block",
    type: "table",
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((r) => ({
        object: "block",
        type: "table_row",
        table_row: {
          cells: Array.from({ length: width }, (_, i) => richText(r[i] ?? "")),
        },
      })),
    },
  };
}

/** Markdown -> Notion blocks. Covers exactly what these docs use: h1–h3,
 *  paragraphs, bullets, numbered lists, fenced code, tables, blockquotes and
 *  dividers. Anything unrecognised falls through as a paragraph rather than
 *  being dropped — silently losing content is worse than an ugly line. */
function toBlocks(md) {
  const lines = md.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code (mermaid included — Notion has a mermaid language)
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || "plain text";
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push({
        object: "block",
        type: "code",
        code: {
          language: ["mermaid", "typescript", "javascript", "bash", "sql", "json", "markdown"].includes(lang)
            ? lang
            : "plain text",
          rich_text: [{ type: "text", text: { content: body.join("\n").slice(0, TXT_LIMIT) } }],
        },
      });
      continue;
    }

    // Table
    if (line.trimStart().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells); // skip the --- separator
        i++;
      }
      if (rows.length) blocks.push(tableBlock(rows));
      continue;
    }

    // Divider
    if (/^-{3,}$/.test(line.trim())) { blocks.push({ object: "block", type: "divider", divider: {} }); i++; continue; }

    // Heading. Notion has three levels; docs use three.
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push({
        object: "block",
        type: `heading_${level}`,
        [`heading_${level}`]: { rich_text: richText(h[2]), is_toggleable: false },
      });
      i++;
      continue;
    }

    // Blockquote -> callout, which is what a "> **Changed …**" banner means
    if (line.startsWith(">")) {
      const body = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          icon: { type: "emoji", emoji: "📌" },
          rich_text: richText(body.join(" ").trim()),
        },
      });
      continue;
    }

    // Bulleted / numbered list item
    const b = line.match(/^\s*[-*]\s+(.*)$/);
    if (b) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: richText(b[1]) },
      });
      i++;
      continue;
    }
    const n = line.match(/^\s*\d+\.\s+(.*)$/);
    if (n) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: richText(n[1]) },
      });
      i++;
      continue;
    }

    // Paragraph — greedily join wrapped lines, since these docs hard-wrap at 90.
    const buf = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,3}\s|```|>|\s*[-*]\s|\s*\d+\.\s|-{3,}$)/.test(lines[i]) &&
      !lines[i].trimStart().startsWith("|")
    ) buf.push(lines[i++]);
    blocks.push(para(buf.join(" ")));
  }

  return blocks;
}

/* ----------------------------------------------------------- doc metadata */

/** Pull the verification stamp out of a doc. Tolerant: these lines are written
 *  by hand in several shapes, and a missing field is "Unknown", never a guess. */
function meta(md, relPath) {
  const grab = (re) => (md.match(re) ?? [])[1]?.trim() ?? null;
  /* null, not "Unknown", when the doc carries no status line at all — an index,
     a changelog or a runbook has nothing to verify, and labelling it Unknown
     puts it in the same bucket as a document whose status somebody forgot. */
  const status =
    grab(/\*\*Documentation status:\*\*\s*([^\n·|]+)/) ??
    grab(/\*\*Status:\*\*\s*([^\n·|]+)/);
  const verified = grab(/\*\*Last verified:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  const commit = grab(/\*\*(?:Verified against )?[Cc]ommit:\*\*\s*`?([0-9a-f]{6,40})`?/);
  const owner = grab(/\*\*(?:Documentation )?[Oo]wner:\*\*\s*([^\n·|]+)/);
  const title = grab(/^#\s+(.+)$/m) ?? relPath;

  const seg = relPath.split(sep);
  const section =
    seg.length === 1 ? "Top level"
    : seg[0] === "product" ? "Product areas"
    : seg[0] === "business-rules" ? "Business rules"
    : seg[0] === "decisions" ? "Decisions"
    : seg[0] === "specs" ? "Specs (proposed)"
    : seg[0] === "product-notes" ? "Product notes (proposed)"
    : seg[0] === "known-limitations" ? "Known limitations"
    : seg[0] === "releases" ? "Releases"
    : seg[0] === "_templates" ? "Templates"
    : seg[0].charAt(0).toUpperCase() + seg[0].slice(1).replace(/-/g, " ");

  /* Normalise to the vocabulary docs/README.md defines — plus the SEPARATE
     vocabulary decision records use (Accepted / Superseded / …). Ordering
     matters: "Accepted; implementation superseded by 0015" must read as
     Superseded, and "Partially verified" must not match the bare "verified"
     test. A doc whose status this cannot place stays Unknown rather than being
     guessed into a bucket somebody would then filter on. */
  const s = (status ?? "").toLowerCase();
  const normalised =
    // Templates first: their status line is a PICK-LIST of every value
    // ("Proposed | Accepted | Superseded by NNNN"), so any content test below
    // would match the wrong one.
    seg[0] === "_templates" ? "Template"
    : status === null ? "Index"
    : s.includes("contradict") ? "Contradictory"
    : s.includes("removed") ? "Removed"
    : s.includes("supersede") ? "Superseded"
    : s.includes("deprecated") ? "Deprecated"
    : s.includes("partially") ? "Partially verified"
    : s.includes("unverified") ? "Unverified"
    : s.includes("accepted") ? "Accepted"
    : s.includes("proposed") ? "Proposed"
    : s.includes("verified") ? "Verified"
    : "Unknown";

  return { title, section, status: normalised, verified, commit, owner, rawStatus: status ?? "" };
}

/* ------------------------------------------------------------------- walk */

function walk(dir, out = []) {
  for (const e of readdirSync(dir).sort()) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (extname(full) === ".md") out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------- main */

const commitNow = (() => {
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
})();

let files = walk(DOCS).map((f) => relative(DOCS, f));
if (ONLY) files = files.filter((f) => f.startsWith(ONLY));

console.log(`docs-to-notion — ${files.length} document(s), repo at ${commitNow}`);
console.log(WRITE ? "MODE: write\n" : "MODE: dry run (pass --yes to publish)\n");

const SECTIONS = [...new Set(files.map((f) => meta(readFileSync(join(DOCS, f), "utf8"), f).section))];

if (!WRITE) {
  const byStatus = {};
  for (const f of files) {
    const m = meta(readFileSync(join(DOCS, f), "utf8"), f);
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  }
  console.log("Would create a database with these sections:");
  for (const s of SECTIONS.sort()) {
    console.log(`  ${s.padEnd(26)} ${files.filter((f) => meta(readFileSync(join(DOCS, f), "utf8"), f).section === s).length}`);
  }
  console.log("\nStatus spread:");
  for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(26)} ${v}`);
  }
  const noStamp = files.filter((f) => !meta(readFileSync(join(DOCS, f), "utf8"), f).verified);
  if (noStamp.length) {
    console.log(`\n${noStamp.length} document(s) carry no "Last verified" date and will sort last:`);
    for (const f of noStamp) console.log(`  ${f}`);
  }
  console.log("\nNothing was written. Re-run with --yes once NOTION_TOKEN and");
  console.log("NOTION_PARENT_PAGE_ID are set and the integration is connected to the parent page.");
  process.exit(0);
}

if (!TOKEN) { console.error("NOTION_TOKEN is not set."); process.exit(1); }
if (!PARENT) { console.error("NOTION_PARENT_PAGE_ID is not set."); process.exit(1); }

const map = existsSync(MAP_FILE) ? JSON.parse(readFileSync(MAP_FILE, "utf8")) : {};

/* 1. Database ------------------------------------------------------------ */
if (!map.__database) {
  const db = await notion("POST", "/databases", {
    parent: { type: "page_id", page_id: PARENT },
    title: [{ type: "text", text: { content: "Signal — Product Documentation" } }],
    description: [{
      type: "text",
      text: {
        content:
          "Generated from /docs in the Signal repository. Read-only mirror — edit the markdown, " +
          "not these pages. Re-run scripts/docs-to-notion.mjs to refresh.",
      },
    }],
    properties: {
      Name: { title: {} },
      Section: { select: { options: SECTIONS.map((s) => ({ name: s })) } },
      Status: {
        select: {
          options: [
            { name: "Verified", color: "green" },
            { name: "Partially verified", color: "yellow" },
            { name: "Unverified", color: "orange" },
            { name: "Contradictory", color: "red" },
            { name: "Proposed", color: "blue" },
            { name: "Accepted", color: "green" },
            { name: "Superseded", color: "brown" },
            { name: "Deprecated", color: "gray" },
            { name: "Removed", color: "gray" },
            { name: "Template", color: "purple" },
            { name: "Index", color: "default" },
            { name: "Unknown", color: "default" },
          ],
        },
      },
      "Last verified": { date: {} },
      Commit: { rich_text: {} },
      Owner: { rich_text: {} },
      "Source path": { rich_text: {} },
    },
  });
  map.__database = db.id;
  console.log(`created database ${db.id}`);
}

/* 2. One page per document ---------------------------------------------- */
let created = 0, updated = 0, failed = 0;

for (const rel of files) {
  const md = readFileSync(join(DOCS, rel), "utf8");
  const m = meta(md, rel);

  const props = {
    Name: { title: [{ type: "text", text: { content: m.title.slice(0, 200) } }] },
    Section: { select: { name: m.section } },
    Status: { select: { name: m.status } },
    "Last verified": m.verified ? { date: { start: m.verified } } : { date: null },
    Commit: { rich_text: [{ type: "text", text: { content: m.commit ?? "" } }] },
    Owner: { rich_text: [{ type: "text", text: { content: m.owner ?? "" } }] },
    "Source path": { rich_text: [{ type: "text", text: { content: `docs/${rel}` } }] },
  };

  const provenance = {
    object: "block",
    type: "callout",
    callout: {
      icon: { type: "emoji", emoji: "🔒" },
      color: "gray_background",
      rich_text: richText(
        `Generated from **docs/${rel}** at commit \`${commitNow}\`. ` +
        `This page is overwritten on the next publish — edit the markdown in the repository, not here.`,
      ),
    },
  };

  const blocks = [provenance, ...toBlocks(md)];

  try {
    let pageId = map[rel];

    if (pageId) {
      await notion("PATCH", `/pages/${pageId}`, { properties: props });
      // Replace the body: archive existing children, then append fresh.
      let cursor;
      do {
        const kids = await notion("GET", `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
        for (const k of kids.results) await notion("DELETE", `/blocks/${k.id}`);
        cursor = kids.has_more ? kids.next_cursor : null;
      } while (cursor);
      updated++;
    } else {
      const page = await notion("POST", "/pages", {
        parent: { type: "database_id", database_id: map.__database },
        properties: props,
      });
      pageId = page.id;
      map[rel] = pageId;
      created++;
    }

    // Notion caps children at 100 per request.
    for (let i = 0; i < blocks.length; i += 100) {
      await notion("PATCH", `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
    }
    console.log(`  ${map[rel] ? "ok" : "ok"}  ${rel}  (${blocks.length} blocks)`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${rel}: ${e.message}`);
  }

  writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}

console.log(`\ncreated ${created}, updated ${updated}, failed ${failed}`);
console.log(`page map: docs/.notion-map.json (commit it, or re-runs will duplicate)`);
if (failed) process.exit(1);
