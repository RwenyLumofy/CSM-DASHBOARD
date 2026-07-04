import { NextResponse } from "next/server";
import { assignCsm, updateClientDetails } from "@/lib/data";
import { canSeeClient, isSuperAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Authorize the WRITE the same way reads are scoped: a user may only edit a
    // client they own (their csm/implementation client) — or a super-admin, any.
    // Without this, fields/properties-only edits would be an IDOR (any signed-in
    // user could PATCH any client by guessing its id).
    const { getClientByIdFromDb } = await import("@/lib/repo/drizzle");
    const target = await getClientByIdFromDb(id);
    if (!(await canSeeClient(target))) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    // Owner (re)assignment is super-admin only — the assignment workflow and the
    // profile Owners card are the canonical paths. Gate any csm/implementation
    // owner change here so legacy inline pickers can't bypass it.
    const ownerChange = "csmId" in body || "implementationOwnerEmail" in body;
    if (ownerChange && !(await isSuperAdmin())) {
      return NextResponse.json({ ok: false, error: "Super-admin access required to reassign owners." }, { status: 403 });
    }

    // Lightweight CSM-only path (the inline assign button).
    if ("csmId" in body && !body.fields && !body.properties && !("implementationOwnerEmail" in body)) {
      await assignCsm(id, body.csmId ?? null);
      return NextResponse.json({ ok: true });
    }

    await updateClientDetails(id, {
      fields: body.fields,
      properties: body.properties,
      csmId: body.csmId,
      implementationOwnerEmail: body.implementationOwnerEmail,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
