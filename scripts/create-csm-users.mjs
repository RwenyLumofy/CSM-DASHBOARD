import { readFileSync } from "fs";
import postgres from "postgres";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

const url = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
if (!url) throw new Error("No DATABASE_URL found in .env.local");

const sql = postgres(url, { prepare: false });

await sql`
  CREATE TABLE IF NOT EXISTS "csm_users" (
    "id"         text PRIMARY KEY NOT NULL,
    "name"       text NOT NULL,
    "email"      text NOT NULL,
    "initials"   text NOT NULL,
    "active"     boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "csm_users_email_unique" UNIQUE("email")
  )
`;

console.log("✓ csm_users table created (or already exists)");

// Seed the 4 known Lumofy CSMs
const csms = [
  { id: "76961168", name: "Batool Momani",  email: "bmomani@lumofy.com",  initials: "BM" },
  { id: "79667619", name: "Ali Abbas",      email: "aabbas@lumofy.com",   initials: "AA" },
  { id: "83083504", name: "Zainab Ali",     email: "zali@lumofy.com",     initials: "ZA" },
  { id: "92324750", name: "Sakina Asghar",  email: "sasghar@lumofy.com",  initials: "SA" },
];

for (const c of csms) {
  await sql`
    INSERT INTO csm_users (id, name, email, initials, active)
    VALUES (${c.id}, ${c.name}, ${c.email}, ${c.initials}, true)
    ON CONFLICT (id) DO UPDATE SET name=${c.name}, email=${c.email}, initials=${c.initials}
  `;
  console.log(`  ✓ ${c.name}`);
}

await sql.end();
console.log("Done.");
