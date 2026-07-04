import { NextResponse } from "next/server";
import { env, integrations, hasDatabase } from "@/lib/config";
import { runSync } from "@/lib/integrations/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Temporarily throttled for Vercel Hobby's 300s function ceiling — original
// design value was 800. See VERCEL-PLAN-CHANGES.md for the revert checklist.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  if (!env.syncSecret) return true; // open in dev when no secret is set
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const url = new URL(req.url);
  const qp = url.searchParams.get("secret") ?? "";
  return bearer === env.syncSecret || qp === env.syncSecret;
}

/** Report which sources are configured and the current sync checkpoint. */
export async function GET() {
  let lastSyncedAt: string | null = null;
  if (hasDatabase()) {
    const { getSyncCheckpoint } = await import("@/lib/repo/drizzle");
    lastSyncedAt = await getSyncCheckpoint("last_synced_at").catch(() => null);
  }
  return NextResponse.json({
    sources: { hubspot: integrations.hubspot(), intercom: integrations.intercom(), metabase: integrations.metabase() },
    database: hasDatabase(),
    mode: hasDatabase() ? "live" : "sample",
    lastSyncedAt,
  });
}

/**
 * Run an incremental sync (only deals modified since the last checkpoint). This
 * never overwrites CSM overrides (they live in client.properties jsonb). The
 * destructive "full re-sync" is intentionally NOT exposed here — it lives in a
 * Clerk-protected, super-admin-gated server action (see settings/actions.ts) so
 * it can never be triggered against this open endpoint.
 */
export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/sync — wipe all HubSpot-sourced data and reset the checkpoint
 * so the next POST picks up only deals that close from this moment forward.
 */
export async function DELETE(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ ok: false, error: "No database configured." }, { status: 400 });
  }
  try {
    const { clearHubspotData, setSyncCheckpoint } = await import("@/lib/repo/drizzle");
    const deleted = await clearHubspotData();
    const now = new Date().toISOString();
    await setSyncCheckpoint("last_synced_at", now);
    return NextResponse.json({ ok: true, deleted, checkpointReset: now });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
