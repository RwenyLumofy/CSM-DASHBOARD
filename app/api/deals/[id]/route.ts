import { NextResponse } from "next/server";
import { setDealTracked, getClientById } from "@/lib/data";
import { canSeeClient } from "@/lib/auth";
import { withDbTimeout } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dealId = decodeURIComponent(id);
    const body = await req.json();

    if (typeof body.tracked === "boolean") {
      // Had no ownership check at all — a CSM could PATCH any deal id, not
      // just one on a client they own. Look up which client the deal belongs
      // to and gate on the same canSeeClient() every other client mutation
      // already goes through.
      const { getDealClientId } = await import("@/lib/repo/drizzle");
      const clientId = await withDbTimeout(getDealClientId(dealId));
      if (!clientId) return NextResponse.json({ ok: false, error: "Deal not found." }, { status: 404 });
      const client = await getClientById(clientId);
      if (!(await canSeeClient(client))) {
        return NextResponse.json({ ok: false, error: "Not authorized for this client." }, { status: 403 });
      }
      await setDealTracked(dealId, body.tracked);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
