/**
 * One-off: add client_attachments.storage_path (nullable text) so manually
 * uploaded attachments can be deleted from Supabase Storage without parsing
 * the path back out of a signed URL. Safe to re-run.
 *
 * Usage: node scripts/add-attachment-storage-path.mjs
 */
import { readFileSync } from "fs";
import postgres from "postgres";

const envContent = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envContent.split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sql = postgres(env.DIRECT_DATABASE_URL || env.DATABASE_URL, { max: 1 });

await sql`ALTER TABLE client_attachments ADD COLUMN IF NOT EXISTS storage_path text`;
console.log("client_attachments.storage_path is ready.");

await sql.end();
