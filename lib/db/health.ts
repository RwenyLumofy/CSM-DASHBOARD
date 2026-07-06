/* A tiny circuit-breaker for the database.

   When DB reads genuinely fail (the schema isn't migrated yet, or the
   connection is down), we briefly stop trying so a page making several reads
   doesn't pay the full failure latency on every single call, then probe again.

   IMPORTANT — why it takes TWO failures to open, not one:
   A single read that merely times out under load (a slow cross-region query,
   not an outage) must NOT blank the whole app. Previously one thrown read
   opened the breaker for 30s, during which the clients list (and every other
   read) short-circuited to empty WITHOUT querying — so navigating into a
   company and back showed an empty client list until the cooldown expired
   ("the companies got lost"). Requiring consecutive failures means a lone
   transient is tolerated (that one read still degrades, but the next render
   queries normally), while a truly-down DB — where every concurrent read
   fails — still trips the breaker after the second failure. The cooldown is
   also short so even a real blip clears within seconds. */

let unhealthyUntil = 0;
let consecutiveFailures = 0;
const COOLDOWN_MS = 10_000;
const FAILURES_TO_OPEN = 2;

/** False while we're inside the post-failure cooldown window. */
export function dbHealthy(): boolean {
  return Date.now() >= unhealthyUntil;
}

/** Record a failed DB read; open the breaker only once failures are repeated
 *  (a single slow/timed-out read shouldn't blank the app). */
export function markDbUnhealthy(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURES_TO_OPEN) {
    unhealthyUntil = Date.now() + COOLDOWN_MS;
  }
}

/** Close the breaker after a successful DB read and reset the failure streak. */
export function markDbHealthy(): void {
  consecutiveFailures = 0;
  unhealthyUntil = 0;
}
