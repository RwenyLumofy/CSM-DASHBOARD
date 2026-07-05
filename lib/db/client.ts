import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/config";

let _db: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Lazily create the Drizzle client over the Supabase pooled connection.
 * `prepare: false` is required for Supabase's transaction-mode pooler
 * (pgbouncer on port 6543), which the app should use on Vercel.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!_db) {
    // Pool size per lambda. Raised 3->6 on a theory that same-request query
    // queueing (a single /clients render fires ~9-10 concurrent reads) was
    // the cause of a super-admin's /clients read timing out and showing zero
    // clients. That theory is UNCONFIRMED — a live check of the Supabase
    // project found only 13/60 backend connections in use and no stuck
    // queries, and the real, confirmed cause turned out to be a coverage gap
    // (most DB reads across the app weren't wrapped in withDbTimeout at all,
    // so they hung to Vercel's 300s ceiling regardless of pool size — see
    // withDbTimeout below). Don't change this number again without pulling
    // real Supabase pooler metrics (Dashboard -> Database -> Connection
    // pooling) during an actual slow episode; guessing at it twice already
    // didn't fix anything.
    const isProd = process.env.NODE_ENV === "production";
    const max = isProd ? 6 : 10;
    // Idle timeout = how long an unused connection stays open before it's closed.
    // The DB is remote (cross-region), so re-opening a connection pays a full
    // TLS+auth handshake (~700ms measured). In dev we keep connections warm for
    // 5 min so back-to-back page loads/refreshes reuse a live connection (~100ms)
    // instead of reconnecting each time. In prod each serverless lambda is
    // short-lived and must not pin connections against the pooler, so we release
    // them quickly (20s).
    const idle_timeout = isProd ? 20 : 300;
    // `connect_timeout` bounds how long a read waits on an unreachable DB before
    // failing fast (so pages fall back to sample instead of hanging). It only
    // covers the initial handshake though — once connected, a query with no
    // bound (a stuck lock, a stalled read on the cross-region link) can hang
    // indefinitely and take down the whole request until Vercel's own
    // function-duration ceiling kills it (seen in prod: a plain /clients read
    // hung 300s and 504'd). A `connection: { statement_timeout }` option was
    // tried here but does nothing over Supabase's transaction-mode pooler
    // (6543): postgres.js sends it once as part of the StartupMessage, and
    // pgbouncer in transaction mode hands out pooled backend connections that
    // were never opened with it, so it's silently never in effect. Bounding
    // reads instead happens at each call site via `withDbTimeout()` below.
    const sql = postgres(env.databaseUrl, {
      prepare: false,
      max,
      connect_timeout: 10,
      idle_timeout,
      max_lifetime: 60 * 30,
      // Don't let a transient idle-connection error become an unhandled
      // rejection that crashes the dev server; postgres.js will reconnect.
      onnotice: () => {},
    });
    _db = drizzle(sql, { schema });
  }
  return _db;
}

/**
 * Race a DB read against a timeout so a stuck query fails fast into the
 * caller's existing try/catch fallback instead of hanging the whole request
 * until Vercel's function-duration ceiling kills it. This only unblocks the
 * *caller* — it doesn't send Postgres a CancelRequest, so the query may keep
 * running server-side until the connection is torn down with the lambda. That
 * tradeoff is fine here (small pool, short-lived lambdas) in exchange for not
 * needing every call site to hold onto the raw postgres.js query object.
 *
 * 20s was too tight in practice: a merely-slow (not stuck) query under normal
 * cross-region + connection-queueing conditions tripped it and came back
 * empty instead of hanging — worse than the timeout itself, since it silently
 * showed a super-admin zero clients. 45s stays comfortably under Vercel's
 * 300s function ceiling while giving real queries enough room to finish.
 */
export function withDbTimeout<T>(promise: Promise<T>, ms = 45_000): Promise<T> {
  // Logged here (not just left to each caller's own catch) so a call site
  // with no try/catch of its own — the exact gap that caused two rounds of
  // "found another unwrapped spot" — still leaves a trace of which query
  // stalled and for how long, instead of a silent 500/empty result.
  const stackHint = new Error().stack?.split("\n")[2]?.trim() ?? "unknown call site";
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        console.warn(`[db] query timed out after ${ms}ms, called from: ${stackHint}`);
        reject(new Error(`DB read timed out after ${ms}ms`));
      }, ms),
    ),
  ]);
}

export { schema };
