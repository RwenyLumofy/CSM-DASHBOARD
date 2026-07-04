import { NextRequest, NextResponse } from "next/server";
import { syncProfileCompletenessNotifications } from "@/lib/notifications/profile-completeness-sync";

// Runs once/day by design (unlike sync/usage-sync, this was never intended to
// be more frequent — "daily red reminder" is the actual spec). Scheduled at
// "0 7 * * *" in vercel.json, an hour after /api/cron/sync's "0 6 * * *", so
// completeness checks reflect that day's freshly-synced deal data rather than
// yesterday's. Keep it after sync if either schedule ever moves.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncProfileCompletenessNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/profile-completeness] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
