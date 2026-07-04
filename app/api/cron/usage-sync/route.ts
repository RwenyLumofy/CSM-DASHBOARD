import { NextRequest, NextResponse } from "next/server";
import { syncAllClientUsage } from "@/lib/usage/sync";

// Cadence + maxDuration below are BOTH temporarily throttled for Vercel
// Hobby's free-plan limits — not the original design. See
// VERCEL-PLAN-CHANGES.md for original values and the revert checklist.
export const runtime = "nodejs";
export const maxDuration = 300;

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
