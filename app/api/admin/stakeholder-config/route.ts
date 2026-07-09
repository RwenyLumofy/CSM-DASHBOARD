import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/auth";
import { withDbTimeout } from "@/lib/db/client";

// workspaceConfig keys
const KEYS = ["stakeholder_types", "lumofy_staff", "attachment_categories"] as const;
type ConfigKey = (typeof KEYS)[number];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") as ConfigKey | null;
  if (!key || !KEYS.includes(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
  const value = await withDbTimeout(getWorkspaceConfigFromDb(key));
  return NextResponse.json({ value: value ?? (key === "stakeholder_types" ? [] : []) });
}

export async function PUT(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { key, value } = await req.json() as { key: ConfigKey; value: unknown };
  if (!key || !KEYS.includes(key)) return NextResponse.json({ error: "invalid key" }, { status: 400 });
  const { setWorkspaceConfigDb } = await import("@/lib/repo/drizzle");
  await setWorkspaceConfigDb(key, value);
  return NextResponse.json({ ok: true });
}
