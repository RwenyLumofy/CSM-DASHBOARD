import { NextRequest, NextResponse } from "next/server";
import { recomputeAllClientHealth } from "@/lib/repo/drizzle";

// Runs once daily (vercel.json), after intercom-sync/usage-sync/client-actions
// so it reads same-day-fresh support + usage data. Also triggered on demand
// right after a super-admin saves a new formula in Settings → Workflows →
// Client health (app/(app)/settings/workflow-actions.ts).
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recomputeAllClientHealth();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/client-health] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
