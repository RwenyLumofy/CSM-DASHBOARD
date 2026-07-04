import { NextRequest, NextResponse } from "next/server";
import { syncProfileCompletenessNotifications } from "@/lib/notifications/profile-completeness-sync";

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
