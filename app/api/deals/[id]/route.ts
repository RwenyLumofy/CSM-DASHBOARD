import { NextResponse } from "next/server";
import { setDealTracked } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dealId = decodeURIComponent(id);
    const body = await req.json();

    if (typeof body.tracked === "boolean") {
      await setDealTracked(dealId, body.tracked);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
