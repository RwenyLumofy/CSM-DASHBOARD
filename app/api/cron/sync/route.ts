import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/integrations/sync";

// Cadence + maxDuration below are BOTH temporarily throttled for Vercel
// Hobby's free-plan limits (once/day cron, 300s function ceiling) — this is
// not the original design. Original values, why, and the exact revert
// checklist: see VERCEL-PLAN-CHANGES.md.
export const runtime = "nodejs";
export const maxDuration = 300;

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
