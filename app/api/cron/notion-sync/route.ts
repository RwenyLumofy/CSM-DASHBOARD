import { NextRequest, NextResponse } from "next/server";
import { syncClientsToNotion } from "@/lib/integrations/notion-sync";

// Runs once a week, Sundays 05:00 UTC ("0 5 * * 0" in vercel.json) — 08:00 in
// Riyadh, the start of the working week. It exports whatever the clients table
// holds at that moment; the daily health recompute runs later in the morning
// (09:00 UTC), so the health columns are Saturday's.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  // Same rule as the other cron routes: a missing CRON_SECRET is a refusal in
  // production, not a free pass.
  if (!process.env.CRON_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncClientsToNotion();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/notion-sync] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
