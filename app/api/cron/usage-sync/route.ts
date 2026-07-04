import { NextRequest, NextResponse } from "next/server";
import { syncAllClientUsage } from "@/lib/usage/sync";

// Intended cadence: every 4 hours ("15 */4 * * *" in vercel.json). Currently
// throttled to once/day ("20 6 * * *") — see the matching note in
// app/api/cron/sync/route.ts and README.md "Cron jobs" for why and how to revert.
export const runtime = "nodejs";
// Each client costs 3 Metabase queries; with ~5-way concurrency across the
// whole portfolio this can take a few minutes. Same ceiling as /api/cron/sync.
export const maxDuration = 800;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncAllClientUsage();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/usage-sync] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
