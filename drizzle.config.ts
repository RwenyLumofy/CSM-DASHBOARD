import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";

// drizzle-kit doesn't load Next.js .env.local automatically; do it here so
// `npm run db:push` works without manually exporting env vars first.
try {
  const raw = readFileSync(new URL(".env.local", import.meta.url), "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

// Use the DIRECT (non-pooled, port 5432) connection for migrations.
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
