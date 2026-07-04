import { NextResponse } from "next/server";
import { getCsmUsers } from "@/lib/data";
import { SAMPLE_CSMS } from "@/lib/sample/csms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const csms = await getCsmUsers();
  return NextResponse.json({ ok: true, csms });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email } = body as { name?: string; email?: string };
    if (!name || !email) {
      return NextResponse.json({ ok: false, error: "name and email are required" }, { status: 400 });
    }
    const id = body.id ?? email.split("@")[0];
    const initials = (body.initials as string | undefined) ??
      name.split(/\s+/).map((w: string) => w[0] ?? "").join("").toUpperCase().slice(0, 2);

    const { upsertCsmUser } = await import("@/lib/repo/drizzle");
    await upsertCsmUser({ id, name, email: email.toLowerCase(), initials });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

/** GET /api/admin/csm-users?seed=1 — seeds the known Lumofy CSMs on first run. */
export async function PUT() {
  try {
    const { upsertCsmUser } = await import("@/lib/repo/drizzle");
    for (const csm of Object.values(SAMPLE_CSMS)) {
      if (csm.email) await upsertCsmUser({ id: csm.id, name: csm.name, email: csm.email, initials: csm.initials });
    }
    return NextResponse.json({ ok: true, seeded: Object.keys(SAMPLE_CSMS).length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
