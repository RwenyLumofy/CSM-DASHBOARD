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
  if (!secret) return true;
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
 * sync (buildUnifiedData → persistSync → runAssignment for new logos) — this
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

    let assignment: unknown = null;
    if (res.newClientIds.length > 0) {
      try {
        const { runAssignment } = await import("@/lib/assignment/run");
        assignment = await runAssignment(res.newClientIds);
      } catch (e) {
        warnings.push(`Auto-assignment failed: ${e}`);
      }
    }

    return NextResponse.json({
      ok: true,
      requested: companyIds.length,
      added: bundle.clients.length,
      deals: bundle.deals.length,
      newClientIds: res.newClientIds,
      assignment,
      warnings,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
