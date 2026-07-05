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
    // Pool size: keep 1 on Vercel serverless (each lambda holds its own
    // connection; many lambdas must not exhaust the pooler), but use a small
    // pool locally so a heavy import/sync doesn't serialize and freeze all
    // page reads behind a single connection.
    // The client profile fires ~8 reads in parallel; let them run concurrently
    // instead of serializing behind one connection. Supabase's transaction-mode
    // pooler (6543) multiplexes, so a few connections per lambda is safe.
    const isProd = process.env.NODE_ENV === "production";
    const max = isProd ? 3 : 10;
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
 */
export function withDbTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`DB read timed out after ${ms}ms`)), ms)),
  ]);
}

export { schema };
