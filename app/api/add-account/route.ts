import { NextResponse } from "next/server";
import { env, hasDatabase } from "@/lib/config";
import { integrations } from "@/lib/config";
import { buildUnifiedData } from "@/lib/integrations/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Same auth as /api/sync and /api/churn-import: a dedicated SYNC_SECRET,
// falling back to CRON_SECRET. Open only in local dev when neither is set.
function authorized(req: Request): boolean {
  const secret = env.syncSecret || env.cronSecret;
  // FAIL CLOSED IN PRODUCTION. This used to `return true` whenever no secret
  // was configured, so a deployment that never set SYNC_SECRET/CRON_SECRET
  // left every one of these endpoints — including the DELETE that wipes all
  // HubSpot-sourced data — open to the internet. An unset secret is a
  // misconfiguration, not permission. Local dev keeps the open path.
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const qp = new URL(req.url).searchParams.get("secret") ?? "";
  return bearer === secret || qp === secret;
}

/**
 * POST /api/add-account — one-off backfill for a single (or a few) HubSpot
 * company id(s) whose qualifying deal wasn't itself touched inside a normal
 * incremental sync's window, so the regular "Sync now" never re-discovers it
 * (e.g. a reactivation that only flips the company's lifecycle stage, not its
 * deal). Reuses the exact same assembly + persistence path as the recurring
 * sync (buildUnifiedData → persistSync) — this
 * does NOT change how the recurring sync itself discovers companies.
 *
 * Body: { "companyIds": ["<hubspot company id>", ...] }
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

  const body = await req.json().catch(() => ({}));
  const companyIds: string[] = Array.isArray(body?.companyIds) ? body.companyIds.filter((x: unknown) => typeof x === "string") : [];
  if (companyIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Provide { companyIds: string[] } — HubSpot company ids to add." }, { status: 400 });
  }

  try {
    const { persistSync } = await import("@/lib/repo/drizzle");
    const { bundle, warnings } = await buildUnifiedData({ companyIds });
    const res = await persistSync(bundle);

    /* New accounts used to be auto-assigned a CSM and an Implementation owner
       here. That engine was removed: it was routing by ARR band and least-loaded
       owner, which never matched how the team actually assigns, so its output
       was overridden by hand every time. New accounts now arrive unowned and
       are assigned deliberately. */

    return NextResponse.json({
      ok: true,
      requested: companyIds.length,
      added: bundle.clients.length,
      deals: bundle.deals.length,
      newClientIds: res.newClientIds,
      warnings,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
