import { NextResponse } from "next/server";
import { assignCsm, updateClientDetails } from "@/lib/data";
import { canSeeClient, canEditClient, isAdminOrSuper, getCurrentUserRole } from "@/lib/auth";
import { permissionTier } from "@/lib/roles";
import { withDbTimeout } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Property keys that are shared team knowledge rather than owner-private data.
// A PATCH touching ONLY these is editable by any non-guest on any account (see
// the collaborative carve-out in PATCH) — the whole CS team co-maintains them.
const COLLABORATIVE_PROPERTY_KEYS = new Set(["stakeholder_mappings"]);

/** True when the body is a properties-only edit whose keys are all in the
 *  collaborative allowlist — no field edits, no owner changes. */
function isCollaborativePropsOnly(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (b.fields || "csmId" in b || "implementationOwnerEmail" in b) return false;
  const props = b.properties;
  if (!props || typeof props !== "object") return false;
  const keys = Object.keys(props as Record<string, unknown>);
  return keys.length > 0 && keys.every((k) => COLLABORATIVE_PROPERTY_KEYS.has(k));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const { getClientByIdFromDb } = await import("@/lib/repo/drizzle");
    const target = await withDbTimeout(getClientByIdFromDb(id));

    // Collaborative carve-out: stakeholder mapping is shared team knowledge, not
    // owner-private data — the whole CS team maintains it together. So a
    // stakeholder-mapping-only edit is allowed on ANY account for any signed-in
    // non-guest, bypassing the owner-scope gate below (which otherwise 403s a
    // CSM editing an account they don't own, and — because the Save button was
    // fire-and-forget — silently lost the map). Still gated to a real account
    // and a non-guest role, and scoped to COLLABORATIVE_PROPERTY_KEYS only, so
    // owner-sensitive fields keep their IDOR protection.
    if (isCollaborativePropsOnly(body)) {
      const role = await getCurrentUserRole();
      if (!role || permissionTier(role) === "guest") {
        return NextResponse.json({ ok: false, error: "You don't have permission to edit this account." }, { status: 403 });
      }
      if (!target) {
        return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      }
      await updateClientDetails(id, { properties: body.properties });
      return NextResponse.json({ ok: true });
    }

    // Authorize the WRITE the same way reads are scoped: a user may only edit a
    // client they own (their csm/implementation client) — or a super-admin, any.
    // Without this, fields/properties-only edits would be an IDOR (any signed-in
    // user could PATCH any client by guessing its id).
    // 404 if you can't even see it (don't reveal existence to id-guessers);
    // 403 if you can see it but can't edit it (guests / non-owner operators).
    if (!(await canSeeClient(target))) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }
    if (!(await canEditClient(target))) {
      return NextResponse.json({ ok: false, error: "You don't have permission to edit this account." }, { status: 403 });
    }

    // Owner (re)assignment is super-admin only — the assignment workflow and the
    // profile Owners card are the canonical paths. Gate any csm/implementation
    // owner change here so legacy inline pickers can't bypass it.
    const ownerChange = "csmId" in body || "implementationOwnerEmail" in body;
    if (ownerChange && !(await isAdminOrSuper())) {
      return NextResponse.json({ ok: false, error: "Admin access required to reassign owners." }, { status: 403 });
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
