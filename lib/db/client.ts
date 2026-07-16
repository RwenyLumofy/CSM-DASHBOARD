import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/config";

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _rawSql: postgres.Sql | null = null;

/**
 * Lazily create the Drizzle client over the Supabase pooled connection.
 * `prepare: false` is required for Supabase's transaction-mode pooler
 * (pgbouncer on port 6543), which the app should use on Vercel.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!_db) {
    // Pool size per lambda. CONFIRMED (not guessed) via a live read of
    // pg_stat_activity on 2026-07-06: max_connections is 60, and only ~18
    // were in use — meaning the DB itself has 40+ spare slots. The actual
    // bottleneck was this number: a single client-profile page fires ~8-9
    // concurrent reads (attachments/deals/contacts/emails/meetings/property
    // defs/team members/role labels/actions), so at max=6 at least 2 of them
    // ALWAYS had to queue for a free connection on every single profile view.
    // That queueing is what pushed queries past withDbTimeout's 45s bound —
    // and because withDbTimeout only races the caller (see its own comment
    // below), a query that loses that race keeps running orphaned: the same
    // live read caught 4 backends stuck in `active`/`ClientRead` for 54s-24
    // MINUTES, running exactly the queries this app issues (notifications,
    // workspace_config, app_users role lookup, an emails scan) — connections
    // that will never come back to the pool on their own. Raising max to 20
    // gives a single page's peak concurrency room to run without queueing, so
    // queries finish well under 45s and stop tripping withDbTimeout/orphaning
    // connections in the first place — comfortably inside the 60-connection
    // ceiling even with a few warm lambda instances at once. If this pool
    // pressure returns, the next lever is making a stuck query cancellable
    // (postgres.js queries expose .cancel(), but Drizzle's query builder
    // doesn't forward it — would need raw sql`` at each hot call site), not
    // another blind bump to this number.
    const isProd = process.env.NODE_ENV === "production";
    const max = isProd ? 20 : 10;
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
    _rawSql = sql;
    _db = drizzle(sql, { schema });
  }
  return _db;
}

/**
 * The raw postgres.js client underlying getDb() — the SAME singleton pool
 * (no second/duplicate pool). Needed for genuinely CANCELLABLE queries (see
 * withCancellableDbTimeout below): a tagged-template call via this client
 * (`getRawSql()\`select ...\``) returns a PendingQuery with `.cancel()`,
 * which Drizzle's own query-builder result does not expose.
 */
export function getRawSql(): postgres.Sql {
  getDb(); // ensures _rawSql is initialized as a side effect
  return _rawSql!;
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        console.warn(`[db] query timed out after ${ms}ms, called from: ${stackHint}`);
        reject(new Error(`DB read timed out after ${ms}ms`));
      }, ms);
    }),
    // The timer MUST be cleared when the query wins the race. Promise.race
    // settles on the first result but does nothing to the loser, so without
    // this every SUCCESSFUL query still fired its callback `ms` later and
    // logged "[db] query timed out after 45000ms" — a warning about a read
    // that had already returned, naming a real call site, 45s after the fact.
    // Every page load produced one per query (4 on a typical /reports render,
    // long after a clean 200), which made the log read like the pool was
    // permanently stalling and sent an investigation after connection
    // exhaustion that pg_stat_activity then showed wasn't happening (11/60
    // connections, zero stuck backends). withCancellableDbTimeout below always
    // cleared its timer; this one never did.
    //
    // .finally rather than .then/.catch: it must fire on BOTH paths, and it
    // deliberately returns nothing so it can never win the race itself.
  ]).finally(() => clearTimeout(timer));
}

/**
 * Like withDbTimeout, but for a RAW postgres.js query (a tagged-template
 * call via getRawSql()`...`, which exposes `.cancel()`) instead of a Drizzle
 * query-builder promise. On timeout this actually CANCELS the query — sends
 * a real Postgres CancelRequest so the backend connection is freed and
 * returned to the pool — instead of merely abandoning it the way
 * withDbTimeout does (see its own comment above). That distinction matters:
 * a live read of pg_stat_activity on 2026-07-06 caught connections orphaned
 * by exactly that abandon-without-cancel gap sitting stuck for up to 24
 * minutes, each one permanently unavailable to the pool until the lambda
 * instance was recycled.
 *
 * DELIBERATELY NOT a drop-in replacement for withDbTimeout everywhere: it
 * only works for a query whose result keys ALREADY match the DB's own column
 * names. Verified empirically (a live side-by-side diff against Drizzle's
 * own output, 2026-07-06): a plain multi-column `db.select().from(table)`
 * does its camelCase remapping (e.g. `hubspot_id` -> `hubspotId`) inside
 * Drizzle's own JS code, NOT via SQL aliasing — so bypassing Drizzle for a
 * general multi-column select would silently hand every mapper function the
 * wrong keys. Only reach for this where the column name and the desired JS
 * key are identical (e.g. `role`, `id`) — confirmed case by case, not assumed.
 */
export function withCancellableDbTimeout<T>(query: { cancel(): void } & PromiseLike<T>, ms = 45_000): Promise<T> {
  const stackHint = new Error().stack?.split("\n")[2]?.trim() ?? "unknown call site";
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[db] query timed out after ${ms}ms, CANCELLING, called from: ${stackHint}`);
      query.cancel();
      reject(new Error(`DB read timed out after ${ms}ms (cancelled)`));
    }, ms);
    query.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export { schema };
