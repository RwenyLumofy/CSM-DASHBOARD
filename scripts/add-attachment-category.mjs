/**
 * One-off: add client_attachments.category (nullable text) so files can be
 * classified using the admin-defined list at workspace_config key
 * "attachment_categories". Safe to re-run.
 *
 * Usage: node scripts/add-attachment-category.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";

const envContent = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

await sql`ALTER TABLE client_attachments ADD COLUMN IF NOT EXISTS category text`;
console.log("client_attachments.category is ready.");

await sql.end();
