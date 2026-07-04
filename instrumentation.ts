/**
 * Next.js instrumentation hook (runs once at server startup).
 *
 * In development only, keep the dev server alive when a stray promise rejects
 * (e.g. a Postgres query that loses its connection or hits the pooler's
 * statement timeout while the page that started it has already errored). Such
 * a rejection would otherwise become an unhandledRejection and kill `next dev`
 * — the "server is not opened" symptom. We log it loudly instead of crashing.
 *
 * Production is left untouched so real defects still surface.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;

  process.on("unhandledRejection", (reason) => {
    console.error("[dev] Unhandled promise rejection (dev server kept alive):", reason);
  });
}
