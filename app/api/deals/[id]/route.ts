import { NextResponse } from "next/server";
import { setDealTracked, setDealScopedProperty, getClientById } from "@/lib/data";
import { canEditClient } from "@/lib/auth";
import { withDbTimeout } from "@/lib/db/client";
import { DEAL_OVERRIDES_KEY, DEAL_DATES_KEY, DEAL_BRIEFS_KEY } from "@/lib/deal-overrides";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body key → the client-properties bag it writes, for the per-deal edits.
 *  Each carries only ONE deal's entry — never the whole bag, which is what
 *  made two CSMs on one account overwrite each other (findings §9). */
const BAGS: Record<string, string> = {
  overrides: DEAL_OVERRIDES_KEY,
  dates: DEAL_DATES_KEY,
  brief: DEAL_BRIEFS_KEY,
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dealId = decodeURIComponent(id);
    const body = await req.json();

    const bagEdits = Object.keys(BAGS).filter((k) => k in body);
    const wantsTracked = typeof body.tracked === "boolean";
    if (!wantsTracked && bagEdits.length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }

    // Ownership check, once, for whatever this request turns out to be. Had no
    // check at all before the tracked toggle got one — a CSM could PATCH any
    // deal id, not just one on a client they own. Resolve which client the deal
    // belongs to and gate on the same canEditClient() every other client
    // mutation goes through.
    const { getDealClientId } = await import("@/lib/repo/drizzle");
    const clientId = await withDbTimeout(getDealClientId(dealId));
    if (!clientId) return NextResponse.json({ ok: false, error: "Deal not found." }, { status: 404 });
    const client = await getClientById(clientId);
    if (!(await canEditClient(client))) {
      return NextResponse.json(
        { ok: false, error: "You don't have permission to edit this account." },
        { status: 403 },
      );
    }

    if (wantsTracked) {
      await setDealTracked(dealId, body.tracked);
    }
    for (const key of bagEdits) {
      const value = body[key] as Record<string, unknown> | string | null;
      // null removes this deal's entry — the last field on it was cleared.
      if (value !== null && typeof value !== "object" && typeof value !== "string") {
        return NextResponse.json({ ok: false, error: `Invalid ${key} payload.` }, { status: 400 });
      }
      await setDealScopedProperty(clientId, BAGS[key], dealId, value);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
