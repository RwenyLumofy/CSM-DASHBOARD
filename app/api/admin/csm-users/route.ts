import { NextResponse } from "next/server";
import { getCsmUsers } from "@/lib/data";
import { isAdminOrSuper } from "@/lib/auth";
import { SAMPLE_CSMS } from "@/lib/sample/csms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const csms = await getCsmUsers();
  return NextResponse.json({ ok: true, csms });
}

// POST/PUT write to the CSM directory (creates/overwrites app_users' merged CSM
// list) — this had NO auth check at all beyond middleware's "is signed in",
// meaning any authenticated user (not just an admin) could add or corrupt CSM
// records. Reads stay open (the CSM directory isn't sensitive), writes don't.
export async function POST(req: Request) {
  if (!(await isAdminOrSuper())) {
    return NextResponse.json({ ok: false, error: "Only an admin can manage CSM users." }, { status: 403 });
  }
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

/** Seeds the known Lumofy CSMs on first run. */
export async function PUT() {
  if (!(await isAdminOrSuper())) {
    return NextResponse.json({ ok: false, error: "Only an admin can manage CSM users." }, { status: 403 });
  }
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
