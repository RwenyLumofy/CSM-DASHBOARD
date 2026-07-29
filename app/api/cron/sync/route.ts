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
  // An unset CRON_SECRET used to skip this check entirely, leaving every
  // cron route open — and .env.example never prompted for the variable.
  // Missing config is now a refusal in production, not a free pass.
  if (!process.env.CRON_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (secret !== process.env.CRON_SECRET) {
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
