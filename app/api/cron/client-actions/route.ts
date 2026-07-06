import { NextRequest, NextResponse } from "next/server";
import { generateAllClientActions } from "@/lib/actions/generate";

// Regenerates the AI action feed for every client once a day. Scheduled at
// "0 8 * * *" in vercel.json — after /api/cron/sync ("0 6") and
// /api/cron/profile-completeness ("0 7"), so actions reflect that day's fresh
// deal + completeness data. Each client does a (cached) usage read and, when
// GEMINI_API_KEY is set, one Gemini call; without the key the feed still fills
// from deterministic templates. maxDuration is generous for the fan-out.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await generateAllClientActions();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/client-actions] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
