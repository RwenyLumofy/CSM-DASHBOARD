import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/integrations/sync";

export const runtime = "nodejs";
// Full engagement pull runs over ALL clients (~5 min). 800 is the fluid-compute
// ceiling; Vercel auto-caps to the plan max if lower.
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
