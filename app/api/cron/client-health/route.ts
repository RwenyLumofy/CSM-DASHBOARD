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
    const { transitions, ...result } = await recomputeAllClientHealth();
    /* Only THIS caller notifies. The Settings formula-save actions run the same
       sweep and deliberately ignore their transitions — see the comment on
       recomputeAllClientHealth and lib/notifications/health-change-sync.ts. */
    const { syncHealthChangeNotifications } = await import("@/lib/notifications/health-change-sync");
    // A failure to notify must not fail the recompute: the scores are already
    // written and correct by this point, and reporting the whole run as failed
    // would invite a re-trigger that has nothing left to do.
    const health = await syncHealthChangeNotifications(transitions).catch((err) => {
      console.error("[cron/client-health] notification sync failed:", err);
      return null;
    });
    return NextResponse.json({ ok: true, ...result, notifications: health });
  } catch (err) {
    console.error("[cron/client-health] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
