/* =========================================================================
   Survey response sync — pulls the Intercom outbound survey (NPS + platform
   CSAT) via the slow async Data Export API and appends the raw responses to
   survey_responses (idempotent by receipt id). Runs as its own daily cron
   (/api/cron/survey-sync) scheduled a little BEFORE the support sync so the
   per-account NPS/platform-CSAT it recomputes reads fresh rows. Kept out of
   syncAllClientSupport itself because the export job can take many minutes —
   isolating it means a slow/failed export can never delay or fail the
   conversation-based support+SLA refresh.

   The window is intentionally small (a few days) for the daily top-up; the
   full history is loaded once by scripts/backfill-surveys.mjs. Because the
   store is keyed by receipt id, overlapping windows are harmless.
   ========================================================================= */

import "server-only";
import { IntercomClient } from "@/lib/integrations/intercom";
import { integrations } from "@/lib/config";

export interface SurveySyncSummary {
  ok: boolean;
  written: number;
  windowDays: number;
  skipped?: boolean;
  error?: string;
  durationMs: number;
}

export async function syncSurveyResponses(opts: { sinceDays?: number } = {}): Promise<SurveySyncSummary> {
  const start = Date.now();
  const windowDays = opts.sinceDays ?? 3;
  const done = (extra: Partial<SurveySyncSummary>): SurveySyncSummary => ({
    ok: false, written: 0, windowDays, durationMs: Date.now() - start, ...extra,
  });

  if (!integrations.intercom()) return done({ skipped: true, error: "Intercom not configured" });

  const before = new Date();
  const after = new Date(before.getTime() - windowDays * 86_400_000);
  try {
    const ic = new IntercomClient();
    const responses = await ic.exportSurveyResponses({ after, before, pollTimeoutMs: 12 * 60_000 });
    const { upsertSurveyResponses } = await import("@/lib/repo/drizzle");
    const written = await upsertSurveyResponses(responses);
    return done({ ok: true, written });
  } catch (e) {
    return done({ error: String(e) });
  }
}
