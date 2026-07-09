import { NextRequest, NextResponse } from "next/server";
import { syncSurveyResponses } from "@/lib/support/survey-sync";

// Runs once daily (vercel.json) a little BEFORE /api/cron/intercom-sync, so the
// survey_responses store is fresh when the support sync recomputes each
// account's NPS + platform CSAT from it. Isolated from the support sync because
// the Intercom Data Export job is slow (minutes) — see lib/support/survey-sync.ts.
export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncSurveyResponses();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/survey-sync] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
