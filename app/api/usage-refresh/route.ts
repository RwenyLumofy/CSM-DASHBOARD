import { NextResponse } from "next/server";
import { env, hasDatabase } from "@/lib/config";
import { getClientUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same auth as /api/sync, /api/churn-import, /api/add-account.
function authorized(req: Request): boolean {
  const secret = env.syncSecret || env.cronSecret;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const qp = new URL(req.url).searchParams.get("secret") ?? "";
  return bearer === secret || qp === secret;
}

/**
 * POST /api/usage-refresh — force-refresh one client's Metabase usage
 * snapshot, bypassing both the in-process memo and the Postgres freshness
 * cache (same as the Usage tab's "Refresh" button, but scriptable). Useful
 * right after correcting a client's mixpanel_company_id in HubSpot.
 *
 * Body: { "clientId": "<client id>" }
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ ok: false, error: "No database configured." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const clientId: string | undefined = typeof body?.clientId === "string" ? body.clientId : undefined;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "Provide { clientId: string }." }, { status: 400 });
  }
  try {
    const result = await getClientUsage(clientId, { forceRefresh: true });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
