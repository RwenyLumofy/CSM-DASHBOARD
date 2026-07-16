/**
 * Backfill client_usage_monthly from Metabase's raw login history.
 *
 * WHY THIS EXISTS, AND WHY IT'S TIME-SENSITIVE
 * Signal's client_usage_snapshots table holds only a CURRENT value per client
 * (one row, overwritten every sync), so "did this account's usage drop?" is
 * unanswerable from Postgres. Metabase's users_userlogin does hold raw history —
 * but only back to 2025-11-09 (verified 2026-07-16). Older logins are already
 * gone: 7,707 users carry a last_login predating the earliest surviving login
 * row, some dating to 2022. Whether that boundary is a rolling retention window
 * or a one-time purge is unconfirmed; either way Metabase is not a durable
 * archive, and this table is the only lasting copy. Months not captured before
 * they age out are lost for good.
 *
 * WHAT IT COMPUTES
 * Per environment, per calendar month: distinct users with a login in that
 * month, applying the SAME exclusions as the live snapshot query
 * (lib/usage/queries.ts): no soft-deleted users, no internal support or
 * integration accounts. Anything else and the history wouldn't be comparable
 * with the live number shown on a client's Usage tab.
 *
 * Note this is a CALENDAR-MONTH active count, not the trailing-30-day "MAU" the
 * live snapshot reports. They answer different questions and will not match
 * exactly — that's intended. A trailing window can't be reconstructed for a past
 * month, and a movement view needs stable, comparable buckets.
 *
 * Two queries total (one per region), not one per account.
 *
 * Idempotent: re-running refreshes each (client, month) in place. Safe to run
 * repeatedly and on a schedule.
 *
 * Usage: npx tsx --env-file=.env.local scripts/backfill-usage-monthly.mts
 */
import postgres from "postgres";

const DB_ID: Record<string, number> = { aws: 4, ksa: 5 };
const MB_URL = (process.env.METABASE_URL ?? "").replace(/\/$/, "");

async function mbHeaders(): Promise<Record<string, string>> {
  if (process.env.METABASE_API_KEY) {
    return { "x-api-key": process.env.METABASE_API_KEY, "Content-Type": "application/json" };
  }
  const res = await fetch(`${MB_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: process.env.METABASE_USERNAME, password: process.env.METABASE_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Metabase session failed: ${res.status}`);
  return { "X-Metabase-Session": ((await res.json()) as { id: string }).id, "Content-Type": "application/json" };
}

async function runNative(dbId: number, query: string, headers: Record<string, string>) {
  const res = await fetch(`${MB_URL}/api/dataset`, {
    method: "POST",
    headers,
    body: JSON.stringify({ database: dbId, type: "native", native: { query } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Metabase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    status?: string;
    error?: string;
    data?: { rows?: unknown[][]; cols?: { name?: string }[] };
  };
  if (json.status === "failed" || json.error) throw new Error(`Metabase query error: ${JSON.stringify(json.error)}`);
  const cols = (json.data?.cols ?? []).map((c, i) => c.name ?? `c${i}`);
  return (json.data?.rows ?? []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const MONTHS_BACK = Number(process.env.BACKFILL_MONTHS ?? 24); // clamped by what Metabase still holds

const sql = postgres(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!, { ssl: "require", max: 1 });

// environment_id -> client_id. The snapshot table is the only place this
// mapping is resolved (lib/usage/index.ts probes both regions to build it), so
// an account with no snapshot simply has no history to backfill yet.
const links = await sql<{ client_id: string; environment_id: string; region: string }[]>`
  SELECT client_id, environment_id, region FROM client_usage_snapshots WHERE environment_id IS NOT NULL
`;
console.log(`${links.length} client<->environment links`);

const headers = await mbHeaders();
let written = 0;

for (const region of ["aws", "ksa"] as const) {
  const inRegion = links.filter((l) => l.region === region);
  if (!inRegion.length) continue;
  const byEnv = new Map(inRegion.map((l) => [l.environment_id, l.client_id]));
  const idList = [...byEnv.keys()].map((id) => `'${id.replace(/'/g, "''")}'`).join(",");

  const rows = await runNative(
    DB_ID[region],
    `SELECT u.environment_id AS environment_id,
            to_char(date_trunc('month', ul.date), 'YYYY-MM') AS month,
            count(DISTINCT ul.user_id) AS mau
     FROM public.users_userlogin ul
     JOIN public.users_lumofyuser u ON ul.user_id = u.id
     WHERE u.environment_id IN (${idList})
       AND u.deleted_at IS NULL AND u.is_support = false AND u.is_integration_user = false
       AND ul.date >= date_trunc('month', CURRENT_DATE) - INTERVAL '${MONTHS_BACK} month'
     GROUP BY 1, 2`,
    headers,
  );
  console.log(`  ${region}: ${inRegion.length} environments -> ${rows.length} client-month rows`);

  for (const r of rows) {
    const clientId = byEnv.get(String(r.environment_id));
    if (!clientId) continue;
    await sql`
      INSERT INTO client_usage_monthly (client_id, month, mau, environment_id, region, recorded_at)
      VALUES (${clientId}, ${String(r.month)}, ${Number(r.mau)}, ${String(r.environment_id)}, ${region}, now())
      ON CONFLICT (client_id, month) DO UPDATE
        SET mau = EXCLUDED.mau, environment_id = EXCLUDED.environment_id,
            region = EXCLUDED.region, recorded_at = now()
    `;
    written += 1;
  }
}

const summary = await sql<{ month: string; accounts: number; total_mau: number }[]>`
  SELECT month, count(*)::int AS accounts, sum(mau)::int AS total_mau
  FROM client_usage_monthly GROUP BY month ORDER BY month
`;
console.log(`\nwrote ${written} rows. history now held:`);
for (const s of summary) {
  console.log(`  ${s.month}  ${String(s.accounts).padStart(3)} accounts  ${String(s.total_mau).padStart(6)} total MAU`);
}

await sql.end();
