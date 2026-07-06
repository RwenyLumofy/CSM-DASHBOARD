import { NextRequest, NextResponse } from "next/server";
import { syncAllClientUsage } from "@/lib/usage/sync";

// Runs every 4 hours (vercel.json), 15 min after /api/cron/sync so it reflects
// that cycle's fresh deal data. maxDuration 800 gives the per-client Metabase
// fan-out headroom on Pro.
export const runtime = "nodejs";
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
