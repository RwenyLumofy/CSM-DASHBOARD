import { NextResponse } from "next/server";
import { env, integrations, hasDatabase } from "@/lib/config";
import { importChurnedClients } from "@/lib/integrations/churn-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One-time backfill can touch ~56 companies + their deals — same headroom as
// the sync route.
export const maxDuration = 800;

// Same auth as /api/sync: a dedicated SYNC_SECRET, falling back to CRON_SECRET.
// Open only in local dev when NEITHER secret is set.
function authorized(req: Request): boolean {
  const secret = env.syncSecret || env.cronSecret;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const qp = new URL(req.url).searchParams.get("secret") ?? "";
  return bearer === secret || qp === secret;
}

/**
 * POST /api/churn-import — the one-time churned-account backfill. Pulls every
 * HubSpot company in the Churn lifecycle stage (customer_type ~ "arr") into the
 * app as a churned client with its deals + churn-dated ARR ledger events. Safe
 * to re-run (idempotent). Does NOT run on any cron and does NOT touch the
 * recurring acquisition/engagement sync.
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ ok: false, error: "No database configured." }, { status: 400 });
  }
  if (!integrations.hubspot()) {
    return NextResponse.json({ ok: false, error: "HubSpot is not configured (set HUBSPOT_ACCESS_TOKEN)." }, { status: 400 });
  }
  try {
    const result = await importChurnedClients();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
