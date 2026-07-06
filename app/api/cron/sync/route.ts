import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/integrations/sync";

// Runs every 4 hours (vercel.json) to keep auto-assignment and ARR/status
// fresh through the day. maxDuration 800 gives a full sync headroom on Pro;
// sync is idempotent + checkpoint-based, so a cut-off run just does less work
// and the next cycle resumes cleanly.
export const runtime = "nodejs";
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/sync] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
