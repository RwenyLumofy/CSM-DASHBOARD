/* A tiny circuit-breaker for the database.

   When a DB read fails (e.g. the schema hasn't been migrated yet, or the
   connection is down), we briefly stop trying so that a page making several
   reads doesn't pay the full failure latency on every single call. Reads fall
   back to the in-memory sample store during the cooldown, then probe again. */

let unhealthyUntil = 0;
const COOLDOWN_MS = 30_000;

/** False while we're inside the post-failure cooldown window. */
export function dbHealthy(): boolean {
  return Date.now() >= unhealthyUntil;
}

/** Open the breaker after a failed DB read. */
export function markDbUnhealthy(): void {
  unhealthyUntil = Date.now() + COOLDOWN_MS;
}

/** Close the breaker after a successful DB read. */
export function markDbHealthy(): void {
  unhealthyUntil = 0;
}
