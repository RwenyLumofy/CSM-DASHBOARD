import { NextRequest, NextResponse } from "next/server";
import { syncAllClientSupport } from "@/lib/support/sync";

// Runs once daily (vercel.json), ahead of /api/cron/client-actions so the
// SLA-breach signal has fresh data by the time actions regenerate. Separate
// from the 4-hourly HubSpot sync — Intercom's full-export endpoints are too
// heavy to re-pull every 4 hours (see lib/support/sync.ts).
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
    const result = await syncAllClientSupport();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/intercom-sync] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
