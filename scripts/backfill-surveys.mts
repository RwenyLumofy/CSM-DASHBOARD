/**
 * One-off historical backfill of Intercom outbound-survey responses (NPS +
 * platform CSAT) into survey_responses. The daily cron (/api/cron/survey-sync)
 * only tops up the last few days; this loads the whole history once.
 *
 * Walks BACKWARD from now in fixed windows and stops automatically once it hits
 * STOP_AFTER_EMPTY consecutive windows with zero survey responses — i.e. it has
 * gone past when the survey first launched — so we get all history without
 * knowing the launch date or wasting slow export jobs on pre-launch windows.
 * Each window is upserted immediately (idempotent by receipt id), so progress
 * persists even if the run is interrupted; just re-run to resume.
 *
 * Env (optional, via --env-file=.env.local plus overrides):
 *   BACKFILL_WINDOW_DAYS   window size in days              (default 90)
 *   BACKFILL_STOP_EMPTY    consecutive empty windows = stop (default 2)
 *   BACKFILL_FLOOR         hard earliest date, YYYY-MM-DD   (default 2024-01-01)
 *   BACKFILL_END           latest date, YYYY-MM-DD          (default: now)
 *
 * Usage: npx tsx --env-file=.env.local scripts/backfill-surveys.mts
 */
import { IntercomClient } from "../lib/integrations/intercom";
import { upsertSurveyResponses } from "../lib/repo/drizzle";

const WINDOW_MS = Number(process.env.BACKFILL_WINDOW_DAYS ?? 90) * 86_400_000;
const STOP_AFTER_EMPTY = Number(process.env.BACKFILL_STOP_EMPTY ?? 2);
const FLOOR = new Date(`${process.env.BACKFILL_FLOOR ?? "2024-01-01"}T00:00:00.000Z`);
const END = process.env.BACKFILL_END ? new Date(`${process.env.BACKFILL_END}T00:00:00.000Z`) : new Date();

const ic = new IntercomClient();
if (!ic.configured) {
  console.error("INTERCOM_ACCESS_TOKEN is not set — nothing to do.");
  process.exit(1);
}

console.log(`Backfilling surveys backward from ${END.toISOString().slice(0, 10)} in ${WINDOW_MS / 86_400_000}-day windows`);
console.log(`(stops after ${STOP_AFTER_EMPTY} consecutive empty windows; hard floor ${FLOOR.toISOString().slice(0, 10)}).\n`);

let before = END;
let consecutiveEmpty = 0;
let totalResponses = 0;
let totalWritten = 0;
const failed: string[] = [];

while (before > FLOOR && consecutiveEmpty < STOP_AFTER_EMPTY) {
  const after = new Date(Math.max(before.getTime() - WINDOW_MS, FLOOR.getTime()));
  const label = `${after.toISOString().slice(0, 10)} → ${before.toISOString().slice(0, 10)}`;
  process.stdout.write(`[${label}] exporting`);
  try {
    const responses = await ic.exportSurveyResponses({
      after,
      before,
      pollTimeoutMs: 30 * 60_000,
      onLog: () => process.stdout.write("."),
    });
    const written = await upsertSurveyResponses(responses);
    totalResponses += responses.length;
    totalWritten += written;
    consecutiveEmpty = responses.length === 0 ? consecutiveEmpty + 1 : 0;
    console.log(` → ${responses.length} responses, upserted ${written}. (running total: ${totalWritten}${responses.length === 0 ? `, empty ${consecutiveEmpty}/${STOP_AFTER_EMPTY}` : ""})`);
  } catch (e) {
    console.log(` → FAILED: ${e}`);
    failed.push(label);
    // A failed window is inconclusive — don't count it toward the empty-stop.
  }
  before = after;
}

console.log(`\nDone. ${totalResponses} responses seen, ${totalWritten} rows upserted across the survey's history.`);
if (consecutiveEmpty >= STOP_AFTER_EMPTY) console.log(`Stopped early: reached ${STOP_AFTER_EMPTY} consecutive empty windows (before the survey launched).`);
if (failed.length) console.log(`Failed windows (re-run to retry, they're idempotent):\n  ${failed.join("\n  ")}`);
process.exit(0);
